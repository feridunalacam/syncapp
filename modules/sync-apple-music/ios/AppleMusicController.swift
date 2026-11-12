import Foundation
import MusicKit

@available(iOS 16.0, *)
@MainActor
final class AppleMusicController {
  static let shared = AppleMusicController()
  private let player = ApplicationMusicPlayer.shared
  private var revision = 0
  private var queueRevision = 0
  private var accessUntil = Date.distantPast
  private var songs: [String: (Song, Date)] = [:]
  private var playlistsByID: [String: (Playlist, Date)] = [:]

  func connectionState() async throws -> [String: Any] {
    let status = MusicAuthorization.currentStatus
    let names: [MusicAuthorization.Status: String] = [
      .authorized: "authorized", .denied: "denied", .restricted: "restricted", .notDetermined: "notDetermined"
    ]
    var result: [String: Any] = ["status": names[status] ?? "denied", "canPlayCatalogContent": false]
    if status == .authorized {
      result["canPlayCatalogContent"] = try await canPlayCatalog()
    }
    return result
  }

  func authorize() async throws -> [String: Any] {
    _ = await MusicAuthorization.request()
    return try await connectionState()
  }

  private func requireAccess() async throws {
    guard MusicAuthorization.currentStatus == .authorized else {
      accessUntil = .distantPast
      songs.removeAll()
      playlistsByID.removeAll()
      throw failure("Music access is required.")
    }
    guard try await canPlayCatalog() else { throw failure("An Apple Music subscription is required.") }
  }

  private func canPlayCatalog() async throws -> Bool {
    if Date() < accessUntil { return true }
    let allowed = try await MusicSubscription.current.canPlayCatalogContent
    if allowed { accessUntil = Date().addingTimeInterval(30) }
    return allowed
  }

  func search(_ query: String, types: [String], limit: Int) async throws -> [String: Any] {
    try await requireAccess()
    var request = MusicCatalogSearchRequest(term: String(query.prefix(200)), types: [Song.self, Playlist.self])
    request.limit = max(1, min(limit, 25))
    let response = try await request.response()
    return [
      "tracks": types.contains("track") ? response.songs.filter { $0.playParameters != nil }.map { songData(remember($0)) } : [],
      "playlists": types.contains("playlist") ? response.playlists.map(playlistData) : []
    ]
  }

  func playlists() async throws -> [[String: Any]] {
    try await requireAccess()
    var request = MusicLibraryRequest<Playlist>()
    request.limit = 100
    var result: [[String: Any]] = []
    while true {
      let batch = try await request.response().items
      result.append(contentsOf: batch.map(playlistData))
      if batch.count < request.limit { break }
      request.offset += batch.count
    }
    return result
  }

  private func playlist(_ id: String) async throws -> Playlist {
    if let (item, until) = playlistsByID[id], Date() < until { return item }
    let item: Playlist?
    if id.hasPrefix("p.") {
      var request = MusicLibraryRequest<Playlist>()
      request.filter(matching: \.id, equalTo: MusicItemID(id))
      item = try await request.response().items.first
    } else {
      let request = MusicCatalogResourceRequest<Playlist>(matching: \.id, equalTo: MusicItemID(id))
      item = try await request.response().items.first
    }
    guard let item else { throw failure("This playlist is no longer available.") }
    if playlistsByID.count >= 32, let first = playlistsByID.keys.first { playlistsByID.removeValue(forKey: first) }
    playlistsByID[id] = (item, Date().addingTimeInterval(300))
    return item
  }

  func playlistTracks(_ id: String) async throws -> [[String: Any]] {
    try await requireAccess()
    let item = try await playlist(id).with([.tracks])
    var batch = item.tracks
    var result: [[String: Any]] = []
    while let current = batch {
      result.append(contentsOf: current.compactMap { track in
        if case let .song(song) = track, song.playParameters != nil { return songData(remember(song)) }
        return nil
      })
      batch = current.hasNextBatch ? try await current.nextBatch() : nil
    }
    return result
  }

