import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

// Window bar inspection of the Windows installed acceptance (#2132): inspectWindowBar in acceptance-runner.mjs, driven
// through its real source with a fake proxy and a scripted native window model.
const catalogues = ['en', 'pt-BR'].map((locale) =>
  JSON.parse(readFileSync(new URL(`../../packages/shared/src/i18n/${locale}.json`, import.meta.url), 'utf8')) as { desktopWindow: Record<string, string> })

type Area = { name: string; width: number; height: number; pixels: number[] }
type Popup = { rect: number[]; anchor: number[]; items: unknown[]; windowMenu: unknown[]; closed: boolean }
type SystemItem = { id: number; text: string; enabled: boolean; checked: boolean; children: SystemItem[] }
type SystemMenu = { rect: number[]; pointer: number[]; items: SystemItem[]; closed: boolean }

type Options = {
  captionHeight?: number
  menuBar?: boolean
  color?: Record<string, number[]>
  dragDistance?: number
  dragOffset?: number[]
  pointerTravel?: number | null
  moveLoopWait?: unknown
  locale?: 0 | 1
  buttons?: string[]
  doubleClickWorks?: boolean
  snapRegionWorks?: boolean
  prefersDark?: Record<string, boolean>
  areas?: (mode: string) => Area[]
  popup?: Partial<Popup>
  systemMenu?: (zoomed: boolean, menu: SystemMenu) => SystemMenu
}

const canvas: Record<string, number[]> = { light: [250, 250, 250], dark: [9, 9, 11] }
const pageCanvas: Record<string, string> = { light: '#FAFAFA', dark: '#09090B' }
const actionNames = ['menu', 'minimize', 'maximize', 'close']
const fileMenu = [{ id: 4294967295, text: 'File', enabled: true, checked: false, children: [{ id: 7, text: 'Launch at login', enabled: true, checked: true, children: [] }] }]

// The window menu as a captioned window shows it: WinUser.h SC_* ids, with the separator that GetMenuItemID reads as 0.
function windowMenu(zoomed: boolean): SystemItem[] {
  const item = (id: number, text: string, enabled: boolean): SystemItem => ({ id, text, enabled, checked: false, children: [] })
  return [item(0xF120, '&Restore', zoomed), item(0xF010, '&Move', !zoomed), item(0xF000, '&Size', !zoomed), item(0xF020, 'Mi&nimize', true),
    item(0xF030, 'Ma&ximize', !zoomed), item(0, '', false), item(0xF060, '&Close\tAlt+F4', true)]
}

const rgb = (color: number[]) => (color[0]! << 16) | (color[1]! << 8) | color[2]!

// The 22 x 24 middle of each 44px action at 96 DPI, with the glyph the page draws in the ink of the mode.
function drawnAreas(mode: string): Area[] {
  const paper = rgb(canvas[mode]!)
  const ink = rgb(canvas[mode === 'light' ? 'dark' : 'light']!)
  const shapes: Record<string, (x: number, y: number) => boolean> = {
    menu: (x, y) => x >= 10 && x <= 11 && [3, 4, 11, 12, 19, 20].includes(y),
    minimize: (x, y) => y === 12 && x >= 4 && x <= 17,
    maximize: (x, y) => x >= 4 && x <= 17 && y >= 5 && y <= 18 && (x === 4 || x === 17 || y === 5 || y === 18),
    close: (x, y) => x >= 4 && x <= 17 && y >= 5 && y <= 18 && (x - 4 === y - 5 || x - 4 === 18 - y),
  }
  return actionNames.map((name) => ({ name, width: 22, height: 24,
    pixels: Array.from({ length: 22 * 24 }, (_, index) => (shapes[name]!(index % 22, Math.floor(index / 22)) ? ink : paper)) }))
}

function runnerContext() {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const inspect = runner.slice(runner.indexOf('const barCanvas'), runner.indexOf('async function installedLaunch'))
  const host = readFileSync(new URL('./host.mjs', import.meta.url), 'utf8')
  const polling = host.slice(host.indexOf('export async function waitFor('), host.indexOf('export async function waitForHttp'))
    .replace('export async function', 'async function')
  return { inspect, polling }
}

