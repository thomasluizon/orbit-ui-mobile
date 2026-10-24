import Foundation

final class MemoryWidgetCredentials: WidgetCredentials {
  var value: String?
  var rejectWrite = false
  func read() -> String? { value }
  func write(_ token: String) throws {
    if rejectWrite { throw WidgetStoreError.unavailable }
    value = token
  }
  func delete() { value = nil }
}

@main
struct WidgetDriver {
  static func main() throws {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    if CommandLine.arguments[1] == "revocation-race" {
      try WidgetRevocationDriver.run(input)
      return
    }
    if CommandLine.arguments[1] == "revocation-publish" {
      try WidgetRevocationDriver.publish(input, directory: URL(fileURLWithPath: CommandLine.arguments[2]))
      return
    }
    if CommandLine.arguments[1] == "timeline" {
      try WidgetTimelineDriver.run(input)
      return
    }
    if CommandLine.arguments[1] == "map" {
      let payload = try JSONDecoder().decode(WidgetPayload.self, from: input)
      let result: [String: Any] = [
        "completed": payload.completedCount, "total": payload.totalCount,
        "tomorrow": payload.isTomorrow, "emptyKey": payload.emptyKey,
        "rows": payload.rows.map { row -> [String: Any] in
          ["id": row.id, "state": row.statusKey, "depth": row.depth,
           "childrenDone": row.childrenDone, "childrenTotal": row.childrenTotal,
           "deeperCount": row.deeperCount, "time": row.habit.dueTime.map {
             widgetTime($0, uses24HourClock: payload.uses24HourClock, language: payload.language)
           } ?? ""]
        },
      ]
      FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
      return
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let keychain = MemoryWidgetCredentials()
    let store = WidgetStore(directory: directory, credentials: keychain)
    let tokenA = jwt("account-a", generation: 0)
    let rotatedA = jwt("account-a", generation: 1)
    let tokenB = jwt("account-b", generation: 0)
    let json = String(decoding: input, as: UTF8.self)
    var observations: [String: Bool] = [:]

    keychain.value = tokenA
    observations["reinstallIgnoresKeychain"] = try store.token() == nil
    try store.saveToken(tokenA)
    try store.savePayload(json, authorizingToken: tokenA)
    observations["firstSnapshot"] = try store.cachedPayload() != nil
    try store.saveToken(rotatedA)
    observations["rotationKeepsCache"] = try store.cachedPayload() != nil
    try store.savePayload(json, authorizingToken: tokenA)
    observations["olderCredentialSameAccount"] = try store.cachedPayload() != nil
    try store.saveToken(tokenB)
    observations["switchClearsCache"] = try store.cachedPayload() == nil
    try store.savePayload(json, authorizingToken: tokenA)
    observations["lateAccountCannotPublish"] = try store.cachedPayload() == nil
    try store.savePayload(json, authorizingToken: tokenB)
    try store.clearToken()
    observations["signOutClearsKeychainAndCache"] = try keychain.value == nil && store.cachedPayload() == nil
    try store.savePayload(json, authorizingToken: tokenB)
    observations["lateResponseAfterLogout"] = try store.cachedPayload() == nil

    keychain.rejectWrite = true
    do { try store.saveToken(tokenA) } catch { observations["writeFailureRejects"] = true }
    observations["failedWriteDoesNotActivateSession"] = try store.token() == nil
    keychain.rejectWrite = false
    try store.saveToken(tokenA)
    do { try store.savePayload("{}", authorizingToken: tokenA) } catch { observations["invalidPayloadRejects"] = true }
    observations["invalidPayloadDoesNotCache"] = try store.cachedPayload() == nil
    try store.saveTheme(["dark_textPrimary": "#F4F4F6"])
    observations["themeRoundTrip"] = try store.theme()["dark_textPrimary"] == "#F4F4F6"
    keychain.rejectWrite = true
    do { try store.saveToken(tokenB) } catch { observations["accountSwitchWriteFailureRejects"] = true }
    observations["failedSwitchRevokesPriorAccount"] = try store.token() == nil
    keychain.rejectWrite = false
    try store.saveToken(tokenA)
    keychain.rejectWrite = true
    do { try store.saveToken(rotatedA) } catch { observations["rotationWriteFailureRejects"] = true }
    observations["rotationFailureKeepsSameAccount"] = try store.token() == tokenA
    let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
    observations["noTokenOnDisk"] = try files.allSatisfy { url in
      let contents = try String(contentsOf: url, encoding: .utf8)
      return !contents.contains(tokenA) && !contents.contains(tokenB) && !contents.contains(rotatedA)
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: observations))
  }

  static func jwt(_ account: String, generation: Int) -> String {
    let payload = Data("{\"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier\":\"\(account)\",\"exp\":\(generation)}".utf8).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    return "header.\(payload).signature"
  }
}
