'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { PillButton } from '@/components/ui/pill-button'
import type { UserFact } from '@orbit/shared/types/user-fact'
import { FactItem } from './fact-item'

function FactsCenteredState({
  message,
  messageColor,
  alert = false,
  button,
}: Readonly<{
  message: string
  messageColor: string
  alert?: boolean
  button: React.ReactNode
}>) {
  return (
    <div
      className="flex flex-col items-center text-center animate-scale-in"
      style={{ padding: '40px 36px', gap: 18 }}
    >
      <SatelliteGlyph size={104} />
      <span
        role={alert ? 'alert' : undefined}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: messageColor,
          lineHeight: 1.5,
          maxWidth: 320,
          textWrap: 'pretty',
        }}
      >
        {message}
      </span>
      {button}
    </div>
  )
}

interface UserFactsListProps {
  isLoading: boolean
  hasError: boolean
  facts: UserFact[]
  pagedFacts: UserFact[]
  selectMode: boolean
  selectedFactIds: Set<string>
  onToggleSelection: (id: string) => void
  onDelete: (id: string) => void
  onRetry: () => void
  onAskAstra: () => void
}

export function UserFactsList({
  isLoading,
  hasError,
  facts,
  pagedFacts,
  selectMode,
  selectedFactIds,
  onToggleSelection,
  onDelete,
  onRetry,
  onAskAstra,
}: Readonly<UserFactsListProps>) {
  const t = useTranslations()

  if (isLoading) {
    return (
      <div className="px-5 space-y-2.5">
        <div
          className="w-full animate-pulse"
          style={{ height: 56, borderRadius: 16, background: 'var(--bg-elev)' }}
        />
        <div
          className="w-full animate-pulse"
          style={{ height: 56, borderRadius: 16, background: 'var(--bg-elev)' }}
        />
      </div>
    )
  }

  if (hasError) {
    return (
      <FactsCenteredState
        message={t('profile.facts.factsError')}
        messageColor="var(--status-bad)"
        alert
        button={
          <PillButton fullWidth onClick={onRetry} className="mt-2">
            {t('profile.facts.retry')}
          </PillButton>
        }
      />
    )
  }

  if (facts.length === 0) {
    return (
      <FactsCenteredState
        message={t('profile.facts.empty')}
        messageColor="var(--fg-2)"
        button={
          <PillButton
            fullWidth
            onClick={onAskAstra}
            leading={<Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />}
            className="mt-2"
          >
            {t('summary.askAstra')}
          </PillButton>
        }
      />
    )
  }

  return (
    <div className="flex flex-col px-5 stagger-enter" style={{ gap: 10 }}>
      {pagedFacts.map((fact) => (
        <FactItem
          key={fact.id}
          fact={fact}
          selectMode={selectMode}
          isSelected={selectedFactIds.has(fact.id)}
          onToggleSelection={() => onToggleSelection(fact.id)}
          onDelete={() => onDelete(fact.id)}
        />
      ))}
    </div>
  )
}
