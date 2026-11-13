;(() => {
  if (window.top !== window || window.__orbitAcceptance) return
  window.__orbitAcceptance = true
  const emailLink = new URLSearchParams(location.search).has('code')
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  const report = (kind, details = {}) => fetch('/_bench/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, ...details }) })
  const pushKey = 'orbit-acceptance-push'
  const signInPaths = ['/login', '/auth-callback', '/onboarding']
  async function until(read, label, timeout = 120000, detail = () => '') {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const value = read()
      if (value) return value
      await delay(100)
    }
    const context = detail()
    throw new Error(`Timed out waiting for ${label}; route ${location.pathname}${context ? `; ${context}` : ''}`)
  }
  async function enablePush(labels) {
    const toggle = () => [...document.querySelectorAll('[role="switch"]')].find((element) => labels.includes(element.getAttribute('aria-label')))
    const status = () => document.querySelector('[data-testid="push-status"]')?.textContent.trim() ?? ''
    const ready = await until(() => {
      const element = toggle()
      return element && !element.disabled && element.getAttribute('aria-busy') !== 'true' && element
    }, 'the enabled Perfil notification switch', 120000, () => `status ${status()}`)
    if (ready.getAttribute('aria-checked') !== 'true') ready.click()
    // A WNS channel request may wait up to 300 seconds in the native shell (push.cpp CreateChannelAsync).
    await until(() => toggle()?.getAttribute('aria-checked') === 'true', 'this device to register for notifications', 330000, () => `status ${status()}`)
    sessionStorage.removeItem(pushKey)
    await report('push-enabled', { route: location.pathname })
    location.assign('/')
  }
  async function emailSignIn() {
    if (document.cookie.includes('auth_token=')) throw new Error('The auth cookie must be httpOnly')
    const response = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'desktop-vm@example.invalid', language: 'en' }) })
    if (!response.ok) throw new Error(`Email /api/auth/send-code failed: HTTP ${response.status}; response ${await response.text()}`)
    const result = await response.json()
    if ('token' in result || 'refreshToken' in result) throw new Error('BFF exposed a session token')
    location.assign('/login?email=desktop-vm%40example.invalid&code=741852')
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
      const button = await until(() => document.querySelector('[data-astra-button]:not([disabled])'), 'Astra button')
      button.click()
      await until(() => document.querySelector('[data-shell-conversation] [data-composer-input]'), 'Astra surface')
      document.addEventListener('keydown', recordAstraKey, true)
    }
    if (name === 'palette') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform), bubbles: true }))
    }
    if (name === 'palette' || name === 'palette-ready') {
      document.addEventListener('keydown', recordPaletteKey, true)
      const state = await until(() => {
        const current = paletteState()
        return !current.busy && current.inputFocused && current.results.length >= 3 && current.selected >= 0 && current
      }, 'palette input and selection')
      await report('palette', state)
      return
    }
    await report(name, name === 'palette' ? paletteState() : {})
  }
  function recordPaletteKey(event) {
    const input = document.querySelector('[cmdk-input]')
    if (!input) return
    // WebKit gives a key that the macOS input method claimed keyCode 229, so keyCode and composing make that case visible (#1560).
    void report('palette-key', { key: event.key, code: event.code, keyCode: event.keyCode, composing: event.isComposing, trusted: event.isTrusted,
      targetInput: event.target === input, documentFocused: document.hasFocus(), before: paletteState(),
      metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey })
  }
  function recordAstraKey(event) {
    const conversation = document.querySelector('[data-shell-conversation]')
    if (!conversation) return
    // A receipt shows whether a native Escape reached the page while Astra was open, apart from whether Astra closed.
    void report('astra-key', { key: event.key, code: event.code, keyCode: event.keyCode, composing: event.isComposing, trusted: event.isTrusted,
      documentFocused: document.hasFocus(), targetComposer: event.target === conversation.querySelector('[data-composer-input]') })
  }
  // cmdk names its input through aria-labelledby, which outranks aria-label: https://www.w3.org/TR/accname-1.2/#computation-steps
  function accessibleName(element) {
    const labelledBy = element?.getAttribute('aria-labelledby')?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent.trim()).filter(Boolean).join(' ')
    return labelledBy || element?.getAttribute('aria-label') || null
  }
  function paletteState() {
    const input = document.querySelector('[cmdk-input]')
    const results = [...document.querySelectorAll('[cmdk-item]:not([aria-disabled="true"])')]
    const selected = results.findIndex((result) => result.getAttribute('aria-selected') === 'true')
    return { busy: document.querySelector('[cmdk-list]')?.getAttribute('aria-busy') === 'true',
      inputFocused: document.activeElement === input, selected, results: results.map((result) => result.getAttribute('aria-label') || result.textContent.trim()),
      inputName: accessibleName(input), listId: input?.getAttribute('aria-controls'), activeDescendantId: input?.getAttribute('aria-activedescendant') }
  }
  // The shell reads the root mode class, but the page paints from the inline tokens that only the theme switch writes with
  // that class (apps/web/lib/theme-dom.ts applyThemeTokensToDOM), so the probe presses the real ThemeToggle.
  // The shell then sets the window theme to that mode, which sets the WebView2 colour scheme (src-tauri/src/launch.rs
  // set_theme). That happens after a command round trip, so the probe gives prefers-color-scheme 15 seconds to follow the
  // mode and reports what it reads, and the runner requires the mode.
  async function appearance(mode) {
    const root = document.documentElement
    const other = mode === 'dark' ? 'light' : 'dark'
    if (!root.classList.contains(mode) || root.classList.contains(other)) {
      const toggle = await until(() => document.querySelector('[data-theme-toggle]'), 'the theme toggle', 15000)
      toggle.click()
      await until(() => root.classList.contains(mode) && !root.classList.contains(other), `the ${mode} page mode after the theme toggle`, 15000)
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches
    const deadline = Date.now() + 15000
    while (prefersDark() !== (mode === 'dark') && Date.now() < deadline) await delay(100)
    await report(`appearance-${mode}`, { canvas: root.style.getPropertyValue('--bg'), prefersDark: prefersDark() })
  }
  // The menu action asks the shell to show its native menu, which stays open until the reader closes it, so the probe
  // reports the press without waiting for the command to settle.
  async function windowMenu() {
    const action = await until(() => document.querySelector('[data-window-action="menu"]'), 'the window bar menu action', 15000)
    action.click()
    await report('window-menu')
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
    let session = await fetch('/api/auth/session', { cache: 'no-store' })
    if (!session.ok && session.status !== 401) throw new Error(`BFF session check failed: HTTP ${session.status}`)
    if (__BENCH_REPORT_SIGN_IN__) {
      await until(() => signInPaths.includes(location.pathname), 'the sign-in page')
      await report('sign-in', { route: location.pathname, session: session.status })
      return
    }
    if (__BENCH_EXPECT_AUTHENTICATED__ && !session.ok) throw new Error('Authenticated installed relaunch lost its BFF session')
    if (emailLink || location.pathname.includes('/login') || location.pathname.includes('/onboarding')) {
      if (session.ok && !emailLink) { location.assign('/'); return }
      if (!emailLink) { await emailSignIn(); return }
      await until(() => {
        if (!location.pathname.includes('/login')) return true
        const failure = document.querySelector('[role="alert"]')?.textContent.trim()
        if (failure) throw new Error(`Email login failed: ${failure}`)
        return false
      }, 'email sign-in through the login form')
      session = await fetch('/api/auth/session', { cache: 'no-store' })
      if (document.cookie.includes('auth_token=')) throw new Error('BFF cookie is readable by JavaScript')
    }
    if (!session.ok) throw new Error('Hoje requires an authenticated BFF session')
    if (emailLink) await report('email-completed')
    const pushLabels = location.pathname === '/profile/notifications' && sessionStorage.getItem(pushKey)
    if (pushLabels) { await enablePush(JSON.parse(pushLabels)); return }
    await until(() => document.querySelector('[data-habit-id="bench-0000"]') && document.querySelector('[data-astra-button]:not([disabled])'), 'Hoje')
    await report('hoje', { route: location.pathname, nativeVersion: window.__ORBIT_DESKTOP_VERSION__ })
    while (true) {
      const response = await fetch('/_bench/command')
      if (!response.ok) throw new Error(`Command request failed: ${response.status}`)
      const command = await response.text()
      if (command === 'reload') { location.reload(); return }
      if (command.startsWith('push-enable:')) {
        sessionStorage.setItem(pushKey, command.slice('push-enable:'.length))
        location.assign('/profile/notifications')
        return
      }
      if (command.startsWith('update-')) await update(command.slice(7))
      else if (command.startsWith('appearance-')) await appearance(command.slice('appearance-'.length))
      else if (command === 'window-menu') await windowMenu()
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
