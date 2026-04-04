'use client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  'I just meditated for 10 minutes',
  'Log my exercise for today',
  'Help me buy groceries',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {SUGGESTIONS.map((suggestion, index) => (
        <button
          key={index}
          className="px-4 py-2 rounded-full text-xs font-medium bg-surface-elevated border border-border-muted text-text-primary hover:border-border hover:scale-[1.02] transition-all duration-150 active:scale-95"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
