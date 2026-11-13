import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

// Window bar inspection of the Windows installed acceptance (#2132): inspectWindowBar in acceptance-runner.mjs, driven
// through its real source with a fake proxy and a scripted native window model.
const catalogues = ['en', 'pt-BR'].map((locale) =>
  JSON.parse(readFileSync(new URL(`../../packages/shared/src/i18n/${locale}.json`, import.meta.url), 'utf8')) as { desktopWindow: Record<string, string> })

type Options = {
  captionHeight?: number
  menuBar?: boolean
  color?: Record<string, number[]>
  dragDistance?: number
  locale?: 0 | 1
  buttons?: string[]
  doubleClickWorks?: boolean
}

const canvas: Record<string, number[]> = { light: [250, 250, 250], dark: [9, 9, 11] }
const pageCanvas: Record<string, string> = { light: '#FAFAFA', dark: '#09090B' }

function windowContext(options: Options = {}) {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const inspect = runner.slice(runner.indexOf('const barCanvas'), runner.indexOf('async function installedLaunch'))
  const host = readFileSync(new URL('./host.mjs', import.meta.url), 'utf8')
  const polling = host.slice(host.indexOf('export async function waitFor('), host.indexOf('export async function waitForHttp'))
    .replace('export async function', 'async function')
  let elapsed = 0
  let mode = 'light'
  const sent: string[] = []
  const calls: { action: string; label?: string; capture: string }[] = []
  const names = catalogues[options.locale ?? 0]!.desktopWindow
  const state = { rect: [0, 0, 800, 600], zoomed: false, iconic: false, visible: true }
  const proxy = {
    send(command: string) { sent.push(command); mode = command.replace('appearance-', '') },
    read(kind: string) { return sent.includes(kind) ? { kind, canvas: pageCanvas[kind.replace('appearance-', '')] } : undefined },
  }
  const native = async (pid: number, command: string, _menu: undefined, { action, label, capture }: { action: string; label?: string; capture: string }) => {
    assert.equal(pid, 7)
    assert.equal(command, 'windowbar')
    calls.push({ action, label, capture })
    if (action === 'drag') state.rect = state.rect.map((edge, index) => (index % 2 === 0 ? edge + (options.dragDistance ?? 160) : edge))
    if (action === 'doubleclick' && options.doubleClickWorks !== false) state.zoomed = !state.zoomed
    if (action === 'restore') state.iconic = false
    if (action === 'invoke') {
      if (label === names.minimize) state.iconic = true
      else if (label === names.maximize) state.zoomed = true
      else if (label === names.restore) state.zoomed = false
      else throw new Error(`The window bar has no button named ${label}`)
    }
    const color = (options.color ?? canvas)[mode]!
    return {
      action,
      state: { ...state },
      buttons: options.buttons ?? [names.minimize, state.zoomed ? names.restore : names.maximize, names.close],
      bar: state.iconic ? null : { frame: state.rect, captionHeight: options.captionHeight ?? 0, menuBar: options.menuBar ?? false, sampled: 100, colors: [{ color, count: 100 }] },
    }
  }
  const catalogValue = async (_path: string, read: (catalogue: unknown) => unknown) => catalogues.map(read)
  const context = { Error, join, catalogValue, Date: { now: () => elapsed }, delay: async (milliseconds: number) => { elapsed += milliseconds } }
  runInNewContext(`${polling}\n${inspect}\nglobalThis.inspect = inspectWindowBar`, context)
  const inspectWindowBar = (context as typeof context & { inspect: (...args: unknown[]) => Promise<void> }).inspect
  return { sent, calls, elapsed: () => elapsed, run: (report: object) => inspectWindowBar(proxy, native, { child: { pid: 7 } }, 'output', report) }
}

test('the window bar check proves no native caption, the canvas in both modes and every window action', async () => {
  const check = windowContext()
  const recorded = {}
  await check.run(recorded)
  const report = JSON.parse(JSON.stringify(recorded)) as { windowBar: Record<string, { expected?: number[]; pageCanvas?: string; captionHeight?: number; state?: { zoomed: boolean; iconic: boolean } }> }
  assert.deepEqual(check.sent, ['appearance-light', 'appearance-dark'])
  assert.deepEqual(check.calls.filter(({ capture }) => capture !== join('output', 'window-action.png')).map(({ capture }) => capture),
    [join('output', 'window-light.png'), join('output', 'window-dark.png')])
  assert.deepEqual(check.calls.filter(({ action }) => action !== 'read').map(({ action, label }) => [action, label]), [
    ['drag', undefined], ['invoke', 'Maximize'], ['invoke', 'Restore'], ['doubleclick', undefined], ['doubleclick', undefined],
    ['invoke', 'Minimize'], ['restore', undefined],
  ])
  assert.deepEqual(report.windowBar.light!.expected, canvas.light)
  assert.deepEqual(report.windowBar.dark!.expected, canvas.dark)
  assert.deepEqual([report.windowBar.light!.pageCanvas, report.windowBar.dark!.pageCanvas], [pageCanvas.light, pageCanvas.dark])
  const actions = report.windowBar.actions as unknown as Record<string, { zoomed: boolean; iconic: boolean; rect: number[] }>
  assert.equal(actions.maximize!.zoomed, true)
  assert.equal(actions.restore!.zoomed, false)
  assert.equal(actions.doubleClickMaximize!.zoomed, true)
  assert.equal(actions.doubleClickRestore!.zoomed, false)
  assert.equal(actions.minimize!.iconic, true)
  assert.equal(actions.restoreFromMinimize!.iconic, false)
  assert.deepEqual((report.windowBar.actions as unknown as { buttons: string[] }).buttons, ['Minimize', 'Maximize', 'Close'])
})

test('the window bar check accepts the pt-BR accessible names', async () => {
  const check = windowContext({ locale: 1 })
  await check.run({})
  assert.deepEqual(check.calls.filter(({ action }) => action === 'invoke').map(({ label }) => label), ['Maximizar', 'Restaurar', 'Minimizar'])
})

test('the window bar check fails on a native caption, a menu bar or a colour other than the canvas, and keeps the last reading', async () => {
  for (const [options, failed] of [
    [{ captionHeight: 31 }, 'light'],
    [{ menuBar: true }, 'light'],
    [{ color: { light: [243, 243, 243], dark: canvas.dark! } }, 'light'],
    [{ color: { light: canvas.light!, dark: [32, 32, 32] } }, 'dark'],
  ] as const) {
    const check = windowContext(options)
    const recorded = {} as { windowBar?: Record<string, unknown> }
    await assert.rejects(() => check.run(recorded), new RegExp(`Timed out waiting for ${failed} window bar in the Orbit canvas colour with no native caption`))
    assert.ok(check.elapsed() >= 30000)
    assert.ok(JSON.parse(JSON.stringify(recorded)).windowBar[failed].bar.frame)
  }
})

test('the window bar check fails when an action is missing, mislabelled or does nothing', async () => {
  await assert.rejects(() => windowContext({ buttons: ['Minimize', 'Close'] }).run({}), /Timed out waiting for the minimize, maximize and close actions of the window bar/)
  await assert.rejects(() => windowContext({ buttons: ['Minimize', 'Maximize', 'Exit'] }).run({}), /Timed out waiting for the minimize, maximize and close actions/)
  await assert.rejects(() => windowContext({ dragDistance: 20 }).run({}), /Dragging the window bar did not move the window/)
  await assert.rejects(() => windowContext({ doubleClickWorks: false }).run({}), /Timed out waiting for a double click on the bar maximizing the window/)
})
