'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { SuggestionChips } from '@/components/chat/suggestion-chips'
import { useAstraSuggestions } from '@/hooks/use-astra-suggestions'

interface ChatEmptyStateProps {
  onSelectSuggestion: (suggestion: string) => void
  contextualAction?: { label: string; onSelect: () => void }
}

/** The first thing a person sees in an empty thread: the Astra mark and title,
 *  the prompt over the suggestions, and the line saying what Astra is not. */
export function ChatEmptyState({ onSelectSuggestion, contextualAction }: Readonly<ChatEmptyStateProps>) {
  const t = useTranslations()
  const suggestions = useAstraSuggestions()
  const hasOpeners = suggestions !== null || contextualAction !== undefined

  return (
    <div className="flex min-h-full flex-col justify-center-safe" style={{ gap: 24 }} aria-live="off">
      <EmptyState mark="astra" title={t('chat.empty.title')} />
      {hasOpeners ? (
        <div className="flex flex-col items-center" style={{ gap: 8 }}>
          <p
            className="m-0 text-center"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--fg-3)' }}
          >
            {t('chat.suggestion.prompt')}
          </p>
          <SuggestionChips suggestions={suggestions ?? []} onSelect={onSelectSuggestion} contextualAction={contextualAction} />
        </div>
      ) : null}
      <p
        className="m-0 self-center text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--fg-3)',
          maxWidth: 300,
          lineHeight: 1.4,
        }}
      >
        {t('aiDisclosure.notMedicalAdvice')}
      </p>
    </div>
  )
}
