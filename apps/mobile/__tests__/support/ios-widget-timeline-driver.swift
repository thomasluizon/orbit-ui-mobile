import Foundation
import WidgetKit

private struct TimelineScenario: Decodable {
  let foreground: WidgetPayload
  let background: WidgetPayload
  let secondsBeforeMidnight: Double?
  let initialState: String?
  let steps: [TimelineStep]
}

private struct TimelineStep: Decodable {
  let afterSeconds: Double
  let status: Int?
  let replaceSession: String?
  let responseAfterSeconds: Double?
}

private final class WidgetResponseProtocol: URLProtocol {
  static var respond: ((WidgetResponseProtocol) -> Void)?
  static var requests: [URLRequest] = []

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    Self.requests.append(request)
    Self.respond?(self)
  }
  override func stopLoading() {}
}

struct WidgetTimelineDriver {
  static func run(_ input: Data) throws {
    let scenario = try JSONDecoder().decode(TimelineScenario.self, from: input)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let keychain = MemoryWidgetCredentials()
    let store = WidgetStore(directory: directory, credentials: keychain)
    let calendar = Calendar.current
    let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: Date()))!
    let seededAt = scenario.secondsBeforeMidnight.map { midnight.addingTimeInterval(-$0) }
      ?? calendar.startOfDay(for: Date()).addingTimeInterval(12 * 3600)
    var now = seededAt
    let token = WidgetDriver.jwt("account-a", generation: 0)
    if scenario.initialState == "token-only" { try store.saveToken(token) }
    else if scenario.initialState != "no-token" { try seed(scenario.foreground, token: token, store: store, at: now) }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [WidgetResponseProtocol.self]
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let provider = WidgetTimeline(makeStore: { store }, currentDate: { now },
                                  apiBase: "https://widget.invalid", session: session)
    let foreground = observation(provider.readEntry())
    let scheduled = provider.entries(for: provider.readEntry())
    var steps: [[String: Any]] = []
    for step in scenario.steps {
      now = seededAt.addingTimeInterval(step.afterSeconds)
      WidgetResponseProtocol.respond = { request in
        do {
          if let responseAfterSeconds = step.responseAfterSeconds {
            now = seededAt.addingTimeInterval(responseAfterSeconds)
          }
          if let replacement = step.replaceSession {
            if replacement == "logout" { try store.clearToken() }
            else {
              let account = replacement == "rotated" ? "account-a" : "account-b"
              try seed(scenario.foreground, token: WidgetDriver.jwt(account, generation: 1), store: store, at: now)
            }
          }
          if let status = step.status {
            let response = HTTPURLResponse(url: request.request.url!, statusCode: status,
                                           httpVersion: nil, headerFields: nil)!
            request.client?.urlProtocol(request, didReceive: response, cacheStoragePolicy: .notAllowed)
            request.client?.urlProtocol(request, didLoad: try JSONEncoder().encode(scenario.background))
            request.client?.urlProtocolDidFinishLoading(request)
          } else {
            request.client?.urlProtocol(request, didFailWithError: URLError(.notConnectedToInternet))
          }
        } catch { request.client?.urlProtocol(request, didFailWithError: error) }
      }
      let semaphore = DispatchSemaphore(value: 0)
      var result: OrbitEntry?
      provider.getTimeline { entry in result = entry; semaphore.signal() }
      guard semaphore.wait(timeout: .now() + 5) == .success, let result else {
        throw WidgetStoreError.unavailable
      }
      steps.append(["timeline": observation(result), "snapshot": observation(provider.readEntry()),
                    "tokenPresent": try store.token() != nil, "requestCount": WidgetResponseProtocol.requests.count,
                    "reloadPolicy": policy(result),
                    "language": result.language, "snapshotLanguage": provider.readEntry().language])
    }
    let requests = WidgetResponseProtocol.requests.map {
      ["path": $0.url!.path, "authorized": $0.value(forHTTPHeaderField: "Authorization") == "Bearer \(token)"]
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: [
      "foreground": foreground, "steps": steps, "requests": requests,
      "scheduled": scheduled.map(observation), "scheduledAfterSeconds": scheduled.map { $0.date.timeIntervalSince(seededAt) },
      "scheduledPolicies": scheduled.map(policy),
    ]))
  }

  private static func seed(_ payload: WidgetPayload, token: String, store: WidgetStore, at date: Date) throws {
    try store.saveToken(token)
    try store.savePayload(String(decoding: JSONEncoder().encode(payload), as: UTF8.self), authorizingToken: token, updatedAt: date)
  }

  private static func observation(_ entry: OrbitEntry) -> [String: Any] {
    ["signedOut": entry.signedOut, "completed": entry.payload?.completedCount ?? -1,
     "rows": entry.payload?.rows.map(\.id) ?? []]
  }

  private static func policy(_ entry: OrbitEntry) -> String {
    if entry.reloadPolicy == .never { return "never" }
    if entry.reloadPolicy == .after(entry.date.addingTimeInterval(900)) { return "after900" }
    return "unexpected"
  }
}
