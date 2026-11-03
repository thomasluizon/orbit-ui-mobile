export const MODULE_LOAD_TIMEOUT_MS = 60_000

export async function loadModule<Module>(load: () => Promise<Module>, onFailure?: (error: unknown) => void): Promise<Module> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      load(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Module load timed out')), MODULE_LOAD_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    onFailure?.(error)
    throw error
  } finally {
    clearTimeout(timer)
  }
}
