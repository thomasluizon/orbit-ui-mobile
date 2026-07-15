function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for the prod smoke suite (set it as a CI secret).`)
  }
  return value
}

/** Resolved smoke-run configuration sourced from CI secrets. Values are read
 *  lazily (getters) so that merely importing this module — as the shared
 *  `playwright.config.ts` does for every project, including the hermetic visual
 *  suite that has no smoke secrets — never throws; only the smoke setup that
 *  actually reads a value fails fast when its secret is missing. */
export const smokeEnv = {
  get testEmail(): string {
    return required('SMOKE_TEST_EMAIL')
  },
  get testCode(): string {
    return required('SMOKE_TEST_CODE')
  },
} as const

export const STORAGE_STATE_PATH = 'e2e/.auth/smoke-user.json'

/** Saved storage state for the hermetic visual suite (fake-JWT session, no prod). */
export const VISUAL_STORAGE_STATE_PATH = 'e2e/.auth/visual-user.json'