function windowContext(options: Options = {}) {
  const { inspect, polling } = runnerContext()
  let elapsed = 0
  let mode = 'light'
  const sent: string[] = []
  const calls: { action: string; label?: string; capture: string }[] = []
  const names = catalogues[options.locale ?? 0]!.desktopWindow
  const state = { rect: [0, 0, 800, 600], zoomed: false, iconic: false, visible: true }
  const proxy = {
    send(command: string) { sent.push(command); if (command.startsWith('appearance-')) mode = command.replace('appearance-', '') },
    read(kind: string) {
      const mode = kind.replace('appearance-', '')
      return sent.includes(kind) ? { kind, canvas: pageCanvas[mode], prefersDark: (options.prefersDark ?? { light: false, dark: true })[mode] } : undefined
    },
  }
  const native = async (pid: number, command: string, _menu: undefined, { action, label, capture }: { action: string; label?: string; capture: string }) => {
    assert.equal(pid, 7)
    assert.equal(command, 'windowbar')
    calls.push({ action, label, capture })
    let drag = null
    if (action === 'drag') {
      const offset = options.dragOffset ?? [options.dragDistance ?? 160, 0, options.dragDistance ?? 160, 0]
      state.rect = state.rect.map((edge, index) => edge + offset[index]!)
      // The reader reports the pointer travel after the move loop started, and how long the press waited for that loop.
      // A raw moveLoopWait goes through JSON as the reader output does, so undefined removes the key.
      if (options.pointerTravel !== null) {
        drag = JSON.parse(JSON.stringify({ distance: options.pointerTravel ?? 160, moveLoopWait: 'moveLoopWait' in options ? options.moveLoopWait : 40 }))
      }
    }
    if (action === 'doubleclick' && options.doubleClickWorks !== false) state.zoomed = !state.zoomed
    if (action === 'click' && options.snapRegionWorks !== false) state.zoomed = !state.zoomed
    if (action === 'restore') state.iconic = false
    if (action === 'invoke') {
      if (label === names.minimize) state.iconic = true
      else throw new Error(`The window bar has no button named ${label}`)
    }
    let popup = null
    if (action === 'popup') {
      assert.ok(sent.includes('window-menu'), 'the probe presses the menu action before the reader looks for the popup')
      popup = { rect: [state.rect[0]! + 4, state.rect[1]! + 48, state.rect[0]! + 204, state.rect[1]! + 248], anchor: [state.rect[0]! + 4, state.rect[1]! + 48],
        items: fileMenu, windowMenu: fileMenu, closed: true, ...options.popup }
    }
    if (action === 'systemmenu') {
      const pointer = [state.rect[0]! + 160, state.rect[1]! + 24]
      const menu = { rect: [pointer[0]!, pointer[1]!, pointer[0]! + 200, pointer[1]! + 150], pointer, items: windowMenu(state.zoomed), closed: true }
      popup = options.systemMenu ? options.systemMenu(state.zoomed, menu) : menu
    }
    const color = (options.color ?? canvas)[mode]!
    return {
      action,
      state: { ...state },
      buttons: options.buttons ?? [names.menu, names.minimize, state.zoomed ? names.restore : names.maximize, names.close],
      bar: state.iconic ? null : { frame: state.rect, captionHeight: options.captionHeight ?? 0, menuBar: options.menuBar ?? false, sampled: 100,
        colors: [{ color, count: 100 }], actions: (options.areas ?? drawnAreas)(mode) },
      popup,
      drag,
    }
  }
  const catalogValue = async (_path: string, read: (catalogue: unknown) => unknown) => catalogues.map(read)
  const context = { Error, JSON, Math, join, catalogValue, Date: { now: () => elapsed }, delay: async (milliseconds: number) => { elapsed += milliseconds } }
  runInNewContext(`${polling}\n${inspect}\nglobalThis.inspect = inspectWindowBar`, context)
  const inspectWindowBar = (context as typeof context & { inspect: (...args: unknown[]) => Promise<void> }).inspect
  return { sent, calls, elapsed: () => elapsed, run: (report: object) => inspectWindowBar(proxy, native, { child: { pid: 7 } }, 'output', report) }
}

// The real glyph rule of the runner, for crops taken from a capture.
function glyphRule() {
  const { inspect } = runnerContext()
  const context = { Math }
  runInNewContext(`${inspect}\nglobalThis.glyphVisible = glyphVisible`, context)
  return (context as typeof context & { glyphVisible: (area: Area, canvas: number[]) => boolean }).glyphVisible
}

