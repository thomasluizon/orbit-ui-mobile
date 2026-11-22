import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { claimedKey, deliverKey, keyPosts, keyReceiptWindow } from '../desktop-bench/acceptance-contract.mjs'
import { T, REPO_ROOT } from './_harness.mjs'

// Native key delivery cases of the desktop acceptance runner (#1560, #2074): the palette Down steps on the real cmdk
// palette, and the shared deliverKey helper on a fake page clock.

// Replays the intermittent macOS failure: the native helper returns for a Down that the page never receives,
// so the probe records no palette-key receipt and the selection never moves.
export async function paletteDeliveryCases(dom, readState, reports) {
  const runner = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/acceptance-runner.mjs'), 'utf8')
  const traversal = runner.slice(runner.indexOf('  const focus = []'), runner.indexOf('\n  report.paletteFocus = focus') + '\n  report.paletteFocus = focus'.length)
  const pressKey = runner.slice(runner.indexOf('function pressKey('), runner.indexOf('async function dismissOrbit'))
  const host = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/host.mjs'), 'utf8')
  const waitForSource = host.slice(host.indexOf('export async function waitFor'), host.indexOf('export async function waitForHttp')).replace('export ', '')
  const input = dom.window.document.querySelector('[cmdk-input]')
  const { flushSync } = await import('react-dom')
  const press = (target, key, init = {}) => flushSync(() => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, code: key, bubbles: true, ...init })))
  const scenarios = {
    'first-press-lost': { lost: [1] },
    'second-press-lost': { lost: [2] },
    'never-delivered': { lost: [1, 2, 3, 4, 5, 6] },
    'received-without-selection': { target: () => dom.window.document.body },
    'late-duplicate': { duplicate: [1] },
    // WebKit delivers a Down that the macOS input method claimed as ArrowDown with keyCode 229, and cmdk ignores it.
    'claimed-by-input-method': { init: { keyCode: 229 }, claimedPosts: [1], claimed: (key) => key.keyCode === 229 },
    'composing-in-input-method': { init: { isComposing: true }, claimedPosts: [1], claimed: (key) => key.composing === true },
    'always-claimed': { init: { keyCode: 229 }, claimedPosts: [1, 2, 3, 4, 5, 6], claimed: (key) => key.keyCode === 229 },
  }
  for (const [name, scenario] of Object.entries(scenarios)) {
    press(input, 'Home')
    const start = reports.length
    const focusEvents = []
    const posts = []
    const captures = []
    const report = {}
    let pendingFocus = null
    let clock = 0
    const context = { previous: readState(), handle: { child: { pid: 321 } }, report, Date: { now: () => clock }, deliverKey, claimedKey, process: { stdout: { write() {} } },
      // The real proxy forwards every probe report in arrival order; the probe answers focus-N only at that exact index.
      proxy: {
        events: () => {
          if (pendingFocus !== null && readState().selected === pendingFocus) { focusEvents.push({ kind: 'focus', ...readState() }); pendingFocus = null }
          return [...reports.slice(start), ...focusEvents]
        },
        send: (command) => { pendingFocus = Number(command.slice('focus-'.length)) },
      },
      native: async (pid, command) => {
        posts.push(command)
        if (command !== 'down' || scenario.lost?.includes(posts.length)) return
        press(scenario.target?.() ?? input, 'ArrowDown', scenario.claimedPosts?.includes(posts.length) ? scenario.init : {})
        if (scenario.duplicate?.includes(posts.length)) press(input, 'ArrowDown')
      },
      delay: async (milliseconds) => { clock += milliseconds; await new Promise((resolve) => setImmediate(resolve)) },
      dump: async (surface) => { captures.push(surface) },
      assertPaletteFocus: (previous, current) => {
        if (current.selected !== previous.selected + 1) throw new Error(`Palette result order: expected ${previous.selected + 1}, received ${current.selected}`)
      },
    }
    runInNewContext(`${waitForSource}\n${pressKey}\nglobalThis.traverse = async () => {${traversal}\n}`, context)
    let failure
    try { await context.traverse() } catch (error) { failure = error }
    const order = report.paletteFocus?.map((event) => event.selected).join(',')
    const undelivered = report.keyDelivery?.flatMap((entry, step) => entry.attempts.filter((attempt) => !attempt.received).map((attempt) => ({ step: step + 1, ...attempt }))) ?? []
    if (name === 'first-press-lost' || name === 'second-press-lost') {
      T(`palette traversal posts a Down again only after the page received no Down (${name}) and still requires each result in order`,
        !failure && order === '1,2' && captures.join(',') === 'palette-result-1,palette-result-2' && posts.length === 3 &&
          undelivered.length === 1 && undelivered[0].step === scenario.lost[0] && report.keyDelivery.length === 2, failure?.message ?? JSON.stringify({ order, posts, report }))
    }
    if (name === 'never-delivered') {
      T('palette traversal stops after a bounded number of undelivered Down posts and names OS delivery as the cause',
        /^OS key delivery failed: the page received no down keydown after 6 posts/.test(failure?.message) && posts.length === keyPosts &&
          undelivered.length === keyPosts && clock >= keyPosts * keyReceiptWindow, failure?.message)
    }
    if (name === 'received-without-selection') {
      T('a Down the page received but cmdk did not apply is never posted again and fails the focus check',
        failure?.message === 'Timed out waiting for palette result focus' && posts.length === 1, failure?.message)
    }
    const claimedKeys = undelivered.flatMap((attempt) => attempt.keys.filter((key) => key.key === 'ArrowDown'))
    const keptClaimed = claimedKeys.length === scenario.claimedPosts?.length && claimedKeys.every((key) => scenario.claimed(key) && key.targetInput && key.before.selected === 0)
    if (scenario.claimed && name !== 'always-claimed') {
      T(`a Down the input method claimed (${name}) is not a receipt: cmdk ignores it, so the runner posts it again and still requires each result in order`,
        !failure && order === '1,2' && posts.length === 3 && report.keyDelivery.length === 2 &&
          JSON.stringify(report.keyDelivery[0].attempts.map((attempt) => attempt.received)) === '[false,true]' && keptClaimed,
        failure?.message ?? JSON.stringify({ order, posts, report }))
    }
    if (name === 'always-claimed') {
      T('a Down the input method claims on every post fails as OS delivery after the bounded posts, and the report keeps each claimed key',
        /^OS key delivery failed: the page received no down keydown after 6 posts/.test(failure?.message) && posts.length === keyPosts &&
          undelivered.length === keyPosts && keptClaimed, failure?.message ?? JSON.stringify({ posts, report }))
    }
    if (name === 'late-duplicate') {
      T('a step that receives two Downs fails explicitly instead of skipping a result',
        /^OS key delivery failed: the page received 2 down keydowns from 1 post;/.test(failure?.message) && posts.length === 1, failure?.message)
    }
  }
}

