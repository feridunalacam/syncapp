import Foundation

@MainActor final class FixtureClock {
  var value: TimeInterval = 0
}

@MainActor final class FixtureCall {
  var entered = false
  var completed = false
  var rows: [AppleMusicLibraryArtworkRow]?
  var error: Error?
}

actor StubArtworkTransport {
  private var response: Data
  private var blocked: Bool
  private var released = false
  private var calls: [URLRequest] = []
  private var waiting: [CheckedContinuation<Data, Error>] = []
  init(_ response: Data, blocked: Bool = false) { self.response = response; self.blocked = blocked }
  func fetch(_ request: URLRequest) async throws -> Data {
    calls.append(request)
    if blocked { return try await withCheckedThrowingContinuation { waiting.append($0) } }
    return response
  }
  func count() -> Int { calls.count }
  func hasReleased() -> Bool { released }
  func release(_ response: Data) {
    self.response = response
    blocked = false
    released = true
    let pending = waiting
    waiting.removeAll()
    for continuation in pending { continuation.resume(returning: response) }
  }
}

@main
struct AppleMusicLibraryArtworkTests {
  @MainActor static var checks = 0
  @MainActor static func check(_ value: Bool, _ message: String) {
    precondition(value, message)
    checks += 1
  }
  static func data(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object)
  }
  static func library(_ id: String, art: Any? = nil, catalog: String? = nil, global: String? = nil,
                      hasCatalog: Bool? = nil) -> [String: Any] {
    var attributes: [String: Any] = ["name": "Same display name"]
    if let art { attributes["artwork"] = ["url": art, "width": NSNull(), "height": NSNull()] }
    if let global { attributes["playParams"] = ["globalId": global] }
    if let hasCatalog { attributes["hasCatalog"] = hasCatalog }
    var row: [String: Any] = ["id": id, "type": "library-playlists", "attributes": attributes]
    if let catalog {
      row["relationships"] = ["catalog": ["data": [["id": catalog, "type": "playlists",
        "attributes": ["artwork": ["url": "https://is1-ssl.mzstatic.com/catalog/{w}x{h}.{f}"]]]]]]
    }
    return row
  }
  static func awaitCalls(_ transport: StubArtworkTransport, _ count: Int) async {
    for _ in 0..<10_000 {
      if await transport.count() >= count { return }
      await Task.yield()
    }
    preconditionFailure("Synthetic transport did not start")
  }
  @MainActor static func launch(
    _ operation: @escaping @MainActor () async throws -> [AppleMusicLibraryArtworkRow]
  ) -> (Task<Void, Never>, FixtureCall) {
    let call = FixtureCall()
    let task = Task {
      call.entered = true
      do { call.rows = try await operation() }
      catch { call.error = error }
      call.completed = true
    }
    return (task, call)
  }
  @MainActor static func awaitCompletion(_ call: FixtureCall) async throws {
    let deadline = ContinuousClock.now.advanced(by: .seconds(2))
    while !call.completed && ContinuousClock.now < deadline {
      try await Task.sleep(nanoseconds: 1_000_000)
    }
    precondition(call.completed, "Caller must return before releasing the stalled transport")
  }
  @MainActor static func afterRawSettlement(_ resolver: AppleMusicLibraryArtwork, ids: [String]) async throws -> [AppleMusicLibraryArtworkRow] {
    for _ in 0..<10_000 {
      do { return try await resolver.getPlaylistArtwork(ids) }
      catch AppleMusicLibraryArtworkError.busy { await Task.yield() }
    }
    preconditionFailure("Released synthetic transport did not settle")
  }
  static func isTimedOut(_ error: Error?) -> Bool {
    guard let error = error as? AppleMusicLibraryArtworkError else { return false }
    if case .timedOut = error { return true }
    return false
  }

  @MainActor static func main() async throws {
    let ownArt = "https://is1-ssl.mzstatic.com/library/{w}x{h}.{f}"
    let fixture = try data(["data": [
      library("p.catalog-copy", art: ownArt, catalog: "pl.correct", global: "pl.correct", hasCatalog: true),
      library("p.catalog-fallback", catalog: "pl.correct", global: "pl.correct", hasCatalog: true),
      library("p.purchased", hasCatalog: false),
      library("p.same-name-unrelated", hasCatalog: false)
    ]])
    let parsed = try AppleMusicLibraryArtworkJSON.parse(fixture, requestedIDs: [
      "p.catalog-copy", "p.catalog-fallback", "p.purchased", "p.same-name-unrelated"
    ])
    check(parsed.count == 2, "No artwork is invented for local-only/same-title playlists")
    check(parsed[0].id == "p.catalog-copy" && parsed[0].artworkSource == "library", "Library ID and own artwork win")
    check(parsed[0].image == "https://is1-ssl.mzstatic.com/library/300x300.jpg", "Null dimensions do not discard URL")
    check(parsed[0].bridgeValue == ["id": "p.catalog-copy", "image": parsed[0].image, "artworkSource": "library"], "Bridge rows preserve only the original library identity and artwork")
    check(parsed[1].id == "p.catalog-fallback" && parsed[1].artworkSource == "catalog", "Exact explicit identity fallback")
    check(parsed.allSatisfy { $0.id.hasPrefix("p.") }, "Catalog identity never replaces playback IDs")
    check(AppleMusicLibraryArtworkJSON.artworkURL("https://is1-ssl.mzstatic.com/%7Bw%7Dx%7Bh%7D.%7Bf%7D") ==
      "https://is1-ssl.mzstatic.com/300x300.jpg", "Encoded MusicKit tokens are sized")
    for invalid in ["file:///private/image.jpg", "musicKit://local/image", "http://example.test/a.jpg", "https://user:secret@example.test/a.jpg", "https://example.test/{unknown}"] {
      check(AppleMusicLibraryArtworkJSON.artworkURL(invalid) == nil, "Only supported HTTPS artwork is emitted")
    }
    let conflict = try data(["data": [library("p.conflict", catalog: "pl.first", global: "pl.second", hasCatalog: true)]])
    check(try AppleMusicLibraryArtworkJSON.parse(conflict, requestedIDs: ["p.conflict"]).isEmpty, "Conflicting identity is rejected")
    let globalOnly = try data(["data": [library("p.global", global: "pl.exact", hasCatalog: true)],
      "included": [["id": "pl.exact", "type": "playlists", "attributes": ["artwork": ["url": ownArt]]]]])
    check(try AppleMusicLibraryArtworkJSON.parse(globalOnly, requestedIDs: ["p.global"]).first?.artworkSource == "catalog", "Global identity must match a returned resource")
    let noGlobalResource = try data(["data": [library("p.global", global: "pl.absent", hasCatalog: true)]])
    check(try AppleMusicLibraryArtworkJSON.parse(noGlobalResource, requestedIDs: ["p.global"]).isEmpty, "No automatic catalog request is invented")
    check(try AppleMusicLibraryArtworkJSON.parse(fixture, requestedIDs: ["p.not-requested"]).isEmpty, "Unrequested rows never leak into results")
    let localCover = try data(["data": [library("p.local-cover", art: ownArt, hasCatalog: false)]])
    check(try AppleMusicLibraryArtworkJSON.parse(localCover, requestedIDs: ["p.local-cover"]).first?.artworkSource == "library", "Local-only playlists keep their actual artwork")
    do { _ = try AppleMusicLibraryArtworkJSON.parse(try data(["errors": [["status": "403"]]]), requestedIDs: ["p.one"]); preconditionFailure("API error treated as missing artwork") }
    catch AppleMusicLibraryArtworkError.invalidResponse { checks += 1 }
    do { _ = try AppleMusicLibraryArtworkJSON.parse(Data(repeating: 32, count: AppleMusicLibraryArtworkJSON.maximumResponseBytes + 1), requestedIDs: ["p.one"]); preconditionFailure("Unbounded response") }
    catch AppleMusicLibraryArtworkError.responseTooLarge { checks += 1 }
    do { _ = try AppleMusicLibraryArtworkJSON.normalizedIDs(Array(repeating: "p.one", count: 9)); preconditionFailure("Unbounded batch") }
    catch AppleMusicLibraryArtworkError.batchTooLarge { checks += 1 }
    do { _ = try AppleMusicLibraryArtworkJSON.normalizedIDs(["pl.catalog"]); preconditionFailure("Catalog ID passed to library endpoint") }
    catch AppleMusicLibraryArtworkError.invalidIDs { checks += 1 }
    let request = try AppleMusicLibraryArtworkJSON.request(ids: ["p.one", "p.two", "p.one"])
    let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
    check(request.httpMethod == "GET" && request.allHTTPHeaderFields?.isEmpty != false, "No credential headers are constructed")
    check(query.first { $0.name == "ids" }?.value == "p.one,p.two", "Exact ID batch deduplicates")
    check(query.first { $0.name == "include" }?.value == "catalog", "One explicit catalog relationship include")

    let clock = FixtureClock()
    let backend = StubArtworkTransport(fixture, blocked: true)
    let resolver = AppleMusicLibraryArtwork(now: { clock.value }, fetch: { try await backend.fetch($0) })
    let first = Task { try await resolver.getPlaylistArtwork(["p.catalog-copy", "p.catalog-fallback"]) }
    await awaitCalls(backend, 1)
    let shared = Task { try await resolver.getPlaylistArtwork(["p.catalog-copy"]) }
    await Task.yield()
    do { _ = try await resolver.getPlaylistArtwork(["p.purchased"]); preconditionFailure("Concurrent disjoint network batch") }
    catch AppleMusicLibraryArtworkError.busy { checks += 1 }
    await backend.release(fixture)
    check(try await first.value == parsed, "Main request returns exact parsed rows")
    check(try await shared.value == [parsed[0]], "Same-flight subset shares network request")
    check(await backend.count() == 1, "Only one transport call was issued")
    _ = try await resolver.getPlaylistArtwork(["p.catalog-copy"])
    check(await backend.count() == 1, "Positive TTL avoids another call")
    clock.value = 301
    _ = try await resolver.getPlaylistArtwork(["p.catalog-copy"])
    check(await backend.count() == 2, "Expired positive TTL permits a new batch")
    _ = try await resolver.getPlaylistArtwork(["p.purchased"])
    let afterMiss = await backend.count()
    _ = try await resolver.getPlaylistArtwork(["p.purchased"])
    check(await backend.count() == afterMiss, "Missing artwork has a short negative TTL")
    clock.value += 31
    _ = try await resolver.getPlaylistArtwork(["p.purchased"])
    check(await backend.count() == afterMiss + 1, "Missing artwork can be retried after TTL")

    let retiredBackend = StubArtworkTransport(fixture, blocked: true)
    let accountResolver = AppleMusicLibraryArtwork(fetch: { try await retiredBackend.fetch($0) })
    let (oldTask, old) = launch { try await accountResolver.getPlaylistArtwork(["p.catalog-copy"]) }
    await awaitCalls(retiredBackend, 1)
    accountResolver.invalidate()
    try await awaitCompletion(old)
    check(old.error is CancellationError, "Account invalidation promptly returns before raw transport settles")
    check(await retiredBackend.hasReleased() == false, "Invalidation did not wait for fake transport release")
    do { _ = try await accountResolver.getPlaylistArtwork(["p.catalog-copy"]); preconditionFailure("Old request still in flight") }
    catch AppleMusicLibraryArtworkError.busy { checks += 1 }
    await retiredBackend.release(fixture)
    await oldTask.value
    let fresh = try await afterRawSettlement(accountResolver, ids: ["p.catalog-copy"])
    let freshCalls = await retiredBackend.count()
    check(fresh == [parsed[0]] && freshCalls == 2, "New generation performs its own request")

    let sharedBackend = StubArtworkTransport(fixture, blocked: true)
    let sharedResolver = AppleMusicLibraryArtwork(fetch: { try await sharedBackend.fetch($0) })
    let survivor = Task { try await sharedResolver.getPlaylistArtwork(["p.catalog-copy"]) }
    await awaitCalls(sharedBackend, 1)
    let (cancelledWaiter, cancelledCall) = launch { try await sharedResolver.getPlaylistArtwork(["p.catalog-copy"]) }
    await Task.yield(); cancelledWaiter.cancel()
    try await awaitCompletion(cancelledCall)
    check(cancelledCall.error is CancellationError, "A co-waiter's cancellation returns before transport release")
    check(await sharedBackend.hasReleased() == false, "Shared raw task remains pending for its other waiter")
    await sharedBackend.release(fixture)
    check(try await survivor.value == [parsed[0]], "A cancelled waiter cannot erase shared successful results")
    check(await sharedBackend.count() == 1, "Caller cancellation does not duplicate transport")
    _ = try await sharedResolver.getPlaylistArtwork(["p.catalog-copy"])
    check(await sharedBackend.count() == 1, "Success populates cache before successful waiters resume")

    let timeoutBackend = StubArtworkTransport(fixture, blocked: true)
    let timeoutResolver = AppleMusicLibraryArtwork(callerTimeoutNanoseconds: 35_000_000,
      fetch: { try await timeoutBackend.fetch($0) })
    let (timeoutTask, timedOut) = launch { try await timeoutResolver.getPlaylistArtwork(["p.catalog-copy"]) }
    await awaitCalls(timeoutBackend, 1)
    try await awaitCompletion(timedOut)
    check(isTimedOut(timedOut.error), "Absolute caller deadline returns while raw request never settles")
    check(await timeoutBackend.hasReleased() == false, "Deadline completion precedes native transport release")
    do { _ = try await timeoutResolver.getPlaylistArtwork(["p.purchased"]); preconditionFailure("Timed-out raw slot was released early") }
    catch AppleMusicLibraryArtworkError.busy { checks += 1 }
    check(await timeoutBackend.count() == 1, "A timeout does not permit a second transport")
    await timeoutBackend.release(fixture)
    await timeoutTask.value
    let afterTimeout = try await afterRawSettlement(timeoutResolver, ids: ["p.catalog-copy"])
    check(afterTimeout == [parsed[0]], "A fresh request succeeds after actual raw settlement")
    check(await timeoutBackend.count() == 2, "Late timed-out completion was not cached")

    let cancelBackend = StubArtworkTransport(fixture, blocked: true)
    let cancelResolver = AppleMusicLibraryArtwork(fetch: { try await cancelBackend.fetch($0) })
    let (cancelTask, cancelledCallAlone) = launch { try await cancelResolver.getPlaylistArtwork(["p.catalog-copy"]) }
    await awaitCalls(cancelBackend, 1)
    cancelTask.cancel()
    try await awaitCompletion(cancelledCallAlone)
    check(cancelledCallAlone.error is CancellationError, "A sole caller cancels promptly without raw settlement")
    check(await cancelBackend.hasReleased() == false, "Prompt cancellation did not unblock its fake request")
    do { _ = try await cancelResolver.getPlaylistArtwork(["p.catalog-copy"]); preconditionFailure("Cancelled raw slot was reused") }
    catch AppleMusicLibraryArtworkError.busy { checks += 1 }
    check(await cancelBackend.count() == 1, "Cancellation retains the raw single-flight slot")
    await cancelBackend.release(fixture)
    _ = try await afterRawSettlement(cancelResolver, ids: ["p.catalog-copy"])
    check(await cancelBackend.count() == 2, "Late sole-caller cancellation cannot populate cache")

    let cappedBackend = StubArtworkTransport(fixture, blocked: true)
    let cappedResolver = AppleMusicLibraryArtwork(callerTimeoutNanoseconds: 250_000_000,
      fetch: { try await cappedBackend.fetch($0) })
    let waiters = (0..<16).map { _ in launch { try await cappedResolver.getPlaylistArtwork(["p.catalog-copy"]) } }
    await awaitCalls(cappedBackend, 1)
    while waiters.contains(where: { !$0.1.entered }) { await Task.yield() }
    await Task.yield()
    check(waiters.allSatisfy { !$0.1.completed }, "Sixteen bounded callers await one stalled request")
    do { _ = try await cappedResolver.getPlaylistArtwork(["p.catalog-copy"]); preconditionFailure("Unbounded caller waiters") }
    catch AppleMusicLibraryArtworkError.busy { checks += 1 }
    for (_, call) in waiters { try await awaitCompletion(call) }
    check(waiters.allSatisfy { isTimedOut($0.1.error) }, "Every capped caller gets its own deadline")
    check(await cappedBackend.hasReleased() == false, "All bounded callers finish before transport release")
    check(await cappedBackend.count() == 1, "Waiter cap and deadlines never create another raw task")
    await cappedBackend.release(fixture)
    _ = try await afterRawSettlement(cappedResolver, ids: ["p.catalog-copy"])
    print("PASS: \(checks) offline parser/batch/lifecycle checks; fake transport only; no MusicKit request invoked")
  }
}
