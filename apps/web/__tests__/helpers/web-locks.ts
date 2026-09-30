/** Models exclusive named locks and cancellation before grant, per https://www.w3.org/TR/web-locks/#api-lockmanager. */
export function installWebLocks() {
  const queues = new Map<string, Promise<unknown>>()
  const request = <T>(
    name: string,
    optionsOrTask: LockOptions | (() => Promise<T>),
    callback?: () => Promise<T>,
  ): Promise<T> => {
    const options = typeof optionsOrTask === 'function' ? {} : optionsOrTask
    const task = typeof optionsOrTask === 'function' ? optionsOrTask : callback!
    const result = new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException('Lock request aborted', 'AbortError'))
      if (options.signal?.aborted) { abort(); return }
      options.signal?.addEventListener('abort', abort, { once: true })
      const granted = (queues.get(name) ?? Promise.resolve()).then(async () => {
        options.signal?.removeEventListener('abort', abort)
        if (options.signal?.aborted) return
        try { resolve(await task()) } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error('Lock operation failed', { cause: error }))
        }
      })
      queues.set(name, granted.catch(() => undefined))
    })
    return result
  }
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  return { request }
}
