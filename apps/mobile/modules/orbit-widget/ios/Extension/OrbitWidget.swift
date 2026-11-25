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

// Geometry of the Android widget (widget_dimens.xml), one point for one dp.
// The header is 48, each row is 48 and the remainder line is 24.
private let headerHeight: CGFloat = 48
private let rowHeight: CGFloat = 48
private let remainderHeight: CGFloat = 24

struct WidgetRowFit {
  let visible: Int
  let hidden: Int
}

// The same rule as the Android canvas: the row count comes from the real height. Where the habits do not fit,
// one row gives up its place so that the remainder line can state the rest.
func widgetRowFit(height: CGFloat, rowCount: Int) -> WidgetRowFit {
  let available = max(0, height - headerHeight)
  let fit = max(1, Int(available / rowHeight))
  if rowCount <= fit { return WidgetRowFit(visible: rowCount, hidden: 0) }
  let withRemainder = Int(max(0, available - remainderHeight) / rowHeight)
  if withRemainder >= 1 { return WidgetRowFit(visible: withRemainder, hidden: rowCount - withRemainder) }
  return WidgetRowFit(visible: fit, hidden: 0)
}

// Space Grotesk titles the card and Geist sets the rows, as in the app. Both files ship in the extension bundle.
private enum OrbitFont {
  static func display(_ size: CGFloat) -> Font { .custom("SpaceGrotesk-SemiBold", size: size, relativeTo: .body) }
  static func body(_ size: CGFloat) -> Font { .custom("Geist-Regular", size: size, relativeTo: .body) }
  static func label(_ size: CGFloat) -> Font { .custom("Geist-Regular", size: size, relativeTo: .caption) }
}

// The done mark of widget_status_done.xml: a disc with the check cut out of it. Drawn in a 20 by 20 viewport.
private struct DoneMark: Shape {
  func path(in rect: CGRect) -> Path {
    let scale = rect.width / 20
    func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * scale, y: y * scale) }
    var path = Path()
    path.addEllipse(in: CGRect(x: 0, y: 0, width: 20 * scale, height: 20 * scale))
    path.addLines([point(4.2, 10.1), point(8.1, 14), point(15.8, 6.3), point(17.2, 7.7), point(8.1, 16.8), point(2.8, 11.5)])
    path.closeSubpath()
    return path
  }
}

// The overdue mark of widget_status_overdue.xml: a triangle, a stem and a dot, in a 20 by 20 viewport.
private struct OverdueTriangle: Shape {
  func path(in rect: CGRect) -> Path {
    let scale = rect.width / 20
    var path = Path()
    path.move(to: CGPoint(x: 10 * scale, y: 2.2 * scale))
    path.addLine(to: CGPoint(x: 18 * scale, y: 17 * scale))
    path.addLine(to: CGPoint(x: 2 * scale, y: 17 * scale))
    path.closeSubpath()
    return path
  }
}

private struct OverdueStem: Shape {
  func path(in rect: CGRect) -> Path {
    let scale = rect.width / 20
    var path = Path()
    path.move(to: CGPoint(x: 10 * scale, y: 7 * scale))
    path.addLine(to: CGPoint(x: 10 * scale, y: 11 * scale))
    return path
  }
}

private struct OverdueDot: Shape {
  func path(in rect: CGRect) -> Path {
    let scale = rect.width / 20
    return Path(ellipseIn: CGRect(x: 9 * scale, y: 12 * scale, width: 2 * scale, height: 2 * scale))
  }
}

private struct OverdueMark: View {
  let color: Color
  // widget_status_overdue.xml is 18 wide with a 20 unit viewport.
  private let size: CGFloat = 18

  var body: some View {
    let stroke = StrokeStyle(lineWidth: 1.7 * size / 20, lineCap: .round, lineJoin: .round)
    ZStack {
      OverdueTriangle().stroke(color, style: stroke)
      OverdueStem().stroke(color, style: stroke)
      OverdueDot().fill(color)
    }
    .frame(width: size, height: size)
  }
}

private struct OrbitWidgetCard: View {
  let entry: OrbitEntry
  let size: CGSize
  @Environment(\.colorScheme) private var colorScheme

