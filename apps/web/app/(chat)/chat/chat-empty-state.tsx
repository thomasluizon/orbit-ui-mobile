'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SuggestionChips } from '@/components/chat/suggestion-chips'

interface ChatEmptyStateProps {
  onSelectSuggestion: (suggestion: string) => void
}

/** Centered hero shown when the chat has no messages: orb, prompt copy, and the
 *  starter suggestion chips. */
export function ChatEmptyState({ onSelectSuggestion }: Readonly<ChatEmptyStateProps>) {
  const t = useTranslations()

  return (
    <div
      className="relative flex flex-col items-center justify-center h-full"
      style={{ gap: 16, padding: '32px' }}
    >
      <div className="relative z-10 flex flex-col items-center" style={{ gap: 16 }}>
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: 84,
            height: 84,
            background: 'rgba(var(--primary-rgb), 0.16)',
            boxShadow: '0 0 50px rgba(var(--primary-rgb), 0.35)',
          }}
        >
          <Sparkles size={38} strokeWidth={1.8} color="var(--primary-soft)" />
        </div>
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'var(--fg-1)',
          }}
        >
          {t('chat.empty.title')}
        </div>
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {t('chat.suggestion.prompt')}
        </div>
        <SuggestionChips onSelect={onSelectSuggestion} />
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            color: 'var(--fg-3)',
            maxWidth: 300,
            lineHeight: 1.4,
            marginTop: 4,
          }}
        >
          {t('aiDisclosure.notMedicalAdvice')}
        </div>
      </div>
    </div>
  )
}
