// Optional, memory-only artwork enrichment for exact library playlist IDs.
import Foundation
import MusicKit

struct AppleMusicLibraryArtworkRow: Equatable, Sendable {
  let id: String // Always the requested library ID, never a catalog playback ID.
  let image: String
  let artworkSource: String

  var bridgeValue: [String: String] {
    ["id": id, "image": image, "artworkSource": artworkSource]
  }
}

enum AppleMusicLibraryArtworkError: Error {
  case invalidIDs, batchTooLarge, busy, timedOut, invalidResponse, responseTooLarge, requestFailed
}

enum AppleMusicLibraryArtworkJSON {
  static let maximumBatch = 8 // Product cap, not a claim about Apple's maximum.
  static let maximumResponseBytes = 524_288

  static func libraryID(_ value: String) -> Bool {
    value.range(of: #"^p\.[A-Za-z0-9._-]{1,180}$"#, options: .regularExpression) != nil
  }

  private static func catalogID(_ value: String) -> Bool {
    value.range(of: #"^pl\.[A-Za-z0-9._-]{1,180}$"#, options: .regularExpression) != nil
  }

  static func normalizedIDs(_ ids: [String]) throws -> [String] {
    guard ids.count <= maximumBatch else { throw AppleMusicLibraryArtworkError.batchTooLarge }
    guard ids.allSatisfy(libraryID) else { throw AppleMusicLibraryArtworkError.invalidIDs }
    var seen = Set<String>()
    return ids.filter { seen.insert($0).inserted }
  }

  static func request(ids: [String]) throws -> URLRequest {
    let ids = try normalizedIDs(ids)
    guard !ids.isEmpty else { throw AppleMusicLibraryArtworkError.invalidIDs }
    var url = URLComponents(string: "https://api.music.apple.com/v1/me/library/playlists")!
    url.queryItems = [
      URLQueryItem(name: "ids", value: ids.joined(separator: ",")),
      URLQueryItem(name: "include", value: "catalog")
    ]
    var request = URLRequest(url: url.url!)
    request.httpMethod = "GET"
    request.timeoutInterval = 12 // Transport hint; callers have a separate monotonic deadline below.
    // MusicDataRequest's existing automatic token provider supplies authentication.
    // No Authorization header, private key, developer token, or user token is read here.
    return request
  }

  static func artworkURL(_ value: Any?) -> String? {
    guard let raw = value as? String else { return nil }
    var image = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    for (token, replacement) in [("w", "300"), ("h", "300"), ("f", "jpg")] {
      image = image.replacingOccurrences(of: "{\(token)}", with: replacement, options: .caseInsensitive)
      image = image.replacingOccurrences(of: "%7B\(token)%7D", with: replacement, options: .caseInsensitive)
    }
    guard !image.contains("{"), !image.contains("}"),
      let url = URLComponents(string: image), url.scheme?.lowercased() == "https",
      !(url.host ?? "").isEmpty, url.user == nil, url.password == nil,
      let final = url.url else { return nil }
    return final.absoluteString
  }

  static func parse(_ data: Data, requestedIDs: [String]) throws -> [AppleMusicLibraryArtworkRow] {
    guard data.count <= maximumResponseBytes else { throw AppleMusicLibraryArtworkError.responseTooLarge }
    let requested = try normalizedIDs(requestedIDs)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      object["errors"] == nil, let resources = object["data"] as? [[String: Any]],
      resources.count <= maximumBatch else { throw AppleMusicLibraryArtworkError.invalidResponse }
    let wanted = Set(requested)
    var library: [String: [String: Any]] = [:]
    var catalogs: [String: String] = [:]
    func indexCatalog(_ resource: [String: Any]) {
      guard resource["type"] as? String == "playlists", let id = resource["id"] as? String,
        catalogID(id), let attributes = resource["attributes"] as? [String: Any],
        let artwork = attributes["artwork"] as? [String: Any],
        let image = artworkURL(artwork["url"]) else { return }
      catalogs[id] = image
    }
    for resource in resources {
      guard resource["type"] as? String == "library-playlists",
        let id = resource["id"] as? String, wanted.contains(id), library[id] == nil else { continue }
      library[id] = resource
      let relationships = resource["relationships"] as? [String: Any]
      let catalog = relationships?["catalog"] as? [String: Any]
      for item in catalog?["data"] as? [[String: Any]] ?? [] { indexCatalog(item) }
    }
    // Accommodate full related resources if a response supplies an included array.
    // Nothing is fetched separately, and only explicit per-library IDs may use it.
    if let included = object["included"] as? [[String: Any]], included.count <= 32 {
      for item in included { indexCatalog(item) }
    }
    return requested.compactMap { id in
      guard let resource = library[id], let attributes = resource["attributes"] as? [String: Any] else { return nil }
      if let art = attributes["artwork"] as? [String: Any], let image = artworkURL(art["url"]) {
        return AppleMusicLibraryArtworkRow(id: id, image: image, artworkSource: "library")
      }
      guard attributes["hasCatalog"] as? Bool != false else { return nil }
      let relationships = resource["relationships"] as? [String: Any]
      let catalog = relationships?["catalog"] as? [String: Any]
      let references = (catalog?["data"] as? [[String: Any]] ?? []).compactMap { item -> String? in
        guard item["type"] as? String == "playlists", let value = item["id"] as? String,
          catalogID(value) else { return nil }
        return value
      }
      let play = attributes["playParams"] as? [String: Any]
      let global = (play?["globalId"] as? String).flatMap { catalogID($0) ? $0 : nil }
      let candidates = Set(references + (global.map { [$0] } ?? []))
      // Contradictory or ambiguous identity data must never choose a cover by name/order.
      guard candidates.count == 1, let catalogID = candidates.first,
        let image = catalogs[catalogID] else { return nil }
      return AppleMusicLibraryArtworkRow(id: id, image: image, artworkSource: "catalog")
    }
  }
}

@available(iOS 16.0, macOS 13.0, *)
@MainActor
final class AppleMusicLibraryArtwork {
  typealias Transport = @Sendable (URLRequest) async throws -> Data
  private final class CancellationFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false
    func cancel() { lock.lock(); value = true; lock.unlock() }
    func isCancelled() -> Bool { lock.lock(); defer { lock.unlock() }; return value }
  }
  private struct Cached {
    let row: AppleMusicLibraryArtworkRow?
    let until: TimeInterval
  }
  private final class Waiter {
    let ids: [String]
    let deadline: ContinuousClock.Instant
    let cancellation: CancellationFlag
    let continuation: CheckedContinuation<[AppleMusicLibraryArtworkRow], Error>
    var timer: Task<Void, Never>?
    init(ids: [String], deadline: ContinuousClock.Instant, cancellation: CancellationFlag,
         continuation: CheckedContinuation<[AppleMusicLibraryArtworkRow], Error>) {
      self.ids = ids
      self.deadline = deadline
      self.cancellation = cancellation
      self.continuation = continuation
    }
  }
  private final class Flight {
    let id: Int
    let generation: Int
    let ids: Set<String>
    let task: Task<[AppleMusicLibraryArtworkRow], Error>
    var retiring = false
    var observed = false
    var settled: Result<[AppleMusicLibraryArtworkRow], Error>?
    var waiters: [Int: Waiter] = [:]
    init(id: Int, generation: Int, ids: Set<String>, task: Task<[AppleMusicLibraryArtworkRow], Error>) {
      self.id = id
      self.generation = generation
      self.ids = ids
      self.task = task
    }
  }
  private let fetch: Transport
  private let now: @MainActor () -> TimeInterval
  private let callerTimeoutNanoseconds: UInt64
  private var generation = 0
  private var sequence = 0
  private var waiterSequence = 0
  private var cache: [String: Cached] = [:]
  private var flight: Flight?

  init(
    now: @escaping @MainActor () -> TimeInterval = { Date().timeIntervalSince1970 },
    callerTimeoutNanoseconds: UInt64 = 12_000_000_000,
    fetch: @escaping Transport = { request in
      try await MusicDataRequest(urlRequest: request).response().data
    }
  ) {
    self.now = now
    self.callerTimeoutNanoseconds = min(12_000_000_000, max(1, callerTimeoutNanoseconds))
    self.fetch = fetch
  }

  func invalidate() {
    generation += 1
    cache.removeAll()
    // Keep the retiring flight until it settles, even if transport ignores cancel.
    // A new account cannot start a second overlapping network request behind it.
    guard let pending = flight else { return }
    pending.retiring = true
    pending.task.cancel()
    observe(pending)
    let waiters = Array(pending.waiters.values)
    pending.waiters.removeAll()
    for waiter in waiters {
      waiter.timer?.cancel()
      waiter.continuation.resume(throwing: CancellationError())
    }
  }

  func getPlaylistArtwork(_ ids: [String]) async throws -> [AppleMusicLibraryArtworkRow] {
    let deadline = ContinuousClock.now.advanced(by: .nanoseconds(Int64(callerTimeoutNanoseconds)))
    try Task.checkCancellation()
    let ids = try AppleMusicLibraryArtworkJSON.normalizedIDs(ids)
    guard !ids.isEmpty else { return [] }
    let ticket = generation
    cache = cache.filter { $0.value.until > now() }
    let missing = ids.filter { cache[$0] == nil }
    guard !missing.isEmpty else { return ids.compactMap { cache[$0]?.row } }
    let pending: Flight
    if let existing = flight {
      guard !existing.retiring, existing.generation == ticket,
        existing.ids.isSuperset(of: missing), existing.waiters.count < 16 else {
        throw AppleMusicLibraryArtworkError.busy
      }
      pending = existing
    } else {
      sequence += 1
      let request = try AppleMusicLibraryArtworkJSON.request(ids: missing)
      let fetch = self.fetch
      let task = Task {
        try Task.checkCancellation()
        let data = try await fetch(request)
        try Task.checkCancellation()
        return try AppleMusicLibraryArtworkJSON.parse(data, requestedIDs: missing)
      }
      pending = Flight(id: sequence, generation: ticket, ids: Set(missing), task: task)
      flight = pending
    }
    waiterSequence += 1
    let waiterID = waiterSequence
    let flightID = pending.id
    let cancellation = CancellationFlag()
    let rows = try await withTaskCancellationHandler {
      return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[AppleMusicLibraryArtworkRow], Error>) in
        guard !Task.isCancelled, !cancellation.isCancelled(), ticket == generation, !pending.retiring else {
          continuation.resume(throwing: CancellationError())
          retireIfUnobserved(pending)
          observe(pending)
          return
        }
        guard ContinuousClock.now < deadline else {
          continuation.resume(throwing: AppleMusicLibraryArtworkError.timedOut)
          retireIfUnobserved(pending)
          observe(pending)
          return
        }
        if let settled = pending.settled {
          switch settled {
          case let .success(rows):
            let byID = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
            continuation.resume(returning: ids.compactMap { byID[$0] })
          case .failure:
            continuation.resume(throwing: AppleMusicLibraryArtworkError.requestFailed)
          }
          return
        }
        guard pending.waiters.count < 16 else {
          continuation.resume(throwing: AppleMusicLibraryArtworkError.busy)
          return
        }
        let waiter = Waiter(ids: ids, deadline: deadline, cancellation: cancellation, continuation: continuation)
        pending.waiters[waiterID] = waiter
        waiter.timer = Task { @MainActor [weak self] in
          do { try await Task.sleep(until: deadline, clock: ContinuousClock()) }
          catch { return }
          self?.removeWaiter(waiterID, from: pending.id, error: AppleMusicLibraryArtworkError.timedOut)
        }
        observe(pending)
      }
    } onCancel: {
      cancellation.cancel()
      Task { @MainActor [weak self] in
        self?.removeWaiter(waiterID, from: flightID, error: CancellationError())
      }
    }
    try Task.checkCancellation()
    return rows
  }

  private func observe(_ pending: Flight) {
    guard !pending.observed else { return }
    pending.observed = true
    // One observer per raw flight, installed after the first continuation is
    // registered (or retired). Even an immediate reply cannot lose that waiter.
    Task { @MainActor [weak self] in
      let result = await pending.task.result
      self?.finish(pending, result: result)
    }
  }

  private func retireIfUnobserved(_ pending: Flight) {
    if pending.waiters.isEmpty {
      pending.retiring = true
      pending.task.cancel()
    }
  }

  private func removeWaiter(_ id: Int, from flightID: Int, error: Error) {
    guard let pending = flight, pending.id == flightID,
      let waiter = pending.waiters.removeValue(forKey: id) else { return }
    waiter.timer?.cancel()
    waiter.continuation.resume(throwing: error)
    retireIfUnobserved(pending)
  }

  private func finish(_ pending: Flight, result: Result<[AppleMusicLibraryArtworkRow], Error>) {
    guard flight?.id == pending.id else { return }
    pending.settled = result
    flight = nil // Only actual transport settlement releases the single-flight slot.
    let current = !pending.retiring && pending.generation == generation
    let waiters = Array(pending.waiters.values)
    pending.waiters.removeAll()
    let interested = waiters.contains { !$0.cancellation.isCancelled() && ContinuousClock.now < $0.deadline }
    if current, interested, case let .success(rows) = result {
      let byID = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
      for id in pending.ids {
        let row = byID[id]
        cache[id] = Cached(row: row, until: now() + (row == nil ? 30 : 300))
      }
      if cache.count > 128 {
        for id in cache.keys.sorted() where !pending.ids.contains(id) && cache.count > 128 {
          cache.removeValue(forKey: id)
        }
      }
    }
    // Populate shared current-generation cache before waking any successful waiter.
    for waiter in waiters {
      waiter.timer?.cancel()
      if !current || waiter.cancellation.isCancelled() {
        waiter.continuation.resume(throwing: CancellationError())
      } else if ContinuousClock.now >= waiter.deadline {
        waiter.continuation.resume(throwing: AppleMusicLibraryArtworkError.timedOut)
      } else {
        switch result {
        case .success:
          waiter.continuation.resume(returning: waiter.ids.compactMap { cache[$0]?.row })
        case .failure:
          // Never expose response bodies or transport credential metadata.
          waiter.continuation.resume(throwing: AppleMusicLibraryArtworkError.requestFailed)
        }
      }
    }
  }
}
