'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Check, Link as LinkIcon, CalendarDays, AlertTriangle, Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { getSupabaseClient } from '@/lib/supabase'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'
import type { FrequencyUnit } from '@orbit/shared/types/habit'

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startDate: string | null
  startTime: string | null
  endTime: string | null
  isRecurring: boolean
  recurrenceRule: string | null
  reminders: number[]
}

interface ImportResult {
  imported: number
  habits: { id: string; title: string }[]
}

type Step = 'loading' | 'select' | 'importing' | 'done' | 'error' | 'not-connected'

function parseRRule(rule: string | null): { frequencyUnit?: FrequencyUnit; frequencyQuantity?: number; days?: string[] } {
  if (!rule) return {}
  const parts: Record<string, string> = Object.fromEntries(
    rule.replace('RRULE:', '').split(';').map((p) => {
      const [k, v] = p.split('=')
      return [k, v ?? ''] as const
    }),
  )
  const freqMap: Record<string, FrequencyUnit> = {
    DAILY: 'Day', WEEKLY: 'Week', MONTHLY: 'Month', YEARLY: 'Year',
  }
  const dayMap: Record<string, string> = {
    MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday',
    FR: 'Friday', SA: 'Saturday', SU: 'Sunday',
  }
  const result: { frequencyUnit?: FrequencyUnit; frequencyQuantity?: number; days?: string[] } = {}
  if (parts.FREQ) result.frequencyUnit = freqMap[parts.FREQ]
  result.frequencyQuantity = parts.INTERVAL ? Number.parseInt(parts.INTERVAL as string) : 1
  if (parts.BYDAY) {
    const days = (parts.BYDAY as string).split(',').map((d: string) => dayMap[d.trim()]).filter((d): d is string => !!d)
    if (days.length > 0) result.days = days
  }
  return result
}

