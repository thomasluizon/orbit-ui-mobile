import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE_PATH, VISUAL_STORAGE_STATE_PATH } from './e2e/support/env'

const baseURL = process.env.SMOKE_BASE_URL

if (!baseURL) {
  throw new Error(
    'SMOKE_BASE_URL is required (the prod web origin to smoke-test, e.g. https://app.useorbit.org; or http://127.0.0.1:3000 for the hermetic visual suite).',
  )
}

const isCI = !!process.env.CI
const isVisual = process.env.VISUAL === '1'

const visualWebServers = [
  {
    command: 'npx tsx e2e/visual/mock-api/server.ts',
    url: 'http://127.0.0.1:5099/health',
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
  {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: { API_BASE: 'http://127.0.0.1:5099' },
  },
]

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
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
      stylePath: './e2e/visual/screenshot.css',
    },
  },
  snapshotPathTemplate: './e2e/visual/__screenshots__/{testFileName}/{arg}{ext}',
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
  webServer: isVisual ? visualWebServers : undefined,
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
    {
      name: 'visual-setup',
      testMatch: /visual\.setup\.ts/,
    },
    {
      name: 'visual',
      testMatch: /.*\.visual\.ts/,
      dependencies: ['visual-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 1,
        contextOptions: { reducedMotion: 'reduce' },
        colorScheme: 'dark',
        timezoneId: 'UTC',
        locale: 'en-US',
        storageState: VISUAL_STORAGE_STATE_PATH,
      },
    },
  ],
})
