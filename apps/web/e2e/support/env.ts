function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for the prod smoke suite (set it as a CI secret).`)
  }
  return value
}

/** Resolved, validated smoke-run configuration sourced from CI secrets.
 *  Throws at import time if any required value is missing so a misconfigured
 *  run fails fast instead of hitting prod with empty credentials. */
export const smokeEnv = {
  testEmail: required('SMOKE_TEST_EMAIL'),
  testCode: required('SMOKE_TEST_CODE'),
} as const

export const STORAGE_STATE_PATH = 'e2e/.auth/smoke-user.json'
