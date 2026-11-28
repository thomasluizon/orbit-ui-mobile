let focusedField: object | null = null

export function markFieldFocused(field: object) {
  focusedField = field
}

export function markFieldBlurred(field: object) {
  if (focusedField === field) focusedField = null
}

export function isFieldFocused() {
  return focusedField !== null
}