  private var language: String { entry.language }
  private var locale: Locale { Locale(identifier: language) }
  // The 2 by 2 Android widget drops the times. The small family is as narrow, and the Android canvas breaks at 200.
  private var showsTimes: Bool { size.width > 200 }
  private var listHeight: CGFloat { max(0, size.height - headerHeight) }

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
    VStack(alignment: .leading, spacing: 0) {
      header
      content
      Spacer(minLength: 0)
    }
    .frame(width: size.width, height: size.height, alignment: .top)
  }

  @ViewBuilder private var content: some View {
    if entry.signedOut {
      message(text("signIn"))
    } else if let payload = entry.payload {
      if payload.rows.isEmpty {
        message(text(payload.emptyKey))
      } else {
        list(payload)
      }
    } else {
      loadingSkeleton
    }
  }

  // The empty line and the signed out line share one style, as in the Android widget_empty_text.
  private func message(_ words: String) -> some View {
    Text(words).font(OrbitFont.body(15)).foregroundStyle(color("textPrimary"))
      .lineLimit(2).padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: rowHeight, alignment: .leading)
  }

  private func list(_ payload: WidgetPayload) -> some View {
    let rows = payload.rows
    let fit = widgetRowFit(height: size.height, rowCount: rows.count)
    return VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(rows.prefix(fit.visible))) { row in rowView(row, payload: payload) }
      if fit.hidden > 0 {
        Text(String(format: text("more"), locale: locale, fit.hidden))
          .font(OrbitFont.label(12)).foregroundStyle(color("textMuted")).lineLimit(1)
          .padding(.horizontal, 12)
          .frame(maxWidth: .infinity, minHeight: remainderHeight, maxHeight: remainderHeight, alignment: .leading)
      }
    }
  }

  // The same skeleton rows as the Android widget: a status mark and a bar per row, in the well colour, named for VoiceOver.
  private var loadingSkeleton: some View {
    let widths: [CGFloat] = [150, 126, 102, 78, 54]
    let rowCount = max(1, min(Int(listHeight / 48), widths.count))
    return VStack(alignment: .leading, spacing: 0) {
      ForEach(0..<rowCount, id: \.self) { index in
        HStack(spacing: 10) {
          Circle().fill(color("surface")).frame(width: 20, height: 20)
          RoundedRectangle(cornerRadius: 6).fill(color("surface")).frame(width: widths[index], height: 12)
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(height: 48)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(text("loading"))
  }

  // The header of the Android widget: the day label over the progress figure, the streak at the end, a hairline below.
  private var header: some View {
    HStack(alignment: .center, spacing: 10) {
      VStack(alignment: .leading, spacing: 0) {
        Text(verbatim: entry.signedOut ? "Orbit" : text(entry.payload?.isTomorrow == true ? "tomorrow" : "today"))
          .font(OrbitFont.display(13)).foregroundStyle(color("textMuted")).lineLimit(1)
        subtitle
      }
      Spacer(minLength: 0)
      streak
    }
    .padding(.horizontal, 12)
    .frame(height: headerHeight)
    .overlay(alignment: .bottom) { Rectangle().fill(color("border")).frame(height: 1) }
    .accessibilityElement(children: .combine)
  }

  // The progress figure is the only one on the card. It falls back to a short x/y when the words do not fit.
  @ViewBuilder private var subtitle: some View {
    if entry.signedOut {
      Text(text("signIn")).font(OrbitFont.label(12)).foregroundStyle(color("textMuted")).lineLimit(1)
    } else if let payload = entry.payload {
      ViewThatFits(in: .horizontal) {
        Text(String(format: text("progress"), locale: locale, payload.completedCount, payload.totalCount))
          .lineLimit(1).fixedSize(horizontal: true, vertical: false)
        Text("\(payload.completedCount)/\(payload.totalCount)").lineLimit(1)
      }
      .font(OrbitFont.label(12)).monospacedDigit().foregroundStyle(color("textMuted"))
    }
  }

  // The streak hides at zero, and the unit drops first when the header is narrow.
  @ViewBuilder private var streak: some View {
    if !entry.signedOut, let payload = entry.payload, payload.currentStreak > 0 {
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .firstTextBaseline, spacing: 4) { streakFigure(payload.currentStreak); streakUnit(payload.currentStreak) }
          .fixedSize(horizontal: true, vertical: false)
        streakFigure(payload.currentStreak).fixedSize(horizontal: true, vertical: false)
      }
    }
  }

  private func streakFigure(_ days: Int) -> some View {
    Text("\(days)").font(OrbitFont.display(15)).monospacedDigit().foregroundStyle(color("streakText")).lineLimit(1)
  }

  private func streakUnit(_ days: Int) -> some View {
    Text(text(days == 1 ? "day" : "days")).font(OrbitFont.label(12)).foregroundStyle(color("textMuted")).lineLimit(1)
  }

  @ViewBuilder private func statusMark(_ row: WidgetRow) -> some View {
    Group {
      if row.done {
        DoneMark().fill(color("textPrimary"), style: FillStyle(eoFill: true))
      } else if row.overdue {
        OverdueMark(color: color("overdue"))
      } else {
        Circle().stroke(color("statusEmpty"), lineWidth: 1.5).frame(width: 17, height: 17)
      }
    }
    .frame(width: 20, height: 20)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(text(row.statusKey))
  }

  private func badge(_ words: String) -> some View {
    Text(words).font(OrbitFont.label(12)).monospacedDigit().foregroundStyle(color("textSecondary")).lineLimit(1)
      .padding(.horizontal, 8)
      .frame(height: 18)
      .background(RoundedRectangle(cornerRadius: 8).fill(color("surface")))
      .fixedSize(horizontal: true, vertical: true)
  }

  private func rowView(_ row: WidgetRow, payload: WidgetPayload) -> some View {
    HStack(spacing: 10) {
      statusMark(row)
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 8) {
          Text(row.habit.title).font(OrbitFont.body(15)).lineLimit(1)
            .foregroundStyle(color(row.done ? "textMuted" : "textPrimary"))
          if row.childrenTotal > 0 { badge("\(row.childrenDone)/\(row.childrenTotal)") }
          if row.habit.checklistTotal > 0 {
            badge(String(format: text("checklist"), "\(row.habit.checklistChecked)/\(row.habit.checklistTotal)"))
          }
        }
        if showsTimes, let time = row.habit.dueTime {
          Text(widgetTime(time, uses24HourClock: payload.uses24HourClock, language: language))
            .font(OrbitFont.label(12)).monospacedDigit().tracking(0.24).lineLimit(1)
            .foregroundStyle(color(row.overdue ? "overdue" : "textMuted"))
        }
      }
      Spacer(minLength: 0)
      if row.deeperCount > 0 {
        Text(String(format: text("inside"), row.deeperCount))
          .font(OrbitFont.label(12)).monospacedDigit().foregroundStyle(color("textMuted")).lineLimit(1)
          .fixedSize(horizontal: true, vertical: false)
      }
    }
    .padding(.leading, row.depth == 0 ? 12 : 32)
    .padding(.trailing, 12)
    .frame(height: rowHeight)
    .accessibilityElement(children: .combine)
  }
}

struct OrbitWidgetView: View {
  let entry: OrbitEntry
  @Environment(\.colorScheme) private var colorScheme

  private var backgroundHex: String {
    let mode = colorScheme == .dark ? "dark" : "light"
    return entry.colors["\(mode)_background"] ?? WidgetColorFallbacks.values["\(mode)_background"] ?? "#000000"
  }

  private var background: Color {
    let rgb = UInt64(backgroundHex.dropFirst(), radix: 16) ?? 0
    return Color(red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255)
  }

  var body: some View {
    GeometryReader { proxy in OrbitWidgetCard(entry: entry, size: proxy.size) }
      .widgetURL(URL(string: Bundle.main.object(forInfoDictionaryKey: "OrbitWidgetURL") as? String ?? "orbit:///"))
      .containerBackground(for: .widget) { background }
      .environment(\.locale, Locale(identifier: entry.language))
      // A limit that keeps the 48 point header and rows whole on the smallest family.
      .dynamicTypeSize(...DynamicTypeSize.xLarge)
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
      // The card draws its own 12 point inset, so the system margin would shrink the 48 point rows.
      .contentMarginsDisabled()
  }
}
