import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE_PATH } from './e2e/support/env'

const baseURL = process.env.SMOKE_BASE_URL

if (!baseURL) {
  throw new Error(
    'SMOKE_BASE_URL is required (the prod web origin to smoke-test, e.g. https://app.useorbit.org).',
  )
}

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 412, height: 915 },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: /global\.teardown\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE_PATH,
      },
    },
    {
      name: 'smoke',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        storageState: STORAGE_STATE_PATH,
      },
    },
  ],
})
