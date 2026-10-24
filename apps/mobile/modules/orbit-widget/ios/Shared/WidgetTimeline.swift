import Foundation
import OSLog
import WidgetKit

private let logger = Logger(subsystem: "org.useorbit.widget", category: "timeline")

struct OrbitEntry {
  let date: Date
  let payload: WidgetPayload?
  let signedOut: Bool
  let colors: [String: String]
  var language: String = Locale.current.identifier

  var reloadPolicy: TimelineReloadPolicy {
    signedOut ? .never : .after(date.addingTimeInterval(900))
  }
}

struct WidgetTimeline {
  var makeStore: () throws -> WidgetStore = WidgetStore.configured
  var currentDate: () -> Date = Date.init
  var apiBase: String? = Bundle.main.object(forInfoDictionaryKey: "OrbitWidgetAPIBase") as? String
  var session: URLSession = .shared

  func entries(for entry: OrbitEntry) -> [OrbitEntry] {
    guard entry.payload != nil, let midnight = Calendar.current.dateInterval(of: .day, for: entry.date)?.end else {
      return [entry]
    }
    return [entry, OrbitEntry(date: midnight, payload: nil, signedOut: false, colors: entry.colors, language: entry.language)]
  }

  func getTimeline(completion: @escaping (OrbitEntry) -> Void) {
    do {
      let store = try makeStore()
      guard let token = try store.token() else { completion(readEntry()); return }
      let requestedAt = currentDate()
      if let cache = try store.cachedPayload(), Calendar.current.isDate(cache.updatedAt, inSameDayAs: requestedAt),
         (0..<60).contains(requestedAt.timeIntervalSince(cache.updatedAt)) {
        completion(readEntry())
        return
      }
      guard let base = apiBase, let url = URL(string: "\(base)/api/habits/widget") else {
        throw WidgetStoreError.unavailable
      }
      var request = URLRequest(url: url, timeoutInterval: 10)
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      session.dataTask(with: request) { bytes, response, error in
        do {
          guard try store.token() == token else {
            completion(readEntry())
            return
          }
          if (response as? HTTPURLResponse)?.statusCode == 401 {
            try store.clearToken()
            completion(readEntry())
            return
          }
          if let error { throw error }
          guard (response as? HTTPURLResponse)?.statusCode == 200, let bytes else {
            throw WidgetStoreError.unavailable
          }
          let receivedAt = currentDate()
          if Calendar.current.isDate(requestedAt, inSameDayAs: receivedAt) {
            try store.savePayload(String(decoding: bytes, as: UTF8.self), authorizingToken: token, updatedAt: receivedAt)
          }
          completion(readEntry())
        } catch {
          logger.error("Widget refresh failed: \(String(describing: error), privacy: .public)")
          completion(readEntry())
        }
      }.resume()
    } catch {
      logger.error("Widget storage unavailable: \(String(describing: error), privacy: .public)")
      completion(readEntry())
    }
  }

  func readEntry() -> OrbitEntry {
    do {
      let store = try makeStore()
      let now = currentDate()
      let cache = try store.cachedPayload()
      let current = cache.flatMap { Calendar.current.isDate($0.updatedAt, inSameDayAs: now) ? $0.payload : nil }
      let signedOut = try store.token() == nil
      return OrbitEntry(date: now, payload: signedOut ? nil : current, signedOut: signedOut, colors: try store.theme(),
                        language: try cache?.payload.language ?? store.language() ?? Locale.current.identifier)
    } catch {
      logger.error("Widget snapshot unavailable: \(String(describing: error), privacy: .public)")
      return OrbitEntry(date: currentDate(), payload: nil, signedOut: false, colors: [:])
    }
  }
}
