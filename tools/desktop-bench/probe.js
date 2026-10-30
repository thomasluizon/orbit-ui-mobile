(() => {
  const post = (payload) => fetch('/_bench/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  const frame = () => new Promise(requestAnimationFrame)
  async function until(read, label) {
    const deadline = performance.now() + 60000
    while (performance.now() < deadline) {
      const result = read()
      if (result) return result
      await pause(20)
    }
    throw new Error(`Timed out: ${label}; route=${location.pathname}; rows=${document.querySelectorAll('[data-habit-id]').length}; text=${document.body.innerText.slice(-1500)}`)
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
    document.querySelector('[data-composer-input]:not([disabled])').focus()
    const textarea = await until(() => document.querySelector('[data-shell-conversation] [data-composer-input]:not([disabled])'), 'conversation composer')
    const originalFetch = window.fetch
    let requestAt = null
    let terminalAt = null
    window.fetch = async (...argumentsList) => {
      const url = String(argumentsList[0] instanceof Request ? argumentsList[0].url : argumentsList[0])
      if (!url.includes('/api/chat/stream')) return originalFetch(...argumentsList)
      requestAt = performance.now()
      const response = await originalFetch(...argumentsList)
      if (!response.ok) throw new Error(`Chat HTTP ${response.status}`)
      void (async () => {
        const reader = response.clone().body.getReader()
        const decoder = new TextDecoder()
        let text = ''
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          text += decoder.decode(chunk.value, { stream: true })
          if (text.includes('"type":"final"')) terminalAt = performance.now()
        }
      })().catch((error) => { void post({ kind: 'error', message: error.message }) })
      return response
    }
    const started = performance.now()
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Give me one small step.')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await pause(50)
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
    await until(() => requestAt !== null, 'chat request from composer')
    await until(() => document.body.innerText.includes('A small'), 'first rendered token')
    const firstTokenMs = performance.now() - started
    await until(() => terminalAt !== null && document.body.innerText.includes('A small step counts.'), 'final rendered part')
    await frame()
    window.fetch = originalFetch
    return { firstTokenMs, finalPartMs: performance.now() - started, requestDispatchMs: requestAt - started, finalEventMs: terminalAt - started }
  }
  async function run() {
    const textarea = await until(() => {
      const row = document.querySelector('[data-habit-id="bench-0000"]')
      const input = document.querySelector('[data-composer-input]:not([disabled])')
      if (!row || !input || !row.getBoundingClientRect().height || !input.getBoundingClientRect().height) return null
      return input
    }, 'first interactive habit and focusable composer')
    await until(() => {
      if (document.querySelector('[data-shell-conversation]')) return true
      textarea.blur()
      textarea.focus({ preventScroll: true })
      return false
    }, 'hydrated composer focus response')
    const usableEpoch = performance.timeOrigin + performance.now()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    await until(() => !document.querySelector('[data-shell-conversation]') && !document.querySelector('[data-shell-destination]')?.inert, 'return to Hoje')
    await frame()
    await post({ kind: 'usable', epochMs: usableEpoch, visibility: document.visibilityState })
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
