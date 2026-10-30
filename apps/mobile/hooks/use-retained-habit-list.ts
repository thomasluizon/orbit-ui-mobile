import { useEffect, useMemo, useState } from 'react'
import { resolveMotionPreset } from '@orbit/shared/theme'

interface PresentedItem<T> {
  item: T
  phase: 'present' | 'enter' | 'exit'
  deadline: number
}

export function useRetainedHabitList<T extends { id: string }>(items: T[], scope: string, reduced: boolean) {
  const enter = resolveMotionPreset('list-enter', reduced)
  const exit = resolveMotionPreset('list-exit', reduced)
  const [snapshot, setSnapshot] = useState(() => ({ scope, source: items,
    entries: items.map((item): PresentedItem<T> => ({ item, phase: 'present', deadline: 0 })) }))
  let entries = snapshot.entries
  const sameSource = snapshot.source.length === items.length && snapshot.source.every((previous, index) => {
    const current = items[index]!
    return Object.keys(previous).length === Object.keys(current).length &&
      Object.keys(previous).every((key) => previous[key as keyof T] === current[key as keyof T])
  })
  if (!sameSource || snapshot.scope !== scope) {
    const previous = snapshot.scope === scope ? snapshot.entries : []
    const previousIds = new Set(previous.map(({ item }) => item.id))
    const nextIds = new Set(items.map((item) => item.id))
    const now = performance.now()
    entries = items.map((item): PresentedItem<T> => ({ item,
      phase: previousIds.has(item.id) || snapshot.scope !== scope ? 'present' : 'enter',
      deadline: now + enter.enterDuration }))
    previous.forEach((entry, index) => {
      if (nextIds.has(entry.item.id)) return
      entries.splice(Math.min(index, entries.length), 0, { ...entry, phase: 'exit',
        deadline: entry.phase === 'exit' ? entry.deadline : now + exit.exitDuration })
    })
    setSnapshot({ scope, source: items, entries })
  }
  useEffect(() => {
    const deadlines = snapshot.entries.filter((entry) => entry.phase !== 'present').map((entry) => entry.deadline)
    if (!deadlines.length) return
    const timeout = setTimeout(() => {
      const now = performance.now()
      setSnapshot((current) => ({ ...current, entries: current.entries
        .filter((entry) => entry.phase !== 'exit' || entry.deadline > now)
        .map((entry) => entry.deadline <= now ? { ...entry, phase: 'present' } : entry) }))
    }, Math.max(0, Math.min(...deadlines) - performance.now()))
    return () => clearTimeout(timeout)
  }, [snapshot])
  const [measurements, setMeasurements] = useState(new Map<string, number>())
  const measure = (id: string, height: number) => setMeasurements((previous) => {
    if (previous.get(id) === height) return previous
    return new Map(previous).set(id, height)
  })
  let offset: number | null = 0
  const rows = entries.map((entry) => {
    const row = { ...entry, offset }
    const height = measurements.get(entry.item.id)
    offset = height === undefined || offset === null ? null : offset + height
    return row
  })
  const presentedItems = useMemo(() => entries.map((entry) => entry.item), [entries])
  return { rows, items: presentedItems, measure }
}
