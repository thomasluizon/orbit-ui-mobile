'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSocialErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { useAppToast } from '@/hooks/use-app-toast'
import { useSendCheer } from '@/hooks/use-friends'

export interface CheerTarget {
  recipientId: string
  displayName: string
}

const REACTIONS = [
  { emoji: '👏', labelKey: 'social.cheer.reactions.clap' },
  { emoji: '🔥', labelKey: 'social.cheer.reactions.fire' },
  { emoji: '💪', labelKey: 'social.cheer.reactions.muscle' },
  { emoji: '⭐', labelKey: 'social.cheer.reactions.star' },
  { emoji: '🎉', labelKey: 'social.cheer.reactions.party' },
  { emoji: '💜', labelKey: 'social.cheer.reactions.heart' },
] as const

const MAX_NOTE = 200

interface CheerComposerProps {
  target: CheerTarget | null
  onClose: () => void
}

/** Bottom-sheet composer for a general cheer: optional emoji reactions written into an optional note. */
export function CheerComposer({ target, onClose }: Readonly<CheerComposerProps>) {
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()
  const sendCheer = useSendCheer()
  const [note, setNote] = useState('')

  function close() {
    setNote('')
    onClose()
  }

  function appendReaction(emoji: string) {
    setNote((current) => (current + emoji).slice(0, MAX_NOTE))
  }

  async function handleSend() {
    if (!target) return
    const trimmed = note.trim()
    try {
      await sendCheer.mutateAsync({
        recipientId: target.recipientId,
        note: trimmed.length > 0 ? trimmed : undefined,
      })
      showSuccess(t('social.cheer.success'))
      close()
    } catch (error: unknown) {
      showError(t(getSocialErrorKey(error)))
    }
  }

  return (
    <AppOverlay
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
      title={t('social.cheer.title')}
      description={target ? t('social.cheer.subtitle', { name: target.displayName }) : undefined}
      footer={
        <PillButton
          onClick={handleSend}
          disabled={sendCheer.isPending}
          busy={sendCheer.isPending}
          fullWidth
        >
          {sendCheer.isPending ? t('social.cheer.sending') : t('social.cheer.send')}
        </PillButton>
      }
    >
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              aria-label={t(reaction.labelKey)}
              onClick={() => appendReaction(reaction.emoji)}
              className="inline-flex items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                width: 48,
                height: 48,
                fontSize: 24,
                background: 'var(--bg-elev)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
          maxLength={MAX_NOTE}
          placeholder={t('social.cheer.notePlaceholder')}
          aria-label={t('social.cheer.notePlaceholder')}
          rows={3}
          style={{
            width: '100%',
            resize: 'none',
            borderRadius: 14,
            background: 'var(--bg-field)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            padding: '12px 14px',
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            lineHeight: 1.45,
            color: 'var(--fg-1)',
            outline: 'none',
          }}
        />
      </div>
    </AppOverlay>
  )
}
