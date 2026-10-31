;(() => {
  if (window.top !== window || window.__orbitAcceptance) return
  window.__orbitAcceptance = true
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  const report = (kind, details = {}) => fetch('/_bench/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, ...details }) })
  async function until(read, label) {
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      const value = read()
      if (value) return value
      await delay(100)
    }
    throw new Error(`Timed out waiting for ${label}; route ${location.pathname}`)
  }
  async function emailSignIn() {
    if (document.cookie.includes('auth_token=')) throw new Error('The auth cookie must be httpOnly')
    for (const [path, body] of [
      ['send-code', { email: 'desktop-vm@example.invalid', language: 'en' }],
      ['verify-code', { email: 'desktop-vm@example.invalid', language: 'en', code: '741852' }],
    ]) {
      const response = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error(`Email /api/auth/${path} failed: HTTP ${response.status}; response ${await response.text()}`)
      const result = await response.json()
      if ('token' in result || 'refreshToken' in result) throw new Error('BFF exposed a session token')
    }
    if (document.cookie.includes('auth_token=')) throw new Error('BFF cookie is readable by JavaScript')
    await report('email-completed')
    location.assign('/')
  }
  async function screen(name) {
    if (name === 'astra-close') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    if (name === 'astra-close' || name === 'astra-closed') {
      await until(() => !document.querySelector('[data-shell-conversation]'), 'Astra dismissal')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await report('astra-closed')
      return
    }
    if (name === 'astra') {
      const input = await until(() => document.querySelector('[data-composer-input]:not([disabled])'), 'Astra composer')
      input.focus()
      document.querySelector('[data-open-conversation]')?.click()
      await until(() => document.querySelector('[data-shell-conversation] [data-composer-input]'), 'Astra surface')
    }
    if (name === 'palette') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform), bubbles: true }))
    }
    if (name === 'palette' || name === 'palette-ready') {
      const state = await until(() => {
        const current = paletteState()
        return current.inputFocused && current.results.length >= 3 && current.selected >= 0 && current
      }, 'palette input and selection')
      await report('palette', state)
      return
    }
    await report(name, name === 'palette' ? paletteState() : {})
  }
  function paletteState() {
    const input = document.querySelector('[cmdk-input]')
    const results = [...document.querySelectorAll('[cmdk-item]:not([aria-disabled="true"])')]
    const selected = results.findIndex((result) => result.getAttribute('aria-selected') === 'true')
    return { inputFocused: document.activeElement === input, selected, results: results.map((result) => result.getAttribute('aria-label') || result.textContent.trim()), inputName: input?.getAttribute('aria-label') }
  }
  async function update(expected) {
    const invoke = window.__TAURI_INTERNALS__?.invoke
    if (!invoke) throw new Error('Native updater bridge unavailable')
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const snapshot = await invoke('desktop_update', { action: 'status' })
      if (snapshot.phase === expected && snapshot.shellVersion === '2.0.0') {
        await report(`update-${expected}`, { snapshot })
        return
      }
      await delay(250)
    }
    throw new Error(`Native updater did not reach ${expected}`)
  }
  async function run() {
    await until(() => document.readyState === 'complete', 'page load')
    const session = await fetch('/api/auth/session', { cache: 'no-store' })
    if (!session.ok && session.status !== 401) throw new Error(`BFF session check failed: HTTP ${session.status}`)
    if (__BENCH_EXPECT_AUTHENTICATED__ && !session.ok) throw new Error('Authenticated installed relaunch lost its BFF session')
    if (location.pathname.includes('/login') || location.pathname.includes('/onboarding')) {
      if (session.ok) location.assign('/')
      else await emailSignIn()
      return
    }
    if (!session.ok) throw new Error('Hoje requires an authenticated BFF session')
    await until(() => document.querySelector('[data-habit-id="bench-0000"]') && document.querySelector('[data-composer-input]:not([disabled])'), 'Hoje')
    await report('hoje', { route: location.pathname, nativeVersion: window.__ORBIT_DESKTOP_VERSION__ })
    while (true) {
      const response = await fetch('/_bench/command')
      if (!response.ok) throw new Error(`Command request failed: ${response.status}`)
      const command = await response.text()
      if (command.startsWith('update-')) await update(command.slice(7))
      else if (command.startsWith('focus-')) {
        await until(() => paletteState().selected === Number(command.slice(6)), 'next keyboard-selected result')
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        await report('focus', paletteState())
      }
      else await screen(command)
    }
  }
  run().catch((error) => { void report('error', { message: error.message, stack: error.stack }) })
})()
