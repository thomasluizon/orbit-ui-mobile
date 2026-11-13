export type HabitWhenChoice = 'today' | 'tomorrow' | 'everyDay' | 'noDate'

/** The form fields the flow writes. The platform form hook supplies the port, so the logic stays shared. */
export interface HabitFlowFormPort {
  setField: (field: 'dueDate' | 'dueTime' | 'dueEndTime' | 'datePhrase' | 'dateIssue' | 'frequencyUnit' | 'frequencyQuantity', value: string | number | null) => void
  chooseItemType: (type: 'task' | 'habit') => void
  setOneTime: () => void
  setRecurring: (restoreDraft?: boolean) => void
  setGeneral: () => void
  setReminderEnabled: (enabled: boolean) => void
}

/** A calendar date shifted by whole days, in the account calendar and with no time zone drift. */
export function shiftCalendarDate(date: string, days: number): string {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number)
  const calendar = new Date(0)
  calendar.setUTCFullYear(year, month - 1, day + days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(calendar.getUTCFullYear()).padStart(4, '0')}-${pad(calendar.getUTCMonth() + 1)}-${pad(calendar.getUTCDate())}`
}

/**
 * A quick option of the "when" step. The type is a result: a repetition makes a habit, a date or no date
 * makes a task. The writes match the ones the current form makes for the same choice.
 */
export function answerHabitWhen(port: HabitFlowFormPort, choice: HabitWhenChoice, today: string): void {
  port.setField('datePhrase', '')
  port.setField('dateIssue', '')
  if (choice === 'noDate') {
    port.chooseItemType('task')
    port.setGeneral()
    return
  }
  if (choice === 'everyDay') {
    port.chooseItemType('habit')
    port.setRecurring()
    port.setField('frequencyUnit', 'Day')
    port.setField('frequencyQuantity', 1)
    port.setField('dueDate', today)
    return
  }
  port.chooseItemType('task')
  port.setOneTime()
  port.setField('dueDate', choice === 'tomorrow' ? shiftCalendarDate(today, 1) : today)
}

/** A quick option of the "time" step. `null` is "no set time". */
export function answerHabitTime(port: HabitFlowFormPort, time: string | null): void {
  port.setField('dueTime', time ?? '')
  if (time === null) {
    port.setField('dueEndTime', '')
    port.setReminderEnabled(false)
  }
}

/** The reminder step turns the reminder on with the default times, or leaves it off. */
export function answerHabitReminder(port: HabitFlowFormPort, remind: boolean): void {
  port.setReminderEnabled(remind)
}

/** The "HH:mm" value of a quick time option. The label follows the person's clock setting, so it comes from `Intl`. */
export const HABIT_TIME_OPTIONS = ['08:00', '14:00', '20:00'] as const
