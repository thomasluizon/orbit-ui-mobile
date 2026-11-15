import assert from 'node:assert/strict'
import { test } from 'node:test'
import { button, inspectionContext } from './test-acceptance-support'

// Native key delivery on the runner path (#2074): the real inspectSurfaces posts each key until the page records it.
// Each scenario replays one review finding on the runner path with a fake clock: the page records a keydown only at its arrival time.
for (const scenario of ['claimed-escape', 'late-palette', 'palette-without-modifier']) {
  test(`a claimed Escape is never posted again, a late Command+K with its repost fails as OS delivery, and an undelivered post keeps every palette key (${scenario})`, async () => {
    const context = inspectionContext('darwin')
    const commands: string[] = []
    const timed: { at: number; kind: string; key: string; keyCode?: number; metaKey?: boolean; ctrlKey?: boolean }[] = []
    const others: { kind: string }[] = []
    let modal = false
    let downs = 0
    const visible = () => timed.filter((event) => event.at <= context.elapsed())
    const paletteOpen = () => visible().filter((event) => event.kind === 'palette-key' && event.key === 'k' && event.metaKey).length % 2 === 1
    const state = () => ({ inputFocused: true, inputName: 'Search commands', results: ['Today', 'Astra', 'All'], selected: downs })
    const native = async (_pid: number, command: string) => {
      commands.push(command)
      const now = context.elapsed()
      if (command === 'escape' && modal) {
        // The input method claims the Escape (keyCode 229), and the Astra handler still closes on the key name.
        timed.push({ at: now, kind: 'astra-key', key: 'Escape', keyCode: scenario === 'claimed-escape' ? 229 : 27 })
        modal = false
      } else if (command === 'escape') timed.push({ at: now, kind: 'palette-key', key: 'Escape', keyCode: 27 })
      if (command === 'palette') {
        const posts = commands.filter((entry) => entry === 'palette').length
        if (scenario === 'palette-without-modifier') timed.push({ at: now, kind: 'palette-key', key: 'k', keyCode: 75, metaKey: false, ctrlKey: false })
        // The first Command+K reaches the page 50 ms after its window; the repost reaches it 100 ms after it is posted.
        else if (scenario === 'late-palette') timed.push({ at: now + (posts === 1 ? 5050 : 100), kind: 'palette-key', key: 'k', keyCode: 75, metaKey: true })
        else timed.push({ at: now, kind: 'palette-key', key: 'k', keyCode: 75, metaKey: true })
      }
      if (command === 'down' && paletteOpen()) { downs++; timed.push({ at: now, kind: 'palette-key', key: 'ArrowDown', keyCode: 40 }) }
      if (command !== 'dump') return { sent: command }
      return { denied: false, error: null, nodes: [
        { ...button, id: '0', role: 'AXWebArea', interactive: false },
        { ...button, id: '0/0', role: 'AXTextField', name: 'Search commands', focused: paletteOpen() },
        ...state().results.map((name, index) => ({ ...button, id: `0/${index + 1}`, name, role: 'AXButton', selected: paletteOpen() && downs === index })),
      ] }
    }
    const proxy = {
      send(command: string) {
        commands.push(command)
        if (command === 'astra') modal = true
        if (command.startsWith('focus-')) others.push({ kind: 'focus', ...state() })
      },
      read(surface: string) {
        if (surface === 'astra') return modal && {}
        if (surface === 'astra-closed') return !modal && {}
        if (surface === 'palette') return paletteOpen() && state()
        return false
      },
      events: () => [...visible().map(({ at: _at, ...event }) => event), ...others],
    }
    const report: { accessibility: object; keyDelivery?: { key: string; attempts: { keys?: { key: string; metaKey?: boolean }[] }[] }[] } = { accessibility: {} }
    let failure: Error | undefined
    try { await context.inspect(proxy, native, { child: { pid: 1 } }, 'output', report) } catch (error) { failure = error as Error }
    if (scenario === 'claimed-escape') {
      assert.equal(failure, undefined, failure?.message)
      assert.equal(commands.filter((entry) => entry === 'escape').length, 2)
      assert.ok(commands.indexOf('escape') < commands.indexOf('astra-closed') && commands.indexOf('astra-closed') < commands.lastIndexOf('escape'))
    }
    if (scenario === 'late-palette') {
      assert.match(String(failure), /^Error: OS key delivery failed: the page received 2 palette keydowns from 2 posts;/)
      assert.equal(commands.filter((entry) => entry === 'palette').length, 2)
      assert.ok(!commands.includes('palette-ready') && !commands.includes('down'))
    }
    if (scenario === 'palette-without-modifier') {
      assert.match(String(failure), /^Error: OS key delivery failed: the page received no palette keydown after 6 posts 5 s apart;/)
      assert.equal(commands.filter((entry) => entry === 'palette').length, 6)
      // Each post keeps the k keydown that lacked Command, so the report shows that a key reached the page without its modifier.
      const palette = report.keyDelivery?.find((entry) => entry.key === 'palette')
      assert.deepEqual(JSON.parse(JSON.stringify(palette?.attempts.map((attempt) => attempt.keys?.map((key) => [key.key, key.metaKey])))),
        Array(6).fill([['k', false]]))
    }
  })
}
