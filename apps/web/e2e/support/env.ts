function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for the prod smoke suite (set it as a CI secret).`)
  }
  return value
}

/** Resolved smoke-run configuration sourced from CI secrets. Values are read
 *  lazily (getters) so merely importing this module from `playwright.config.ts`
 *  never throws. Only the smoke setup that reads a value fails fast when its
 *  secret is missing. */
export const smokeEnv = {
  get testEmail(): string {
    return required('SMOKE_TEST_EMAIL')
  },
  get testCode(): string {
    return required('SMOKE_TEST_CODE')
  },
} as const

export const STORAGE_STATE_PATH = 'e2e/.auth/smoke-user.json'
export const LAYOUT_STORAGE_STATE_PATH = 'e2e/.auth/layout-user.json'
export const LAYOUT_ORIGIN = 'http://127.0.0.1:3000'