export default function CalendarSyncPage() {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const bulkCreateHabits = useBulkCreateHabits()

  const [step, setStep] = useState<Step>('loading')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const allSelected = events.length > 0 && selectedIds.size === events.length

  function formatDailyRecurrence(interval: number): string {
    if (interval > 1) return plural(t('calendar.recurrenceEveryNDays', { n: interval }), interval)
    return t('calendar.recurrenceDaily')
  }

  function formatWeeklyRecurrence(upper: string, interval: number): string {
    const dayMatch = upper.match(/BYDAY=([A-Z,]+)/)
    const days = dayMatch ? dayMatch[1] : ''
    if (interval > 1) {
      const base = plural(t('calendar.recurrenceEveryNWeeks', { n: interval }), interval)
      return days ? `${base} (${days})` : base
    }
    if (days) return t('calendar.recurrenceWeeklyDays', { days })
    return t('calendar.recurrenceWeekly')
  }

  function formatMonthlyRecurrence(interval: number): string {
    if (interval > 1) return plural(t('calendar.recurrenceEveryNMonths', { n: interval }), interval)
    return t('calendar.recurrenceMonthly')
  }

  function formatRecurrence(rule: string | null): string {
    if (!rule) return ''
    const upper = rule.toUpperCase()
    const intervalMatch = upper.match(/INTERVAL=(\d+)/)
    const interval = intervalMatch?.[1] ? Number.parseInt(intervalMatch[1]) : 1

    if (upper.includes('FREQ=DAILY')) return formatDailyRecurrence(interval)
    if (upper.includes('FREQ=WEEKLY')) return formatWeeklyRecurrence(upper, interval)
    if (upper.includes('FREQ=MONTHLY')) return formatMonthlyRecurrence(interval)
    if (upper.includes('FREQ=YEARLY')) return t('calendar.recurrenceYearly')
    return ''
  }

  // Redirect non-Pro users
  useEffect(() => {
    if (profile && !hasProAccess) {
      router.push('/upgrade')
    }
  }, [profile, hasProAccess, router])

  const fetchEvents = useCallback(async () => {
    setStep('loading')
    try {
      const res = await fetch(API.calendar.events)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.error ?? body?.message ?? `Failed with status ${res.status}`
        const lower = msg.toLowerCase()
        if (lower.includes('not connected') || lower.includes('unauthorized') || lower.includes('invalid authentication credentials')) {
          setStep('not-connected')
          return
        }
        throw new Error(msg)
      }
      const data: CalendarEvent[] = await res.json()
      setEvents(data)
      setSelectedIds(new Set(data.map((e) => e.id)))
      setStep('select')
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.fetchError')))
      setStep('error')
    }
  }, [t])

  useEffect(() => {
    if (profile && hasProAccess) {
      fetchEvents()
    }
  }, [profile, hasProAccess, fetchEvents])

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(events.map((e) => e.id)))
    }
  }

  function toggleEvent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function importSelected() {
    if (selectedIds.size === 0) return
    setStep('importing')

    try {
      const selected = events.filter((e) => selectedIds.has(e.id))
      const habits = selected.map((ev) => {
        const rec = parseRRule(ev.recurrenceRule)
        let qty: number | null = null
        if (rec.frequencyUnit) {
          qty = (rec.frequencyQuantity && rec.frequencyQuantity >= 1) ? rec.frequencyQuantity : 1
        }
        return {
          title: ev.title,
          description: ev.description,
          dueDate: ev.startDate,
          dueTime: ev.startTime,
          dueEndTime: ev.endTime,
          frequencyUnit: rec.frequencyUnit ?? null,
          frequencyQuantity: qty,
          days: qty === 1 ? (rec.days ?? null) : null,
          reminderEnabled: ev.reminders.length > 0,
          reminderTimes: ev.reminders.length > 0 ? ev.reminders : null,
        }
      })

      bulkCreateHabits.mutate(
        { habits },
        {
          onSuccess: (result) => {
            const successCount = result.results.filter((r) => r.status === 'Success').length
            const failedItems = result.results.filter((r) => r.status !== 'Success')
            if (failedItems.length > 0 && successCount === 0) {
              setErrorMessage(failedItems.map((f) => `${f.title ?? 'Unknown'}: ${f.error ?? 'Failed'}`).join(', '))
              setStep('error')
              return
            }
            setImportResult({ imported: successCount, habits: [] })
            setStep('done')
          },
          onError: (err: unknown) => {
            setErrorMessage(getErrorMessage(err, t('calendar.importError')))
            setStep('error')
          },
        },
      )
    } catch (err: unknown) {
      setErrorMessage(getErrorMessage(err, t('calendar.importError')))
      setStep('error')
    }
  }

  async function connectGoogle() {
    const supabase = getSupabaseClient()
    const redirectTo = `${window.location.origin}/auth-callback`
    sessionStorage.setItem('auth_return_url', '/calendar-sync')

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
        },
      },
    })
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <header className="pt-6 pb-6">
        <div className="flex items-center gap-3">
          <Link href="/profile" className="p-2 rounded-full hover:bg-surface transition-colors">
            <ArrowLeft className="size-4 text-text-primary" />
          </Link>
          <h1 className="text-[length:var(--text-fluid-xl)] font-bold text-text-primary">
            {t('calendar.title')}
          </h1>
        </div>
      </header>

      {/* Loading */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-20">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-text-secondary text-sm">{t('calendar.fetchingEvents')}</p>
        </div>
      )}

      {/* Not Connected */}
      {step === 'not-connected' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-20">
          <div className="size-16 rounded-full bg-primary/15 flex items-center justify-center">
            <LinkIcon className="size-8 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary mb-2">{t('calendar.notConnectedTitle')}</h2>
            <p className="text-sm text-text-secondary">{t('calendar.notConnectedDesc')}</p>
          </div>
          <button
            className="bg-primary text-white font-bold py-3 px-8 rounded-[var(--radius-xl)] text-sm hover:bg-primary/90 transition-all"
            onClick={connectGoogle}
          >
            {t('auth.signInWithGoogle')}
          </button>
        </div>
      )}

      {/* Event Selection */}
      {step === 'select' && (
        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="text-center pt-20">
              <CalendarDays className="size-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-secondary">{t('calendar.noEvents')}</p>
              <Link
                href="/profile"
                className="inline-block mt-4 text-primary font-semibold text-sm hover:underline"
              >
                {t('common.goBack')}
              </Link>
            </div>
          ) : (
            <>
              {/* Select all toggle */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  {plural(t('calendar.eventsFound', { count: events.length }), events.length)}
                </p>
                <button
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  onClick={toggleAll}
                >
                  {allSelected ? t('calendar.deselectAll') : t('calendar.selectAll')}
                </button>
              </div>

              {/* Event list */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {events.map((event) => (
                  <button
                    key={event.id}
                    className={`w-full text-left rounded-2xl p-4 transition-all border ${
                      selectedIds.has(event.id)
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-surface border-border'
                    }`}
                    onClick={() => toggleEvent(event.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`shrink-0 mt-0.5 size-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                          selectedIds.has(event.id)
                            ? 'bg-primary border-primary'
                            : 'border-border'
                        }`}
                      >
                        {selectedIds.has(event.id) && <Check className="size-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{event.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {event.startDate && (
                            <span className="text-xs text-text-secondary">
                              {event.startDate}
                            </span>
                          )}
                          {event.startTime && (
                            <span className="text-xs text-text-muted">
                              {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                            </span>
                          )}
                          {event.isRecurring && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                              {formatRecurrence(event.recurrenceRule) || t('calendar.recurring')}
                            </span>
                          )}
                          {event.reminders.length > 0 && (
                            <span className="text-[10px] text-text-muted">
                              <Bell className="size-3 inline" />
                              {event.reminders.length}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-xs text-text-muted mt-1 line-clamp-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Import button */}
              <div className="pt-2">
                <button
                  className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50"
                  disabled={selectedIds.size === 0}
                  onClick={importSelected}
                >
                  {plural(t('calendar.importButton', { count: selectedIds.size }), selectedIds.size)}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center gap-4 pt-20">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-text-secondary text-sm">{t('calendar.importing')}</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-20">
          <div className="size-16 rounded-full bg-green-500/15 flex items-center justify-center">
            <Check className="size-8 text-green-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary mb-2">{t('calendar.importDone')}</h2>
            <p className="text-sm text-text-secondary">
              {plural(t('calendar.importedCount', { count: importResult?.imported ?? 0 }), importResult?.imported ?? 0)}
            </p>
          </div>
          <Link
            href="/"
            className="bg-primary text-white font-bold py-3 px-8 rounded-[var(--radius-xl)] text-sm hover:bg-primary/90 transition-all"
          >
            {t('calendar.goToHabits')}
          </Link>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="flex flex-col items-center justify-center gap-6 pt-20">
          <div className="size-16 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="size-8 text-red-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-text-primary mb-2">{t('calendar.errorTitle')}</h2>
            <p className="text-sm text-text-secondary">{errorMessage}</p>
          </div>
          <div className="flex gap-3">
            <button
              className="bg-primary text-white font-bold py-3 px-6 rounded-[var(--radius-xl)] text-sm hover:bg-primary/90 transition-all"
              onClick={fetchEvents}
            >
              {t('calendar.retry')}
            </button>
            <Link
              href="/profile"
              className="border border-border text-text-secondary font-bold py-3 px-6 rounded-[var(--radius-xl)] text-sm hover:bg-surface transition-all"
            >
              {t('common.goBack')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
