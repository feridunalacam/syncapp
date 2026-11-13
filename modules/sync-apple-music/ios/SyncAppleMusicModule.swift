import ExpoModulesCore

public final class SyncAppleMusicModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SyncAppleMusic")
    Constant("supported") { if #available(iOS 16.0, *) { return true }; return false }
    AsyncFunction("authorize") { () async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.authorize()
    }
    AsyncFunction("getConnectionState") { () async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.connectionState()
    }
    AsyncFunction("search") { (query: String, types: [String], limit: Int) async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.search(query, types: types, limit: limit)
    }
    AsyncFunction("getUserPlaylists") { () async throws -> [[String: Any]] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.playlists()
    }
    AsyncFunction("getPlaylistTracks") { (id: String) async throws -> [[String: Any]] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.playlistTracks(id)
    }
    AsyncFunction("getPlaylistArtwork") { (ids: [String]) async throws -> [[String: String]] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.playlistArtwork(ids)
    }
    AsyncFunction("playTrack") { (id: String, _: Bool) async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.playTrack(id)
    }
    AsyncFunction("playPlaylist") { (id: String, shuffle: Bool) async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.playPlaylist(id, shuffle: shuffle)
    }
    AsyncFunction("resume") { (_: String, _: Bool) async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return try await AppleMusicController.shared.resume()
    }
    AsyncFunction("pause") { () async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return await AppleMusicController.shared.pause()
    }
    AsyncFunction("stop") { () async throws in
      guard #available(iOS 16.0, *) else { return }
      await AppleMusicController.shared.stop()
    }
    AsyncFunction("releaseCurrent") { () async throws in
      guard #available(iOS 16.0, *) else { return }
      await AppleMusicController.shared.stop(clearCache: false)
    }
    AsyncFunction("getCurrentPlayback") { () async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      return await AppleMusicController.shared.playback()
    }
    AsyncFunction("setRepeat") { (mode: String) async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      await AppleMusicController.shared.setRepeat(mode)
      return ["success": true]
    }
    AsyncFunction("setShuffle") { (enabled: Bool) async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      await AppleMusicController.shared.setShuffle(enabled)
      return ["success": true]
    }
    AsyncFunction("next") { () async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      try await AppleMusicController.shared.next()
      return ["success": true]
    }
    AsyncFunction("previous") { () async throws -> [String: Any] in
      guard #available(iOS 16.0, *) else { throw UnsupportedMusicKit() }
      try await AppleMusicController.shared.previous()
      return ["success": true]
    }
  }
}

private final class UnsupportedMusicKit: Exception {
  override var reason: String { "Apple Music requires iOS 16 or later." }
}
