import SwiftUI
import WidgetKit

extension OrbitEntry: TimelineEntry {}

struct OrbitProvider: TimelineProvider {
  private let timeline = WidgetTimeline()

  func placeholder(in context: Context) -> OrbitEntry {
    OrbitEntry(date: Date(), payload: nil, signedOut: false, colors: [:])
  }

  func getSnapshot(in context: Context, completion: @escaping (OrbitEntry) -> Void) {
    completion(timeline.readEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<OrbitEntry>) -> Void) {
    timeline.getTimeline { entry in
      completion(Timeline(entries: timeline.entries(for: entry), policy: entry.reloadPolicy))
    }
  }
}

struct OrbitWidgetView: View {
  let entry: OrbitEntry
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.widgetFamily) private var family
  @Environment(\.dynamicTypeSize) private var typeSize

  private var language: String { entry.language }
  private var locale: Locale { Locale(identifier: language) }
  private var rowLimit: Int { typeSize.isAccessibilitySize || family == .systemSmall ? 1 : (family == .systemLarge ? 5 : 2) }

  private func text(_ key: String) -> String {
    let code = language.hasPrefix("pt") ? "pt-BR" : "en"
    let bundle = Bundle.main.path(forResource: code, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
    return bundle.localizedString(forKey: key, value: nil, table: nil)
  }

  private func color(_ role: String) -> Color {
    let mode = colorScheme == .dark ? "dark" : "light"
    let fallback = WidgetColorFallbacks.values["\(mode)_\(role)"] ?? "#000000"
    let hex = entry.colors["\(mode)_\(role)"] ?? fallback
    let rgb = UInt64(hex.dropFirst(), radix: 16) ?? 0
    return Color(red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255)
  }

  var body: some View {
    ViewThatFits(in: .vertical) {
      content(showRows: true)
      content(showRows: false)
    }
    .widgetURL(URL(string: Bundle.main.object(forInfoDictionaryKey: "OrbitWidgetURL") as? String ?? "orbit:///"))
    .containerBackground(for: .widget) { color("background") }
    .environment(\.locale, locale)
  }

  private func content(showRows: Bool) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      header
      if entry.signedOut {
        Text(text("signIn")).font(.body).foregroundStyle(color("textPrimary"))
      } else if let payload = entry.payload {
        if payload.rows.isEmpty {
          Text(text(payload.emptyKey)).font(.body).foregroundStyle(color("textPrimary"))
        } else if showRows {
          ForEach(Array(payload.rows.prefix(rowLimit))) { row in rowView(row, payload: payload) }
          let remaining = payload.rows.count - rowLimit
          if remaining > 0 { Text(String(format: text("more"), locale: locale, remaining)).font(.caption).foregroundStyle(color("textMuted")) }
        } else {
          Text(String(format: text("more"), locale: locale, payload.rows.count)).font(.body).foregroundStyle(color("textMuted"))
        }
      } else {
        Text(text("loading")).font(.body).foregroundStyle(color("textMuted"))
      }
      Spacer(minLength: 0)
    }
  }

  private var header: some View {
    ViewThatFits(in: .horizontal) {
      HStack(alignment: .top) { dayHeading; Spacer(minLength: 8); streak }
      VStack(alignment: .leading, spacing: 4) { dayHeading; streak }
    }
  }

  private var dayHeading: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(text(entry.payload?.isTomorrow == true ? "tomorrow" : "today"))
        .font(.headline).foregroundStyle(color("textPrimary"))
      if let payload = entry.payload {
        Text(String(format: text("progress"), locale: locale, payload.completedCount, payload.totalCount))
          .font(.caption).foregroundStyle(color("textMuted"))
      }
    }
  }

  @ViewBuilder private var streak: some View {
    if let payload = entry.payload, payload.currentStreak > 0 {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(payload.currentStreak)").font(.headline.monospacedDigit()).foregroundStyle(color("streakText"))
        Text(text(payload.currentStreak == 1 ? "day" : "days")).font(.caption).foregroundStyle(color("textMuted"))
      }
    }
  }

  private func rowView(_ row: WidgetRow, payload: WidgetPayload) -> some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: row.statusSymbol).accessibilityLabel(text(row.statusKey))
        .foregroundStyle(color(row.done ? "textPrimary" : (row.overdue ? "overdue" : "statusEmpty")))
      VStack(alignment: .leading, spacing: 2) {
        Text(row.habit.title).font(.subheadline).lineLimit(2)
          .foregroundStyle(color(row.done ? "textMuted" : "textPrimary"))
        HStack(spacing: 8) {
          if let time = row.habit.dueTime {
            Text(widgetTime(time, uses24HourClock: payload.uses24HourClock, language: language))
          }
          if row.childrenTotal > 0 { Text("\(row.childrenDone)/\(row.childrenTotal)") }
          if row.habit.checklistTotal > 0 {
            Text(String(format: text("checklist"), "\(row.habit.checklistChecked)/\(row.habit.checklistTotal)"))
          }
          if row.deeperCount > 0 { Text(String(format: text("inside"), row.deeperCount)) }
        }.font(.caption2).foregroundStyle(color(row.overdue ? "overdue" : "textMuted"))
      }
      Spacer(minLength: 0)
    }
    .padding(.leading, row.depth == 0 ? 0 : 12)
    .accessibilityElement(children: .combine)
  }
}

@main
struct OrbitHomeWidget: Widget {
  let kind = "OrbitWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: OrbitProvider()) { OrbitWidgetView(entry: $0) }
      .configurationDisplayName("Orbit")
      .description(LocalizedStringKey("description"))
      .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
