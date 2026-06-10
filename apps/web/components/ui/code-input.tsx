'use client'

import {
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'

/** Kit OTP: six 48x58 filled boxes (radius 14, inset hairline ring), Roboto
 *  26/500 digits, primary ring on the focused box. */
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    onChange(index, event.target.value)
  }

  return (
    <fieldset
      className="flex items-center justify-center"
      style={{ gap: 10, border: 0, padding: 0, margin: 0, minInlineSize: 0 }}
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
          onFocus={() => setActiveIndex(index)}
          onBlur={() =>
            setActiveIndex((current) => (current === index ? null : current))
          }
          style={{
            width: 48,
            height: 58,
            flex: 'none',
            appearance: 'none',
            border: 0,
            outline: 'none',
            borderRadius: 14,
            background: 'var(--bg-field)',
            boxShadow:
              activeIndex === index
                ? 'inset 0 0 0 2px var(--primary)'
                : 'inset 0 0 0 1px var(--hairline)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 26,
            fontWeight: 500,
            color: 'var(--fg-1)',
            padding: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      ))}
    </fieldset>
  )
}
