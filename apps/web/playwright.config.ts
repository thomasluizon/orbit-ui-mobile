import { defineConfig, devices } from '@playwright/test'
import { LAYOUT_ORIGIN, LAYOUT_STORAGE_STATE_PATH, STORAGE_STATE_PATH } from './e2e/support/env'

if (process.argv.includes('--project=layout')) process.env.LAYOUT = '1'
const isLayout = process.env.LAYOUT === '1'
const baseURL = isLayout ? LAYOUT_ORIGIN : process.env.SMOKE_BASE_URL

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
  expect: {
    timeout: 15_000,
  },
  reporter: isLayout ? (isCI ? [['github'], ['list']] : [['list']]) : isCI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 412, height: 915 },
  },
  webServer: isLayout ? [
    {
      command: 'npx tsx test-support/hermetic/mock-api/server.ts',
      url: 'http://127.0.0.1:5099/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run start',
      url: LAYOUT_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_BASE: 'http://127.0.0.1:5099' },
    },
  ] : undefined,
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
      testIgnore: /layout[\\/]/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        storageState: STORAGE_STATE_PATH,
      },
    },
    {
      name: 'layout-setup',
      testMatch: /layout\.setup\.ts/,
      use: { screenshot: 'off', video: 'off', trace: 'off' },
    },
    {
      name: 'layout',
      testDir: './e2e/layout',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['layout-setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: LAYOUT_ORIGIN,
        contextOptions: { reducedMotion: 'reduce' },
        colorScheme: 'dark',
        timezoneId: 'UTC',
        storageState: LAYOUT_STORAGE_STATE_PATH,
        screenshot: 'off',
        video: 'off',
        trace: 'off',
      },
    },
  ],
})
