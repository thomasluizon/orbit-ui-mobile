'use client'

import { useTranslations } from 'next-intl'
import { CHAT_SPEECH_LANGUAGES as SPEECH_LANGUAGES } from '@orbit/shared/chat'
import { Popover } from '@/components/ui/popover'

interface ChatLanguagePickerProps {
  speechLang: string
  setSpeechLang: (value: string) => void
  currentLangFlag: string
}

/** Header voice-language control: a flag button that opens the speech-recognition
 *  language list. Rendered in the chat AppBar trailing slot when speech is supported. */
export function ChatLanguagePicker({
  speechLang,
  setSpeechLang,
  currentLangFlag,
}: Readonly<ChatLanguagePickerProps>) {
  const t = useTranslations()

  return (
    <Popover
      placement="bottom-end"
      className="min-w-[148px]"
      trigger={
        <button
          type="button"
          aria-label={t('chat.speechLanguage')}
          className="icon-btn text-[var(--fg-3)] hover:text-[var(--fg-1)]"
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          {currentLangFlag}
        </button>
      }
    >
      {(close) => (
        <>
          {SPEECH_LANGUAGES.map((lang) => {
            const active = speechLang === lang.value
            return (
              <button
                key={lang.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setSpeechLang(lang.value)
                  close()
                }}
                className="w-full text-left flex items-center bg-transparent cursor-pointer transition-colors hover:bg-[var(--bg-sunk)]"
                style={{
                  padding: '8px 10px',
                  gap: 10,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                  borderRadius: 6,
                }}
              >
                <span>{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            )
          })}
        </>
      )}
    </Popover>
  )
}
