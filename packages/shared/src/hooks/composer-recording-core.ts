export function subscribeComposerRecordingTime(onTime: (elapsed: string) => void): () => void {
  const startedAt = Date.now()
  const interval = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    onTime(`${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`)
  }, 1000)
  return () => clearInterval(interval)
}

const VOICE_BAR_WIDTH = 3
const VOICE_BAR_GAP = 3
const VOICE_BAR_FLOOR_HEIGHT = 4
const VOICE_BAR_MAX_HEIGHT = 24
const VOICE_FULL_LEVEL_RMS = 0.2

/** Maps an RMS sample to 0..1. The square root follows perceived loudness. */
export function voiceLevelFromRms(rms: number): number {
  return rms > 0 ? Math.sqrt(Math.min(1, rms / VOICE_FULL_LEVEL_RMS)) : 0
}

export function voiceBarCount(width: number): number {
  return Math.max(0, Math.floor((width + VOICE_BAR_GAP) / (VOICE_BAR_WIDTH + VOICE_BAR_GAP)))
}

/** The vertical scale of a bar that is laid out at the maximum height. */
export function voiceBarScale(level: number): number {
  return (VOICE_BAR_FLOOR_HEIGHT + (VOICE_BAR_MAX_HEIGHT - VOICE_BAR_FLOOR_HEIGHT) * level) / VOICE_BAR_MAX_HEIGHT
}

/** Returns `count` bars, oldest first. The new level enters at the end and silent bars fill the start. */
export function pushVoiceBar(bars: readonly number[], level: number, count: number): number[] {
  if (count <= 0) return []
  const kept = [...bars, level].slice(-count)
  return [...Array<number>(count - kept.length).fill(0), ...kept]
}

/** The next bars for one sample. With reduced motion every bar shows the new level in place, so nothing scrolls. */
export function nextVoiceBars(bars: readonly number[], level: number, count: number, reducedMotion: boolean): number[] {
  return reducedMotion ? Array<number>(count).fill(level) : pushVoiceBar(bars, level, count)
}

const voiceLevelListeners = new Set<(level: number) => void>()

export function publishComposerVoiceLevel(level: number): void {
  for (const listener of voiceLevelListeners) listener(level)
}

export function subscribeComposerVoiceLevel(onLevel: (level: number) => void): () => void {
  voiceLevelListeners.add(onLevel)
  return () => { voiceLevelListeners.delete(onLevel) }
}
