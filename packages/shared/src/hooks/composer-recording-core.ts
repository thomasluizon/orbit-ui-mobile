export function subscribeComposerRecordingTime(onTime: (elapsed: string) => void): () => void {
  const startedAt = Date.now()
  const interval = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    onTime(`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`)
  }, 1000)
  return () => clearInterval(interval)
}
