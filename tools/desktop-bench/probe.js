(() => {
  const post = (payload) => fetch('/_bench/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  const frame = () => new Promise(requestAnimationFrame)
  async function fitViewport() {
    const [width, height] = __BENCH_VIEWPORT__
    const mismatch = () => new Error(`Viewport mismatch: ${[innerWidth, innerHeight]} versus ${[width, height]}; available screen: ${screen.availWidth}x${screen.availHeight}`)
    if (!__BENCH_READINESS_ONLY__ || !window.__TAURI_INTERNALS__) {
      if (innerWidth !== width || innerHeight !== height) throw mismatch()
      return __BENCH_NATIVE_WINDOW__
    }
    const nativeWindow = await window.__TAURI_INTERNALS__.invoke('fit_bench_viewport', { viewport: [innerWidth, innerHeight] })
      .catch((reason) => { throw new Error(`Cannot fit benchmark viewport: ${String(reason)}`) })
    const deadline = performance.now() + 60000
    do {
      await frame()
      if (innerWidth === width && innerHeight === height) return nativeWindow
      await pause(20)
    } while (performance.now() < deadline)
    throw mismatch()
  }
  async function until(read, label) {
    const deadline = performance.now() + 60000
    while (performance.now() < deadline) {
      const result = read()
      if (result) return result
      await pause(20)
    }
    throw new Error(`Timed out: ${label}; ${JSON.stringify({ route: location.pathname, rows: document.querySelectorAll('[data-habit-id]').length, firstHabit: document.querySelector('[data-habit-id]')?.getAttribute('data-habit-id'), astraButtons: [...document.querySelectorAll('[data-astra-button]')].map((button) => ({ disabled: button.disabled, height: button.getBoundingClientRect().height })), conversationInputs: [...document.querySelectorAll('[data-shell-conversation] [data-composer-input]')].map((input) => ({ disabled: input.disabled, height: input.getBoundingClientRect().height })), viewport: [innerWidth, innerHeight], text: document.body.innerText.slice(0, 700) })}`)
  }
  async function scrollList() {
    const scroller = document.querySelector('[data-shell-scroller]')
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) throw new Error('Hoje must have a scrollable 200-habit list')
    scroller.scrollTop = 0
    const intervals = []
    let previous = await frame()
    const deadline = previous + 60000
    while (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1) {
      scroller.scrollTop += 120
      const now = await frame()
      intervals.push(now - previous)
      previous = now
      if (now > deadline) throw new Error('Scroll traversal timed out')
    }
    await frame()
    if (!document.querySelector('[data-habit-id="bench-0199"]')) throw new Error('Last habit did not render')
    scroller.scrollTop = 0
    return intervals
  }
  async function chat() {
    document.querySelector('[data-astra-button]:not([disabled])').click()
    const textarea = await until(() => document.querySelector('[data-shell-conversation] [data-composer-input]:not([disabled])'), 'conversation composer')
    const previousArticles = new Set(document.querySelectorAll('[role="feed"] article'))
    const replyIncludes = (text) => [...document.querySelectorAll('[role="feed"] article')].some((article) => !previousArticles.has(article) && article.innerText.includes(text))
    const originalFetch = window.fetch
    let requestAt = null
    let terminalAt = null
    window.fetch = async (...argumentsList) => {
      const url = String(argumentsList[0] instanceof Request ? argumentsList[0].url : argumentsList[0])
      if (!url.includes('/api/chat/stream')) return originalFetch(...argumentsList)
      requestAt = performance.now()
      const response = await originalFetch(...argumentsList)
      if (!response.ok) throw new Error(`Chat HTTP ${response.status}`)
      const decoder = new TextDecoder()
      let text = ''
      return new Response(response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          text += decoder.decode(chunk, { stream: true })
          if (terminalAt === null && text.includes('"type":"final"')) terminalAt = performance.now()
          controller.enqueue(chunk)
        },
      })), response)
    }
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Give me one small step.')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await pause(50)
    const started = performance.now()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
    await until(() => requestAt !== null, 'chat request from composer')
    await until(() => replyIncludes('A small'), 'first rendered token')
    const firstTokenMs = performance.now() - started
    await until(() => terminalAt !== null && replyIncludes('A small step counts.'), 'final rendered part')
    await frame()
    window.fetch = originalFetch
    return { firstTokenMs, finalPartMs: performance.now() - started, requestDispatchMs: requestAt - started, finalEventMs: terminalAt - started }
  }
  async function run() {
    await until(() => {
      const row = document.querySelector('[data-habit-id="bench-0000"]')
      const button = document.querySelector('[data-astra-button]:not([disabled])')
      if (!row || !button || !row.getBoundingClientRect().height || !button.getBoundingClientRect().height) return null
      return button
    }, 'first interactive habit and Astra button')
    const nativeWindow = await fitViewport()
    await until(() => {
      if (document.querySelector('[data-shell-conversation]')) return true
      document.querySelector('[data-astra-button]:not([disabled])')?.click()
      return false
    }, 'hydrated Astra button response')
    const usableEpoch = performance.timeOrigin + performance.now()
    await until(() => {
      const conversation = document.querySelector('[data-shell-conversation]')
      if (!conversation && !document.querySelector('[data-shell-destination]')?.inert) return true
      const close = [...(conversation?.querySelectorAll('button') ?? [])].find((button) => button.getAttribute('aria-label') === __BENCH_CLOSE_LABEL__)
      close?.click()
      return false
    }, 'return to Hoje')
    await frame()
    await post({ kind: 'usable', epochMs: usableEpoch, visibility: document.visibilityState, viewport: [innerWidth, innerHeight], nativeWindow, availableScreen: [screen.availWidth, screen.availHeight] })
    for (;;) {
      const response = await fetch('/_bench/command')
      const command = await response.text()
      if (command === 'workload') break
      await pause(100)
    }
    const frames = await scrollList()
    const streaming = await chat()
    await post({ kind: 'complete', frames, ...streaming, visibility: document.visibilityState })
  }
  void run().catch((error) => { void post({ kind: 'error', message: error.message }) })
})()
