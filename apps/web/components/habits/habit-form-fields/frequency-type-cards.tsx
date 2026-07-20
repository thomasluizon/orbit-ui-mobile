import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck, Repeat, Shuffle, Infinity } from 'lucide-react'
import { useTranslations } from 'next-intl'

const FREQUENCY_TYPE_CARDS = [
  { key: 'one-time', icon: CalendarCheck, titleKey: 'habits.form.oneTimeTask', descKey: 'habits.form.oneTimeDescription', exampleKey: 'habits.form.oneTimeExample' },
  { key: 'recurring', icon: Repeat, titleKey: 'habits.form.recurring', descKey: 'habits.form.recurringDescription', exampleKey: 'habits.form.recurringExample' },
  { key: 'flexible', icon: Shuffle, titleKey: 'habits.form.flexible', descKey: 'habits.form.flexibleDescription2', exampleKey: 'habits.form.flexibleExample2' },
  { key: 'general', icon: Infinity, titleKey: 'habits.form.general', descKey: 'habits.form.generalDescription', exampleKey: 'habits.form.generalExample' },
] as const

const FREQUENCY_SCROLL_SETTLE_MS = 120

interface FrequencyTypeCardsProps {
  isOneTime: boolean
  isGeneral: boolean
  isFlexible: boolean
  onSetOneTime: () => void
  onSetRecurring: () => void
  onSetFlexible: () => void
  onSetGeneral: () => void
  /** When set, the General type must match this value (a sub-habit's parent, or a
   *  parent's existing sub-habits): the mismatching card(s) are dimmed and disabled.
   *  `null` leaves all four cards freely selectable. */
  lockedGeneral?: boolean | null
  t: ReturnType<typeof useTranslations>
}

