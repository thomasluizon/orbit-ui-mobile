'use client'

import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  RefObject,
} from 'react'

/** v8 6-digit code input: mono tabular-nums, 0.4em letter-spacing, bare hairline underline. */
interface CodeInputProps {
  digits: string[]
  inputRefs: RefObject<(HTMLInputElement | null)[]>
  onChange: (index: number, value: string) => void
  onKeyDown: (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => void
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void
  ariaLabelForIndex: (index: number) => string
  ariaLabelledBy?: string
}

export function CodeInput({
  digits,
  inputRefs,
  onChange,
  onKeyDown,
  onPaste,
  ariaLabelForIndex,
  ariaLabelledBy,
}: Readonly<CodeInputProps>) {
  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    onChange(index, event.target.value)
  }

  return (
    <fieldset
      className="flex items-center justify-center"
      style={{ gap: 14, border: 0, padding: 0, margin: 0, minInlineSize: 0 }}
      aria-labelledby={ariaLabelledBy}
    >
      {digits.map((digit, index) => (
        <input
          key={`code-digit-${index}`}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          value={digit}
          data-code-index={index}
          aria-label={ariaLabelForIndex(index)}
          type="text"
          inputMode="numeric"
          maxLength={20}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          style={{
            width: 44,
            flex: 'none',
            appearance: 'none',
            border: 0,
            background: 'transparent',
            outline: 'none',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--fg-1)',
            letterSpacing: '0.06em',
            padding: '8px 0',
            borderBottom: '1px solid var(--hairline-strong)',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      ))}
    </fieldset>
  )
}
