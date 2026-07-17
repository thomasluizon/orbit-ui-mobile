'use client'

import { useTranslations } from 'next-intl'
import { AstraAvatar } from '@/components/ui/astra-avatar'
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
        <AstraAvatar size={84} animate />
        <div
          className="text-center text-balance"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 22,
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
            // react-doctor-disable-next-line no-tiny-text -- intentional AI-disclosure fine print (legal caption), not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
