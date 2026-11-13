'use client'

import { ChevronRight } from '@/components/ui/icons'

interface QuestionRowProps {
  /** The question in the words of the person. It is the visible label and the accessible name. */
  question: string
  /** The current answer. */
  value?: string
  onPress: () => void
}

/** A row that asks a question and shows its current answer. A press opens the step that owns the answer. */
export function QuestionRow({ question, value, onPress }: Readonly<QuestionRowProps>) {
  return (
    <button type="button" data-question-row="" onClick={onPress}
      className="orbit-field-hover-overlay relative flex min-h-12 w-full items-center gap-3 rounded-[12px] bg-[var(--bg-field)] px-4 py-3 text-start text-base text-[var(--fg-1)] transition-[background-color,scale] duration-[var(--dur-hover-control),var(--dur-press)] ease-[var(--ease-standard)] motion-safe:active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)]">
      <span className="min-w-0 flex-1">{question}</span>
      {value ? <span className="max-w-[40%] shrink-0 truncate text-sm text-[var(--fg-2)]">{value}</span> : null}
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-[var(--fg-3)]" />
    </button>
  )
}
