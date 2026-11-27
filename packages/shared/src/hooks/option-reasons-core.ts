import type { StateHook } from './state-adapter'

export type ReportOptionReason = (id: string, reason: string | null) => void

export interface OptionReasons {
  useReportedReason: (report: ReportOptionReason | null, reason: string | null) => boolean
  useOptionReasons: () => { report: ReportOptionReason; shown: string[] }
}

interface OptionReasonAdapters {
  useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback, dependencies: readonly unknown[]) => Callback
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useId: () => string
  useState: StateHook
}

/** The reasons of one option group after one option reports. A null reason removes the option. An unchanged reason returns the same map. */
export function setOptionReason(current: ReadonlyMap<string, string>, id: string, reason: string | null): ReadonlyMap<string, string> {
  if ((current.get(id) ?? null) === reason) return current
  const next = new Map(current)
  if (reason === null) next.delete(id)
  else next.set(id, reason)
  return next
}

/** Each different reason once, in the order of the options. */
export function distinctOptionReasons(reasons: ReadonlyMap<string, string>): string[] {
  return [...new Set(reasons.values())]
}

/** The reason channel between a disabled option and its group. The web and mobile option cards share it. Each app owns its context, because a context is a React value. `useReportedReason` reports the reason of one option and returns true when a group exists to show it. `useOptionReasons` holds the state of one group: the reporter for its options and the reasons to show. */
export function createOptionReasons({ useCallback, useEffect, useId, useState }: OptionReasonAdapters): OptionReasons {
  function useReportedReason(report: ReportOptionReason | null, reason: string | null): boolean {
    const id = useId()
    useEffect(() => {
      report?.(id, reason)
      return () => report?.(id, null)
    }, [report, id, reason])
    return report !== null
  }

  function useOptionReasons(): { report: ReportOptionReason; shown: string[] } {
    const [reasons, setReasons] = useState<ReadonlyMap<string, string>>(new Map())
    const report = useCallback((id: string, reason: string | null) => setReasons((current) => setOptionReason(current, id, reason)), [])
    return { report, shown: distinctOptionReasons(reasons) }
  }

  return { useReportedReason, useOptionReasons }
}