test('the window bar check proves no native caption, the canvas, a glyph on every action and the colour scheme in both modes, the menu popup and every window action', async () => {
  const check = windowContext()
  const recorded = {}
  await check.run(recorded)
  const report = JSON.parse(JSON.stringify(recorded)) as { windowBar: Record<string, { expected?: number[]; pageCanvas?: string; prefersDark?: boolean; captionHeight?: number; state?: { zoomed: boolean; iconic: boolean } }> }
  assert.deepEqual(check.sent, ['appearance-light', 'appearance-dark', 'window-menu'])
  assert.deepEqual(check.calls.filter(({ capture }) => capture !== join('output', 'window-action.png')).map(({ capture }) => capture),
    [join('output', 'window-light.png'), join('output', 'window-dark.png')])
  assert.deepEqual(check.calls.filter(({ action }) => action !== 'read').map(({ action, label }) => [action, label]), [
    ['popup', undefined], ['drag', undefined], ['systemmenu', undefined], ['click', undefined], ['systemmenu', undefined], ['click', undefined],
    ['doubleclick', undefined], ['doubleclick', undefined],
    ['invoke', 'Minimize'], ['restore', undefined],
  ])
  assert.deepEqual(report.windowBar.light!.expected, canvas.light)
  assert.deepEqual(report.windowBar.dark!.expected, canvas.dark)
  assert.deepEqual([report.windowBar.light!.pageCanvas, report.windowBar.dark!.pageCanvas], [pageCanvas.light, pageCanvas.dark])
  assert.deepEqual([report.windowBar.light!.prefersDark, report.windowBar.dark!.prefersDark], [false, true])
  const actions = report.windowBar.actions as unknown as Record<string, { zoomed: boolean; iconic: boolean; rect: number[] }> &
    { menu: Popup; systemMenu: SystemMenu; systemMenuMaximized: SystemMenu; drag: { before: number[]; after: number[]; distance: number; moveLoopWait: number } }
  assert.deepEqual(actions.drag, { before: [0, 0, 800, 600], after: [160, 0, 960, 600], distance: 160, moveLoopWait: 40 })
  assert.deepEqual(actions.systemMenu.items, windowMenu(false))
  assert.deepEqual(actions.systemMenuMaximized.items, windowMenu(true))
  assert.deepEqual(actions.systemMenu.pointer, [320, 24])
  assert.equal(actions.maximize!.zoomed, true)
  assert.equal(actions.restore!.zoomed, false)
  assert.equal(actions.doubleClickMaximize!.zoomed, true)
  assert.equal(actions.doubleClickRestore!.zoomed, false)
  assert.equal(actions.minimize!.iconic, true)
  assert.equal(actions.restoreFromMinimize!.iconic, false)
  assert.deepEqual(actions.menu.items, fileMenu)
  assert.deepEqual((report.windowBar.actions as unknown as { buttons: string[] }).buttons, ['Menu', 'Minimize', 'Maximize', 'Close'])
})

test('the window bar check accepts the pt-BR accessible names', async () => {
  const check = windowContext({ locale: 1 })
  await check.run({})
  assert.deepEqual(check.calls.filter(({ action }) => action === 'invoke').map(({ label }) => label), ['Minimizar'])
})

test('the window bar check fails on a native caption, a menu bar, a colour other than the canvas or a colour scheme other than the mode, and keeps the last reading', async () => {
  for (const [options, failed] of [
    [{ captionHeight: 31 }, 'light'],
    [{ menuBar: true }, 'light'],
    [{ color: { light: [243, 243, 243], dark: canvas.dark! } }, 'light'],
    [{ color: { light: canvas.light!, dark: [32, 32, 32] } }, 'dark'],
    [{ prefersDark: { light: true, dark: true } }, 'light'],
    [{ prefersDark: { light: false, dark: false } }, 'dark'],
  ] as const) {
    const check = windowContext(options as Options)
    const recorded = {} as { windowBar?: Record<string, unknown> }
    await assert.rejects(() => check.run(recorded), new RegExp(`Timed out waiting for ${failed} window bar in the Orbit canvas colour with no native caption, a glyph on every action and the ${failed} WebView2 colour scheme`))
    assert.ok(check.elapsed() >= 30000)
    assert.ok(JSON.parse(JSON.stringify(recorded)).windowBar[failed].bar.frame)
  }
})

