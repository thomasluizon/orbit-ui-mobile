import { MAX_TAG_NAME_LENGTH } from './constants'

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export function validateTagForm(name: string, color: string): string | null {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return 'habits.form.tagNameRequired'
  }

  if (trimmedName.length > MAX_TAG_NAME_LENGTH) {
    return 'habits.form.tagNameTooLong'
  }

  if (!HEX_COLOR_PATTERN.test(color)) {
    return 'habits.form.tagColorInvalid'
  }

  return null
}