export function FrequencyTypeCards({
  isOneTime,
  isGeneral,
  isFlexible,
  onSetOneTime,
  onSetRecurring,
  onSetFlexible,
  onSetGeneral,
  lockedGeneral = null,
  t,
}: Readonly<FrequencyTypeCardsProps>) {
  const activeFrequencyKey = (() => {
    if (isOneTime) return 'one-time'
    if (isGeneral) return 'general'
    if (isFlexible) return 'flexible'
    return 'recurring'
  })()

  const frequencyHandlers: Record<string, () => void> = {
    'one-time': onSetOneTime,
    recurring: onSetRecurring,
    flexible: onSetFlexible,
    general: onSetGeneral,
  }

  const frequencyTrackRef = useRef<HTMLDivElement>(null)
  const hasPositionedFrequencyRef = useRef(false)
  const frequencyScrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeFrequencyIndex = FREQUENCY_TYPE_CARDS.findIndex((card) => card.key === activeFrequencyKey)

  useEffect(() => {
    const track = frequencyTrackRef.current
    if (!track) return

    let frame = 0
    const positionToActive = () => {
      const width = track.clientWidth
      if (width === 0) {
        frame = requestAnimationFrame(positionToActive)
        return
      }
      const target = activeFrequencyIndex * width
      if (Math.abs(track.scrollLeft - target) > 1) {
        track.scrollTo({
          left: target,
          behavior: hasPositionedFrequencyRef.current ? 'smooth' : 'auto',
        })
      }
      hasPositionedFrequencyRef.current = true
    }

    positionToActive()
    return () => {
      if (frame) cancelAnimationFrame(frame)
    }
  }, [activeFrequencyIndex])

  useEffect(() => () => {
    if (frequencyScrollSettleTimerRef.current) {
      clearTimeout(frequencyScrollSettleTimerRef.current)
    }
  }, [])

  function handleFrequencyScroll() {
    if (frequencyScrollSettleTimerRef.current) {
      clearTimeout(frequencyScrollSettleTimerRef.current)
    }
    frequencyScrollSettleTimerRef.current = setTimeout(() => {
      const track = frequencyTrackRef.current
      if (!track || track.clientWidth === 0) return
      const index = Math.round(track.scrollLeft / track.clientWidth)
      const nextCard = FREQUENCY_TYPE_CARDS[index]
      if (!nextCard || nextCard.key === activeFrequencyKey) return
      if (isCardDisabled(nextCard.key)) {
        track.scrollTo({ left: activeFrequencyIndex * track.clientWidth, behavior: 'smooth' })
        return
      }
      frequencyHandlers[nextCard.key]?.()
    }, FREQUENCY_SCROLL_SETTLE_MS)
  }

  function goToFrequencyIndex(index: number) {
    const nextCard = FREQUENCY_TYPE_CARDS[index]
    if (nextCard && !isCardDisabled(nextCard.key)) {
      frequencyHandlers[nextCard.key]?.()
    }
  }

  function isCardDisabled(cardKey: string): boolean {
    if (lockedGeneral === null) return false
    return lockedGeneral ? cardKey !== 'general' : cardKey === 'general'
  }

  return (
    <div className="space-y-2" role="radiogroup" aria-labelledby="habit-form-frequency-label">
      <span id="habit-form-frequency-label" className="form-label">
        {t('habits.form.frequency')}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t('common.previous')}
          disabled={activeFrequencyIndex === 0}
          onClick={() => goToFrequencyIndex(activeFrequencyIndex - 1)}
          className="touch-target grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-elev)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-opacity duration-[var(--dur-fast)] hover:text-[var(--fg-1)] disabled:pointer-events-none disabled:opacity-30 sm:hidden"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div
          ref={frequencyTrackRef}
          data-testid="frequency-carousel-track"
          onScroll={handleFrequencyScroll}
          className="flex min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:snap-none sm:grid-cols-1 sm:gap-2 sm:overflow-visible"
        >
          {FREQUENCY_TYPE_CARDS.map((card) => {
            const isActive = activeFrequencyKey === card.key
            const isDisabled = isCardDisabled(card.key)
            const Icon = card.icon
            return (
              <div key={card.key} className="w-full shrink-0 snap-center px-1 sm:w-auto sm:min-w-0 sm:px-0">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={isDisabled}
                  onClick={frequencyHandlers[card.key]}
                  className={`appearance-none text-left w-full sm:h-full rounded-[18px] border-0 transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] ${
                    isDisabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer active:scale-[0.99]'
                  } ${
                    isActive
                      ? 'bg-[rgba(var(--primary-rgb),0.10)] shadow-[inset_0_0_0_1.5px_var(--primary)]'
                      : 'bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-elev-2)]'
                  }`}
                  style={{ padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      className="grid shrink-0 place-items-center"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
                      }}
                    >
                      <Icon
                        size={22}
                        strokeWidth={2.2}
                        aria-hidden="true"
                        style={{ color: 'var(--primary)' }}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 3 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 16,
                          fontWeight: 500,
                          color: 'var(--fg-1)',
                        }}
                      >
                        {t(card.titleKey as Parameters<typeof t>[0])}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13,
                          color: 'var(--fg-3)',
                          lineHeight: 1.45,
                        }}
                      >
                        {t(card.descKey as Parameters<typeof t>[0])}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          color: 'var(--fg-3)',
                          lineHeight: 1.4,
                        }}
                      >
                        {t(card.exampleKey as Parameters<typeof t>[0])}
                      </span>
                    </span>
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          aria-label={t('common.next')}
          disabled={activeFrequencyIndex === FREQUENCY_TYPE_CARDS.length - 1}
          onClick={() => goToFrequencyIndex(activeFrequencyIndex + 1)}
          className="touch-target grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-elev)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-opacity duration-[var(--dur-fast)] hover:text-[var(--fg-1)] disabled:pointer-events-none disabled:opacity-30 sm:hidden"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 pt-2.5 sm:hidden">
        {FREQUENCY_TYPE_CARDS.map((card, index) => (
          <span
            key={card.key}
            aria-hidden="true"
            className={`h-1.5 rounded-full transition-[background-color] duration-[var(--dur-base)] ${
              index === activeFrequencyIndex
                ? 'w-4 bg-[var(--primary)]'
                : 'w-1.5 bg-[var(--hairline-strong)]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
