import { MAX_HABIT_LOG_NOTE_LENGTH } from './constants'

export function validateHabitLogNote(note: string | null | undefined): string | null {
  if (!note) return null

  if (note.length > MAX_HABIT_LOG_NOTE_LENGTH) {
    return 'habits.log.noteTooLong'
  }

  return null
}