const captured = JSON.parse(readFileSync(new URL('./__fixtures__/window-bar-actions.json', import.meta.url), 'utf8')) as {
  captures: { mode: string; actions: { name: string; width: number; height: number; runs: [number, number][] }[] }[] }
const expand = (area: { name: string; width: number; height: number; runs: [number, number][] }): Area =>
  ({ name: area.name, width: area.width, height: area.height, pixels: area.runs.flatMap(([value, count]) => Array<number>(count).fill(value)) })

test('the glyph rule fails the blank maximize area and the absent menu action of the real light and dark captures, and passes their minimize and close glyphs', () => {
  const glyphVisible = glyphRule()
  assert.deepEqual(captured.captures.map(({ mode }) => mode), ['light', 'dark'])
  for (const { mode, actions } of captured.captures) {
    assert.deepEqual(actions.map(({ name }) => name), actionNames)
    assert.deepEqual(actions.map((area) => [area.name, glyphVisible(expand(area), canvas[mode]!)]),
      [['menu', false], ['minimize', true], ['maximize', false], ['close', true]], mode)
  }
})

test('the window bar check fails in each mode when the maximize area of a real capture is blank or the menu action is absent', async () => {
  for (const [replace, failed] of [['maximize', 'light'], ['menu', 'light'], ['maximize', 'dark']] as const) {
    const real = (mode: string) => captured.captures.find((capture) => capture.mode === mode)!.actions.map(expand)
    const areas = (mode: string) => drawnAreas(mode).map((area) => (area.name === replace && mode === failed ? real(mode).find(({ name }) => name === replace)! : area))
    const check = windowContext({ areas })
    await assert.rejects(() => check.run({}), new RegExp(`Timed out waiting for ${failed} window bar`))
  }
})

test('the window bar check fails when an action is missing, mislabelled or does nothing', async () => {
  await assert.rejects(() => windowContext({ buttons: ['Minimize', 'Maximize', 'Close'] }).run({}), /Timed out waiting for the menu, minimize, maximize and close actions of the window bar/)
  await assert.rejects(() => windowContext({ buttons: ['Menu', 'Minimize', 'Maximize', 'Exit'] }).run({}), /Timed out waiting for the menu, minimize, maximize and close actions/)
  await assert.rejects(() => windowContext({ dragDistance: 20 }).run({}), /Dragging the window bar did not move the window with the pointer/)
  await assert.rejects(() => windowContext({ doubleClickWorks: false }).run({}), /Timed out waiting for a double click on the bar maximizing the window/)
  await assert.rejects(() => windowContext({ snapRegionWorks: false }).run({}), /Timed out waiting for a pointer press on the maximize action maximizing the window/)
})

test('the window bar check fails when the menu popup stays open, shows another menu or opens away from the menu action', async () => {
  await assert.rejects(() => windowContext({ popup: { closed: false } }).run({}), /Escape did not close the native popup menu/)
  await assert.rejects(() => windowContext({ popup: { items: [] } }).run({}), /The menu action did not open the window menu/)
  await assert.rejects(() => windowContext({ popup: { items: [{ ...fileMenu[0], children: [{ ...fileMenu[0]!.children[0], checked: false }] }] } }).run({}),
    /The menu action did not open the window menu/)
  await assert.rejects(() => windowContext({ popup: { rect: [400, 300, 600, 500] } }).run({}), /The native popup menu did not open under the menu action/)
})

// Installed runs moved the window 160, 128 and 96 pixels for one 160 pixel pointer travel: the pointer left the press point
// before the window was in its move loop. The reader waits for that loop, so the window must travel exactly as far as the
// pointer.
test('the window bar check fails when the window travels less or more than the pointer, moves down, changes size or the reader reports no travel', async () => {
  const lost = /Dragging the window bar did not move the window with the pointer/
  for (const dragDistance of [96, 128, 159, 161]) await assert.rejects(() => windowContext({ dragDistance }).run({}), lost, String(dragDistance))
  await assert.rejects(() => windowContext({ dragOffset: [160, 8, 160, 8] }).run({}), lost)
  await assert.rejects(() => windowContext({ dragOffset: [160, 0, 176, 0] }).run({}), lost)
  await assert.rejects(() => windowContext({ pointerTravel: null }).run({}), lost)
  await assert.rejects(() => windowContext({ dragDistance: 40, pointerTravel: 40 }).run({}), lost)
})

