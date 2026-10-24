export const TODAY_LAUNCH_SPAN_NAME = 'app.launch.to_today_content'

interface LaunchSpan {
  setAttribute: (name: string, value: boolean) => unknown
  end: () => void
}

interface LaunchSpanOptions {
  name: string
  op: string
  startTime: number
  parentSpan: null
  forceTransaction: boolean
  attributes: Record<string, string>
}

export function sampleTodayLaunch({ name }: { name: string }): number {
  return name === TODAY_LAUNCH_SPAN_NAME ? 1 : 0
}

export function startTodayLaunchTiming(
  startSpan: (options: LaunchSpanOptions) => LaunchSpan,
  startTime: number,
  startSource: 'native' | 'javascript' | 'navigation',
): (fromCache: boolean, empty: boolean) => void {
  const span = startSpan({
    name: TODAY_LAUNCH_SPAN_NAME,
    op: 'ui.load',
    startTime,
    parentSpan: null,
    forceTransaction: true,
    attributes: { 'app.start.source': startSource },
  })
  let finished = false
  return (fromCache, empty) => {
    if (finished) return
    finished = true
    span.setAttribute('today.from_cache', fromCache)
    span.setAttribute('today.empty', empty)
    span.end()
  }
}

export function isTodayLaunchCache(snapshot: { available: boolean; updatedAt: number }, updatedAt: number): boolean {
  return snapshot.available && snapshot.updatedAt === updatedAt
}
