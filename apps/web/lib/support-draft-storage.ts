export const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

/**
 * The one owner of the stored support draft. The key carries no account, and the browser
 * keeps it through a sign out and a hard navigation, so the person who signs in next would
 * read the previous person's subject and message straight back into the form.
 */
export function readStoredSupportDraft(): string | null {
  try {
    return globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Stores the serialized support draft, and does nothing when storage refuses the write. */
export function writeStoredSupportDraft(draft: string): void {
  try {
    globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, draft)
  } catch {
    return
  }
}

/** Removes the stored support draft so the next account cannot read it back. */
export function forgetStoredSupportDraft(): void {
  try {
    globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
  } catch {
    return
  }
}
