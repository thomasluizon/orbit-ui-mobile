import Foundation

private struct RevocationScenario: Decodable {
  let foreground: WidgetPayload
  let replacement: WidgetPayload
  let account: String

  var token: String { WidgetDriver.jwt(account == "rotated" ? "account-a" : "account-b", generation: 1) }
}

private final class ProcessWidgetCredentials: WidgetCredentials {
  let file: URL
  var reads = 0

  init(directory: URL) { file = directory.appendingPathComponent("test-keychain") }
  func read() throws -> String? {
    reads += 1
    guard FileManager.default.fileExists(atPath: file.path) else { return nil }
    return try String(contentsOf: file, encoding: .utf8)
  }
  func write(_ token: String) throws { try Data(token.utf8).write(to: file, options: .atomic) }
  func delete() throws {
    if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
  }
}

private final class RevocationResponse: HTTPURLResponse, @unchecked Sendable {
  var beforeRevocation: (() -> Void)?

  override var statusCode: Int {
    let publish = beforeRevocation
    beforeRevocation = nil
    publish?()
    return super.statusCode
  }
}

private final class RevocationTask: URLSessionDataTask, @unchecked Sendable {
  var complete: (() -> Void)?
  override func resume() { complete?() }
}

private final class RevocationSession: URLSession, @unchecked Sendable {
  var response: RevocationResponse?
  var beforeCompletion: (() -> Void)?

  override func dataTask(with request: URLRequest,
                        completionHandler: @escaping @Sendable (Data?, URLResponse?, Error?) -> Void) -> URLSessionDataTask {
    let task = RevocationTask()
    task.complete = {
      self.beforeCompletion?()
      completionHandler(nil, self.response, nil)
    }
    return task
  }
}

struct WidgetRevocationDriver {
  private static let now = Date(timeIntervalSince1970: 1_000_000)

  static func publish(_ input: Data, directory: URL) throws {
    let scenario = try JSONDecoder().decode(RevocationScenario.self, from: input)
    let store = WidgetStore(directory: directory, credentials: ProcessWidgetCredentials(directory: directory))
    try store.saveToken(scenario.token)
    try store.savePayload(String(decoding: JSONEncoder().encode(scenario.replacement), as: UTF8.self),
                          authorizingToken: scenario.token, updatedAt: now)
  }

  static func run(_ input: Data) throws {
    let scenario = try JSONDecoder().decode(RevocationScenario.self, from: input)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let credentials = ProcessWidgetCredentials(directory: directory)
    let store = WidgetStore(directory: directory, credentials: credentials)
    let token = WidgetDriver.jwt("account-a", generation: 0)
    try store.saveToken(token)
    try store.savePayload(String(decoding: JSONEncoder().encode(scenario.foreground), as: UTF8.self),
                          authorizingToken: token, updatedAt: now.addingTimeInterval(-120))
    let response = RevocationResponse(url: URL(string: "https://widget.invalid/api/habits/widget")!,
                                      statusCode: 401, httpVersion: nil, headerFields: nil)!
    var validatedBeforeReplacement = false
    var replacementPublished = false
    var publicationError: Error?
    var readsBeforeCompletion = 0
    response.beforeRevocation = {
      do {
        validatedBeforeReplacement = credentials.reads > readsBeforeCompletion
        let publisher = Process()
        publisher.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
        publisher.arguments = ["revocation-publish", directory.path]
        let pipe = Pipe()
        publisher.standardInput = pipe
        try publisher.run()
        pipe.fileHandleForWriting.write(input)
        try pipe.fileHandleForWriting.close()
        publisher.waitUntilExit()
        guard publisher.terminationStatus == 0 else { throw WidgetStoreError.unavailable }
        replacementPublished = try store.token() == scenario.token
      } catch { publicationError = error }
    }
    let session = RevocationSession()
    session.response = response
    session.beforeCompletion = { readsBeforeCompletion = credentials.reads }
    let provider = WidgetTimeline(makeStore: { store }, currentDate: { now },
                                  apiBase: "https://widget.invalid", session: session)
    var result: OrbitEntry?
    provider.getTimeline { result = $0 }
    if let publicationError { throw publicationError }
    guard let result else { throw WidgetStoreError.unavailable }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: [
      "validatedBeforeReplacement": validatedBeforeReplacement, "replacementPublished": replacementPublished,
      "tokenSurvived": try store.token() == scenario.token,
      "cacheRows": try store.cachedPayload()?.payload.rows.map(\.id) ?? [],
      "signedOut": result.signedOut, "timelineRows": result.payload?.rows.map(\.id) ?? [],
      "refreshScheduled": result.reloadPolicy == .after(now.addingTimeInterval(900)),
    ]))
  }
}
