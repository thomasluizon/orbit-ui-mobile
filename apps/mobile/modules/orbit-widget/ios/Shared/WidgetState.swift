import Foundation

struct WidgetHabit: Codable {
  let id: String
  let title: String
  let isCompleted: Bool
  let isOverdue: Bool
  let dueTime: String?
  let checklistChecked: Int
  let checklistTotal: Int
  let isBadHabit: Bool
  let children: [WidgetHabit]
  let hasSubHabits: Bool
}

struct WidgetPayload: Codable {
  let dayOffset: Int
  let language: String
  let currentStreak: Int
  let items: [WidgetHabit]
  let emptyReason: String?
  let uses24HourClock: Bool

  var isTomorrow: Bool { dayOffset == 1 }

  var rows: [WidgetRow] {
    items.flatMap { habit -> [WidgetRow] in
      let counting = habit.children.filter { !$0.isBadHabit }
      let childrenDone = isTomorrow ? 0 : counting.filter(\.isCompleted).count
      let done = !isTomorrow && (habit.isCompleted || (!counting.isEmpty && childrenDone == counting.count))
      let parent = WidgetRow(habit: habit, done: done, tomorrow: isTomorrow, depth: 0,
                             childrenDone: childrenDone, childrenTotal: counting.count, deeperCount: 0)
      return [parent] + habit.children.map { child in
        WidgetRow(habit: child, done: !isTomorrow && child.isCompleted, tomorrow: isTomorrow,
                  depth: 1, childrenDone: 0, childrenTotal: 0, deeperCount: Self.descendantCount(child))
      }
    }
  }

  var totalCount: Int {
    rows.filter { $0.depth == 0 }.reduce(0) { $0 + ($1.childrenTotal > 0 ? $1.childrenTotal : ($1.habit.isBadHabit ? 0 : 1)) }
  }

  var completedCount: Int {
    rows.filter { $0.depth == 0 }.reduce(0) {
      $0 + ($1.childrenTotal > 0 ? $1.childrenDone : (!$1.habit.isBadHabit && $1.done ? 1 : 0))
    }
  }

  var emptyKey: String { emptyReason == "nothing-scheduled" ? "nothingScheduled" : "allClear" }

  private static func descendantCount(_ habit: WidgetHabit) -> Int {
    habit.children.count + habit.children.reduce(0) { $0 + descendantCount($1) }
  }
}

struct WidgetRow: Identifiable {
  let habit: WidgetHabit
  let done: Bool
  let tomorrow: Bool
  let depth: Int
  let childrenDone: Int
  let childrenTotal: Int
  let deeperCount: Int

  var id: String { habit.id }
  var overdue: Bool { !tomorrow && !done && habit.isOverdue }
  var statusKey: String { done ? "done" : (overdue ? "overdue" : "pending") }
  var statusSymbol: String { done ? "checkmark.square.fill" : (overdue ? "exclamationmark.square" : "square") }
}

func widgetTime(_ time: String, uses24HourClock: Bool, language: String) -> String {
  let parts = time.split(separator: ":")
  guard parts.count >= 2, let hour = Int(parts[0]), let minute = Int(parts[1]),
        (0...23).contains(hour), (0...59).contains(minute) else { return time }
  if uses24HourClock { return String(format: "%02d:%02d", hour, minute) }
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: language)
  let period = hour < 12 ? formatter.amSymbol! : formatter.pmSymbol!
  return String(format: "%d:%02d %@", (hour + 11) % 12 + 1, minute, period)
}