// The window follows the pointer only once the move loop runs, so a late loop is a bar that stays still under a moving
// pointer. The reader waits up to 5000 ms for the loop, and the runner fails a wait above its limit of 1000 ms.
test('the window bar check fails when the window starts to follow the pointer later than the limit or the reader reports no whole number of milliseconds, and passes at the limit', async () => {
  const late = (wait: number) => new RegExp(`The window started to follow the pointer ${wait} ms after the press on the window bar, above the limit of 1000 ms`)
  for (const moveLoopWait of [2000, 3000, 4999, 1001]) {
    const recorded = {} as { windowBar?: { actions?: { drag?: { after: number[]; moveLoopWait: number } } } }
    await assert.rejects(() => windowContext({ moveLoopWait }).run(recorded), late(moveLoopWait), String(moveLoopWait))
    assert.deepEqual(recorded.windowBar?.actions?.drag?.after, [160, 0, 960, 600])
    assert.equal(recorded.windowBar?.actions?.drag?.moveLoopWait, moveLoopWait)
  }
  // The reader writes an int, so a missing key, null, a string, a boolean, an array, a fraction or a negative wait is no
  // measure of the drag start. The JavaScript <= operator reads null, '', false and [] as 0, true as 1 and '500' as 500.
  // The run names the raw value, so '' and [] stay visible, and it never calls a value that is not a measure late.
  for (const moveLoopWait of [undefined, null, '', '500', 'abc', true, false, [], -5, -1, 1.5]) {
    const raw = JSON.stringify(moveLoopWait) ?? 'missing'
    const shown = raw.replace(/[.[\]]/g, '\\$&')
    await assert.rejects(() => windowContext({ moveLoopWait }).run({}),
      new RegExp(`^Error: The reader reported no drag start wait in whole milliseconds from 0 up \\(moveLoopWait ${shown}\\): \\{`), raw)
  }
  for (const moveLoopWait of [0, 150, 1000]) await windowContext({ moveLoopWait }).run({})
})

test('the window bar check fails when a right-click on the bar opens no window menu, the wrong command states, a menu away from the pointer or a menu that stays open', async () => {
  const states = /did not open the window menu with the command states of that window/
  await assert.rejects(() => windowContext({ systemMenu: (_zoomed, menu) => ({ ...menu, closed: false }) }).run({}), /Escape did not close the window menu of the restored window/)
  await assert.rejects(() => windowContext({ systemMenu: (zoomed, menu) => ({ ...menu, closed: !zoomed }) }).run({}), /Escape did not close the window menu of the maximized window/)
  // GetSystemMenu gives the menu with every command enabled until the shell sets the states of the window.
  await assert.rejects(() => windowContext({ systemMenu: (_zoomed, menu) => ({ ...menu, items: menu.items.map((item) => ({ ...item, enabled: true })) }) }).run({}),
    /A right-click on the bar of the restored window did not open the window menu with the command states of that window/)
  await assert.rejects(() => windowContext({ systemMenu: (_zoomed, menu) => ({ ...menu, items: windowMenu(false) }) }).run({}),
    /A right-click on the bar of the maximized window did not open the window menu with the command states of that window/)
  await assert.rejects(() => windowContext({ systemMenu: (_zoomed, menu) => ({ ...menu, items: menu.items.filter(({ id }) => id !== 0xF010) }) }).run({}), states)
  await assert.rejects(() => windowContext({ systemMenu: (_zoomed, menu) => ({ ...menu, items: fileMenu as SystemItem[] }) }).run({}), states)
  await assert.rejects(() => windowContext({ systemMenu: (_zoomed, menu) => ({ ...menu, rect: [4, 48, 204, 198] }) }).run({}), /The window menu of the restored window did not open at the pointer/)
  await assert.rejects(() => windowContext({ systemMenu: (zoomed, menu) => (zoomed ? { ...menu, rect: [menu.rect[0]!, menu.rect[1]! + 40, menu.rect[2]!, menu.rect[3]! + 40] } : menu) }).run({}),
    /The window menu of the maximized window did not open at the pointer/)
})
