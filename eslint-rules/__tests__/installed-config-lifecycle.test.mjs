import { ESLint, RuleTester } from 'eslint'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let initialConfigLoading
beforeAll(async () => {
  const cwd = fileURLToPath(new URL('../../apps/web/', import.meta.url))
  initialConfigLoading = new ESLint({ cwd }).calculateConfigForFile('e2e/layout/animation-settlement.spec.ts')
  await initialConfigLoading
}, 15000)

afterAll(async () => {
  await initialConfigLoading
}, 15000)

afterEach(() => {
  vi.doUnmock('vitest')
  vi.restoreAllMocks()
  vi.resetModules()
})

async function collectIntegration() {
  const setup = []
  const teardown = []
  const cases = []
  vi.doMock('vitest', async () => ({
    ...await vi.importActual('vitest'),
    beforeAll: (hook) => { setup.push(hook) },
    afterAll: (hook) => { teardown.push(hook) },
    describe: () => undefined,
    it: (name, run) => { cases.push({ name, run }) },
  }))
  const registrations = { describe: RuleTester.describe, it: RuleTester.it, afterAll: RuleTester.afterAll }
  try {
    await import('./no-rejecting-animation-wait.test.mjs')
  } finally {
    Object.assign(RuleTester, registrations)
  }
  const integration = cases.find(({ name }) => name === 'enforces the web e2e scope through the installed ESLint config')
  expect(integration).toBeDefined()
  return { setup, teardown, run: integration.run }
}

function deferInstalledConfig() {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const calculate = ESLint.prototype.calculateConfigForFile
  let completed = false
  vi.spyOn(ESLint.prototype, 'calculateConfigForFile').mockImplementation(async function (filename) {
    const config = await calculate.call(this, filename)
    await gate
    completed = true
    return config
  })
  return { release, completed: () => completed }
}

async function runHooks(hooks) {
  for (const hook of hooks) await hook()
}

describe('installed web configuration lifecycle', () => {
  it('finishes the real configuration before entering the timed assertion', async () => {
    const loading = deferInstalledConfig()
    const integration = await collectIntegration()
    const setup = runHooks(integration.setup)
    try {
      expect(loading.completed()).toBe(false)
      loading.release()
      await setup
      expect(loading.completed()).toBe(true)
      await integration.run()
    } finally {
      loading.release()
      await setup
      await runHooks(integration.teardown)
    }
  })

  it('retains unfinished real configuration loading through teardown', async () => {
    const loading = deferInstalledConfig()
    const integration = await collectIntegration()
    const setup = runHooks(integration.setup)
    let drained = false
    const teardown = runHooks(integration.teardown)
      .then(() => { drained = true })
    try {
      await Promise.resolve()
      expect(drained).toBe(false)
      expect(loading.completed()).toBe(false)
    } finally {
      loading.release()
      await Promise.all([setup, teardown])
    }
    expect(loading.completed()).toBe(true)
    expect(drained).toBe(true)
  })

  it('reports a real producer rejection from setup and teardown', async () => {
    const calculate = ESLint.prototype.calculateConfigForFile
    vi.spyOn(ESLint.prototype, 'calculateConfigForFile').mockImplementation(function () {
      return calculate.call(this, '')
    })
    const integration = await collectIntegration()
    const setup = runHooks(integration.setup)
    const teardown = runHooks(integration.teardown)
    await Promise.all([
      expect(setup).rejects.toThrow("'filePath' must be a non-empty string"),
      expect(teardown).rejects.toThrow("'filePath' must be a non-empty string"),
    ])
  })
})
