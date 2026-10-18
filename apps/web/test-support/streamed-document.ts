export function waitForStreamedDocument(): Promise<void> {
  const pendingSegments = '[hidden][id^="S:"], [hidden] [id^="S:"], [aria-hidden="true"][id^="S:"]'
  if (!document.querySelector(pendingSegments)) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (document.querySelector(pendingSegments)) return
      observer.disconnect()
      clearTimeout(deadline)
      resolve()
    })
    const deadline = setTimeout(() => {
      observer.disconnect()
      reject(new Error('React streamed segments remained pending before layout inspection'))
    }, 15_000)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  })
}
