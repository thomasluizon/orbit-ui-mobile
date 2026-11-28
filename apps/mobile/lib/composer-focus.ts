import type { RefObject } from 'react'
import type { TextInput } from 'react-native'

let composerInput: RefObject<TextInput | null> | null = null

/** The composer registers its input here. It returns a function that removes the entry. */
export function registerComposerInput(input: RefObject<TextInput | null>): () => void {
  composerInput = input
  return () => { if (composerInput === input) composerInput = null }
}

/** Moves focus to the composer input. A block that closes calls this. */
export function focusComposerInput(): void {
  composerInput?.current?.focus()
}
