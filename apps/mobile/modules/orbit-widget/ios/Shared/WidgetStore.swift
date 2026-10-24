import CryptoKit
import Foundation
import Security

protocol WidgetCredentials {
  func read() throws -> String?
  func write(_ token: String) throws
  func delete() throws
}

struct KeychainWidgetCredentials: WidgetCredentials {
  let group: String

  private var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: "orbit-widget", kSecAttrAccount as String: "session",
     kSecAttrAccessGroup as String: group]
  }

  func read() throws -> String? {
    var search = query
    search[kSecReturnData as String] = true
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(search as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    try check(status)
    guard let bytes = result as? Data, let token = String(data: bytes, encoding: .utf8) else {
      throw WidgetStoreError.invalidCredential
    }
    return token
  }

  func write(_ token: String) throws {
    let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      try check(SecItemAdd(query.merging(attributes) { _, value in value } as CFDictionary, nil))
    } else {
      try check(status)
    }
  }

  func delete() throws {
    let status = SecItemDelete(query as CFDictionary)
    if status != errSecItemNotFound { try check(status) }
  }

  private func check(_ status: OSStatus) throws {
    if status != errSecSuccess { throw WidgetStoreError.keychain(status) }
  }
}

enum WidgetStoreError: Error {
  case unavailable, invalidCredential, keychain(OSStatus)
}

struct WidgetCache: Codable {
  let session: String
  let updatedAt: Date
  let payload: WidgetPayload
}

final class WidgetStore {
  let directory: URL
  let credentials: WidgetCredentials

  init(directory: URL, credentials: WidgetCredentials) {
    self.directory = directory
    self.credentials = credentials
  }

  static func configured() throws -> WidgetStore {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "OrbitWidgetAppGroup") as? String,
          let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw WidgetStoreError.unavailable
    }
    return WidgetStore(directory: directory, credentials: KeychainWidgetCredentials(group: group))
  }

  static func sessionKey(_ token: String) -> String {
    let parts = token.split(separator: ".", omittingEmptySubsequences: false)
    var account = token
    if parts.count > 1 {
      let segment = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
      let padded = segment.padding(toLength: (segment.count + 3) / 4 * 4, withPad: "=", startingAt: 0)
      if let bytes = Data(base64Encoded: padded), let claims = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
        if let value = claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] as? String, !value.isEmpty {
          account = value
        }
      }
    }
    return SHA256.hash(data: Data(account.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  func token() throws -> String? {
    guard FileManager.default.fileExists(atPath: file("session").path) else { return nil }
    let session = try String(contentsOf: file("session"), encoding: .utf8)
    guard let token = try credentials.read(), Self.sessionKey(token) == session else { return nil }
    return token
  }

  func saveToken(_ token: String) throws {
    if try self.token().map(Self.sessionKey) != Self.sessionKey(token) {
      try remove("session")
      try remove("habits.json")
    }
    try credentials.write(token)
    try write(Data(Self.sessionKey(token).utf8), to: "session")
  }

  func clearToken() throws {
    try remove("session")
    try credentials.delete()
    try remove("habits.json")
  }

  func savePayload(_ json: String, authorizingToken: String, updatedAt: Date = Date()) throws {
    let payload = try JSONDecoder().decode(WidgetPayload.self, from: Data(json.utf8))
    let session = Self.sessionKey(authorizingToken)
    guard try token().map(Self.sessionKey) == session else { return }
    let cache = WidgetCache(session: session, updatedAt: updatedAt, payload: payload)
    try write(JSONEncoder().encode(cache), to: "habits.json")
    try write(Data(payload.language.utf8), to: "language")
  }

  func cachedPayload() throws -> WidgetCache? {
    guard let token = try token(), FileManager.default.fileExists(atPath: file("habits.json").path) else { return nil }
    let cache = try JSONDecoder().decode(WidgetCache.self, from: Data(contentsOf: file("habits.json")))
    guard cache.session == Self.sessionKey(token) else { return nil }
    return cache
  }

  func saveTheme(_ colors: [String: String]) throws {
    try write(JSONEncoder().encode(colors), to: "theme.json")
  }

  func language() throws -> String? {
    guard FileManager.default.fileExists(atPath: file("language").path) else { return nil }
    return try String(contentsOf: file("language"), encoding: .utf8)
  }

  func theme() throws -> [String: String] {
    guard FileManager.default.fileExists(atPath: file("theme.json").path) else { return [:] }
    return try JSONDecoder().decode([String: String].self, from: Data(contentsOf: file("theme.json")))
  }

  private func file(_ name: String) -> URL { directory.appendingPathComponent(name) }

  private func write(_ bytes: Data, to name: String) throws {
    #if os(iOS)
    try bytes.write(to: file(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    #else
    try bytes.write(to: file(name), options: .atomic)
    #endif
  }

  private func remove(_ name: String) throws {
    if FileManager.default.fileExists(atPath: file(name).path) { try FileManager.default.removeItem(at: file(name)) }
  }
}