  private func song(_ id: String) async throws -> Song {
    if let (item, until) = songs[id], Date() < until { return item }
    let song: Song?
    if id.hasPrefix("i.") {
      var request = MusicLibraryRequest<Song>()
      request.filter(matching: \.id, equalTo: MusicItemID(id))
      song = try await request.response().items.first
    } else {
      song = try await MusicCatalogResourceRequest<Song>(matching: \.id, equalTo: MusicItemID(id)).response().items.first
    }
    guard let song, song.playParameters != nil else { throw failure("This song is no longer available.") }
    return remember(song)
  }

  private func remember(_ song: Song) -> Song {
    if songs.count >= 32, let first = songs.keys.first { songs.removeValue(forKey: first) }
    songs[song.id.rawValue] = (song, Date().addingTimeInterval(300))
    return song
  }

  func playTrack(_ id: String) async throws -> [String: Any] {
    revision += 1
    let ticket = revision
    try await requireAccess()
    let song = try await song(id)
    guard ticket == revision else { return ["success": true, "cancelled": true] }
    player.queue = ApplicationMusicPlayer.Queue(for: [song])
    if #available(iOS 26.4, *) {
      player.queue.affectsListeningHistory = false
    }
    queueRevision = ticket
    return try await begin(ticket)
  }

  func playPlaylist(_ id: String, shuffle: Bool) async throws -> [String: Any] {
    revision += 1
    let ticket = revision
    try await requireAccess()
    let item = try await playlist(id)
    guard ticket == revision else { return ["success": true, "cancelled": true] }
    player.queue = ApplicationMusicPlayer.Queue(for: [item])
    if #available(iOS 26.4, *) {
      player.queue.affectsListeningHistory = false
    }
    queueRevision = ticket
    player.state.shuffleMode = shuffle ? .songs : .off
    return try await begin(ticket)
  }

  private func begin(_ ticket: Int) async throws -> [String: Any] {
    guard ticket == revision else { return ["success": true, "cancelled": true] }
    try await player.prepareToPlay()
    guard ticket == revision else { return ["success": true, "cancelled": true] }
    try await player.play()
    if ticket != revision {
      if queueRevision == ticket { player.pause() }
      return ["success": true, "cancelled": true]
    }
    return ["success": true, "deviceId": "appleMusic"]
  }

  func resume() async throws -> [String: Any] {
    revision += 1
    let ticket = revision
    try await requireAccess()
    guard ticket == revision else { return ["success": true, "cancelled": true] }
    queueRevision = ticket
    return try await begin(ticket)
  }

  func pause() -> [String: Any] {
    revision += 1
    player.pause()
    return ["success": true]
  }

  func stop(clearCache: Bool = true) {
    revision += 1
    player.stop()
    player.queue = []
    queueRevision = 0
    if clearCache {
      accessUntil = .distantPast
      songs.removeAll()
      playlistsByID.removeAll()
    }
  }

  func playback() -> [String: Any] {
    var result: [String: Any] = ["is_playing": player.state.playbackStatus == .playing, "progress_ms": player.playbackTime * 1000]
    if case let .song(song) = player.queue.currentEntry?.item {
      var item = songData(song)
      item["duration_ms"] = (song.duration ?? 0) * 1000
      result["item"] = item
    }
    return result
  }

  func setRepeat(_ mode: String) { player.state.repeatMode = mode == "track" ? .one : mode == "context" ? .all : MusicPlayer.RepeatMode.none }
  func setShuffle(_ enabled: Bool) { player.state.shuffleMode = enabled ? .songs : .off }
  func next() async throws { try await player.skipToNextEntry() }
  func previous() async throws { try await player.skipToPreviousEntry() }

  private func songData(_ song: Song) -> [String: Any] {
    ["id": song.id.rawValue, "name": song.title, "artist": song.artistName,
     "album": song.albumTitle ?? "", "duration": song.duration ?? 0,
     "image": AppleMusicArtwork.url(song.artwork),
     "uri": "apple-music:song:\(song.id.rawValue)", "platform": "appleMusic", "type": "track"]
  }

  private func playlistData(_ playlist: Playlist) -> [String: Any] {
    ["id": playlist.id.rawValue, "name": playlist.name, "artist": playlist.curatorName ?? "Apple Music",
     "image": AppleMusicArtwork.url(playlist.artwork),
     "platform": "appleMusic", "type": "playlist"]
  }

  private func failure(_ message: String) -> NSError { NSError(domain: "SyncAppleMusic", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