// A fake page clock drives the shared helper directly: each keydown becomes visible at its arrival time.
export async function keyDeliveryCases() {
  const waitForSource = readFileSync(join(REPO_ROOT, 'tools/desktop-bench/host.mjs'), 'utf8')
  const waitForBody = waitForSource.slice(waitForSource.indexOf('export async function waitFor'), waitForSource.indexOf('export async function waitForHttp')).replace('export ', '')
  const scenarios = {
    'first-post': (post, at) => post === 1 ? [{ at, key: 'Escape', keyCode: 27 }] : [],
    'third-post': (post, at) => [{ at, key: 'Process', keyCode: 229 }, ...post === 3 ? [{ at, key: 'Escape', keyCode: 27 }] : []],
    'claimed': (post, at) => post === 1 ? [{ at, key: 'Escape', keyCode: 229 }] : [],
    'late-and-repost': (post, at) => post === 1 ? [{ at: at + 5050, key: 'Escape', keyCode: 27 }] : [{ at: at + 100, key: 'Escape', keyCode: 27 }],
    'late-then-lost': (post, at) => post === 1 ? [{ at: at + 5050, key: 'Escape', keyCode: 27 }] : [],
    'never': (_post, at) => [{ at, key: 'Process', keyCode: 229 }],
    // The reviewer's timing: each post takes 300 ms and every key reaches the page 6 s after its post ends.
    'equal-delay': (_post, at) => [{ at: at + 6000, key: 'Escape', keyCode: 27 }],
    'equal-delay-repost-lost': (post, at) => post === 1 ? [{ at: at + 6000, key: 'Escape', keyCode: 27 }] : [],
    // Two outstanding posts: the first key arrives 12 s late during post 3, post 2 is lost, and post 3's key has the same delay.
    'two-outstanding': (post, at) => post === 2 ? [] : [{ at: at + 12000, key: 'Escape', keyCode: 27 }],
  }
  const postDuration = { 'equal-delay': 300, 'equal-delay-repost-lost': 300, 'two-outstanding': 300 }
  for (const [name, arrivals] of Object.entries(scenarios)) {
    let clock = 0
    const context = { Date: { now: () => clock }, delay: async (milliseconds) => { clock += milliseconds } }
    runInNewContext(`${waitForBody}\nglobalThis.waitFor = waitFor`, context)
    const page = [{ at: 0, key: 'Escape', keyCode: 27 }]
    const posts = []
    const logs = []
    const record = []
    let failure
    try {
      await deliverKey({ name: 'escape', waitFor: context.waitFor, now: () => clock, record, log: (line) => logs.push(line),
        events: () => page.filter((event) => event.at <= clock), matches: (event) => event.key === 'Escape',
        post: async () => {
          posts.push(clock)
          if (posts.length === keyPosts + 1) throw new Error('posted past the bound')
          clock += postDuration[name] ?? 0
          page.push(...arrivals(posts.length, clock))
          return { sent: 'escape', post: posts.length }
        } })
    } catch (error) { failure = error }
    const attempts = record[0]?.attempts ?? []
    const received = attempts.map((attempt) => attempt.received)
    if (name === 'first-post' || name === 'third-post') {
      const arrives = name === 'first-post' ? 1 : 3
      T(`a key the page receives on post ${arrives} counts as received and records every earlier post with the other keys the page got (${name})`,
        !failure && posts.length === arrives && record[0].key === 'escape' &&
          JSON.stringify(received) === JSON.stringify([...Array(arrives - 1).fill(false), true]) &&
          attempts.every((attempt, index) => attempt.reply.post === index + 1) &&
          attempts.slice(0, -1).every((attempt) => attempt.keys.length === 1 && attempt.keys[0].key === 'Process') &&
          posts.every((at, index) => at === index * keyReceiptWindow) && logs.length === arrives &&
          logs.at(-1) === `Key escape: post ${arrives} of ${keyPosts}: the page recorded the keydown in this window` &&
          logs.slice(0, -1).every((line, index) => line === `Key escape: post ${index + 1} of ${keyPosts}: no escape keydown in 5 s`),
        failure?.message ?? JSON.stringify({ posts, attempts, logs }))
    }
    if (name === 'claimed') {
      T('a key the input method claimed (keyCode 229) still counts as received, because the app acts on the key name, and is never posted again',
        !failure && posts.length === 1 && JSON.stringify(received) === '[true]', failure?.message)
    }
    if (name === 'late-and-repost') {
      T('a key that arrives after its window together with its repost fails as OS delivery with both keydowns counted',
        failure?.message === 'OS key delivery failed: the page received 2 escape keydowns from 2 posts; a key arrived after its window together with its repost' &&
          posts.length === 2, failure?.message ?? JSON.stringify({ posts, attempts }))
    }
    if (name === 'late-then-lost') {
      T('a late key ends the posts as received, and a repost the page never gets leaves one keydown after the extra window',
        !failure && posts.length === 2 && JSON.stringify(received) === '[false,true]' && clock >= 2 * keyReceiptWindow, failure?.message ?? JSON.stringify({ posts, attempts }))
    }
    if (name === 'never') {
      T(`a key the page never receives fails as OS key delivery after ${keyPosts} posts within ${keyPosts * keyReceiptWindow / 1000} s, with every other key kept`,
        failure?.message === `OS key delivery failed: the page received no escape keydown after ${keyPosts} posts 5 s apart; ` +
          'report.json keyDelivery lists every other key the page recorded after each post' &&
          posts.length === keyPosts && clock === keyPosts * keyReceiptWindow && attempts.length === keyPosts &&
          attempts.every((attempt) => !attempt.received && attempt.keys.length === 1 && attempt.keys[0].key === 'Process'),
        failure?.message ?? JSON.stringify({ posts, record }))
    }
    if (name === 'equal-delay') {
      T('a repost key with the same delay as the late first key arrives after a fixed 5 s guard and still fails as OS delivery',
        failure?.message === 'OS key delivery failed: the page received 2 escape keydowns from 2 posts; a key arrived after its window together with its repost' &&
          posts.length === 2 && clock >= 11600 && clock < 11700, failure?.message ?? JSON.stringify({ clock, posts, attempts }))
    }
    if (name === 'equal-delay-repost-lost') {
      T('the repeat guard ends one receipt window after the last post key would arrive with the first key delay, when no second key comes',
        !failure && posts.length === 2 && clock >= 16900 && clock < 17000, failure?.message ?? JSON.stringify({ clock, posts }))
    }
    if (name === 'two-outstanding') {
      T('the repeat guard covers every outstanding post: a lost second post and a late third key still fail as OS delivery',
        failure?.message === 'OS key delivery failed: the page received 2 escape keydowns from 3 posts; a key arrived after its window together with its repost' &&
          posts.length === 3 && JSON.stringify(received) === '[false,false,true]' && clock >= 22900 && clock < 23000,
        failure?.message ?? JSON.stringify({ clock, posts, attempts }))
    }
  }
  T('a claimed key is keyCode 229 or a composition', claimedKey({ keyCode: 229 }) && claimedKey({ keyCode: 40, composing: true }) && !claimedKey({ keyCode: 40, composing: false }))
}
