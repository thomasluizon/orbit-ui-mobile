import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { promptExampleParts } from '@orbit/shared/chat/prompt-library'
import { buildCatalogIdea, type CatalogIdeaProps, type PromptIdeaProps } from '@orbit/shared/chat/prompt-library-core'
import { PADDING } from '@orbit/shared/theme'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Lightbulb, Sun, Moon, Plus, Target, Bell, ListTree, Clock, List, ArrowsMove, SkipForward, CheckCheck, Tag, CalendarDays, RotateCcw, Minus, CircleDot, ChartLine, Repeat, Snowflake, CalendarClock, Download, Calendar } from '@/components/ui/icons'

const intentIcons = { Sun, Moon, Plus, Target, Bell, ListTree, Clock, List, ArrowsMove, SkipForward, CheckCheck, Tag, CalendarDays, RotateCcw, Minus, CircleDot, ChartLine, Repeat, Snowflake, CalendarClock, Download, Calendar }

export function PromptIdea({ label, icon, example, invokesAstra = true, catalogId, disabled, onSelect }: Readonly<PromptIdeaProps<ReactNode>>) {
  const descriptionId = useId()
  return <button type="button" data-prompt-idea={catalogId ? 'catalog' : 'live'} data-prompt-id={catalogId} aria-label={label} aria-describedby={example ? descriptionId : undefined} disabled={disabled}
    onClick={onSelect} style={{ padding: PADDING.recordInset }}>
    <span data-prompt-idea-content="">
      <span data-prompt-intent="" aria-hidden="true">{icon ?? <Lightbulb size={24} strokeWidth={1.5} />}</span>
      <span data-prompt-idea-text="">
        <span data-slot="prompt-idea-title">{label}</span>
        {example ? <span id={descriptionId} data-prompt-example="">{promptExampleParts(example).map((part, index) => <span key={index} data-prompt-slot={part.slot || undefined}>{part.text}</span>)}</span> : null}
      </span>
    </span>
    {invokesAstra ? <span data-prompt-attribution="" aria-hidden="true"><AstraGlyph size={20} /></span> : null}
  </button>
}

export function CatalogIdea({ template, disabled, onSelect }: Readonly<CatalogIdeaProps>) {
  const t = useTranslations()
  const { intentIcon, ...idea } = buildCatalogIdea(template, t, onSelect)
  const Icon = intentIcons[intentIcon]
  return <PromptIdea {...idea} icon={<Icon size={24} strokeWidth={1.5} />} disabled={disabled} />
}
