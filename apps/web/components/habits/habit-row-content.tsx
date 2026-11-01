import { getHabitChecklistProgress, getHabitRowTypeLabelKey, stripInlineMarkdown, type HabitCardTranslationAdapter } from '@orbit/shared/utils'
import { PersonalText } from '@/components/ui/personal-text'
import { ListChecks } from '@/components/ui/icons'
import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

/** Inline meta token rendered between dots in the row's meta strip.
 *  String tokens follow the row body's interaction color; tagged tokens get status color. */
export type HabitRowMetaToken =
  | string
  | { kind: 'overdue'; label: string }
  | { kind: 'bad'; label: string }
  | { kind: 'future'; label: string }
  | { kind: 'date-status'; label: string }
  | { kind: 'type'; label: string }
  | { kind: 'checklist'; label: string; done: number; total: number }

export function buildHabitRowMetaTokens(habit: NormalizedHabit, meta: HabitRowMetaToken[], t: HabitCardTranslationAdapter): HabitRowMetaToken[] {
  const checklist = getHabitChecklistProgress(habit)
  return [
    { kind: 'type', label: t(getHabitRowTypeLabelKey(habit)) },
    ...meta,
    ...(checklist ? [{ kind: 'checklist' as const, ...checklist, label: `${t('habits.form.checklist')}, ${t('habits.rowProgress', checklist)}` }] : []),
  ]
}

interface HabitRowContentProps {
  habit: NormalizedHabit
  titleSize: number
  titleColor: string
  expanded?: boolean
  descriptionId?: string
  largeText?: boolean
  typeOnSupportingLine?: boolean
  meta: HabitRowMetaToken[]
}

export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  expanded = false,
  descriptionId,
  largeText = false,
  typeOnSupportingLine = false,
  meta,
}: Readonly<HabitRowContentProps>) {
  const description = stripInlineMarkdown(habit.description ?? '')
  const visibleMeta = meta.filter((token) => typeof token === 'string' || token.kind !== 'future')
  const futureHint = meta.find((token) => typeof token !== 'string' && token.kind === 'future')
  return (
    <div data-habit-row-title-block="" className="flex-1 min-w-0 flex flex-col" style={{ gap: 4 }}>
      <TitleText expanded={expanded} title={habit.title} size={titleSize} color={titleColor} />
      {description ? <span id={descriptionId} aria-hidden={descriptionId ? true : undefined} data-habit-row-description=""
        className={`habit-row-description min-w-0 overflow-hidden ${largeText ? 'line-clamp-2' : 'block whitespace-nowrap text-ellipsis'}`}
        style={{ fontFamily: 'var(--font-sans)', fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.55, overflowWrap: 'anywhere' }}>
        {description}
      </span> : null}
      {typeOnSupportingLine ? null : <MetaStrip tokens={visibleMeta} largeText={largeText} />}
      {futureHint && typeof futureHint !== 'string' ? <span className="sr-only">{futureHint.label}</span> : null}
    </div>
  )
}

const TITLE_TEXT_STYLE_BASE = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  lineHeight: 1.25,
  letterSpacing: '-0.005em',
} as const

interface TitleTextProps {
  expanded?: boolean
  title: string
  size: number
  color: string
}

export function TitleText({ title, size, color, expanded }: Readonly<TitleTextProps>) {
  return (
    <PersonalText expanded={expanded}
      className="flex-shrink min-w-0"
      style={{
        ...TITLE_TEXT_STYLE_BASE,
        fontSize: `${size / 16}rem`,
        color,
      }}
    >
      {title}
    </PersonalText>
  )
}

interface MetaStripProps {
  tokens: HabitRowMetaToken[]
  largeText?: boolean
  supportingLine?: boolean
}

export function MetaStrip({ tokens, largeText = false, supportingLine = false }: Readonly<MetaStripProps>) {
  const wrapDateStatus = largeText || supportingLine
  return (
    <span
      data-habit-row-meta=""
      aria-hidden="true"
      className="habit-row-meta flex min-w-0 flex-wrap items-center gap-[4px]"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.4,
      }}
    >
      {tokens.map((token, i) => (
        <span key={metaTokenKey(token, i)} data-habit-row-meta-token="" className={`inline-flex items-center gap-[4px] ${wrapDateStatus && typeof token !== 'string' && token.kind === 'date-status' ? 'min-w-0 max-w-full shrink whitespace-normal' : 'shrink-0 whitespace-nowrap'}`}>
          {renderMetaToken(token, largeText, wrapDateStatus)}
          {i < tokens.length - 1 && <span>·</span>}
        </span>
      ))}
    </span>
  )
}

function metaTokenKey(token: HabitRowMetaToken, index: number): string {
  if (typeof token === 'string') return `s:${index}:${token}`
  return `${token.kind}:${index}`
}

function renderMetaToken(token: HabitRowMetaToken, largeText: boolean, wrapDateStatus: boolean): ReactNode {
  if (typeof token === 'string') return token
  if (token.kind === 'type') return <span data-habit-row-type="">{token.label}</span>
  if (token.kind === 'checklist') return <span data-habit-row-checklist="" className="inline-flex shrink-0 items-center gap-[4px] whitespace-nowrap">
    <ListChecks size={largeText ? 24 : 16} strokeWidth={1.5} aria-hidden="true" focusable="false" />
    <span>{`${token.done}/${token.total}`}</span>
  </span>
  const color = token.kind === 'overdue'
    ? 'var(--status-overdue-text)'
    : token.kind === 'bad'
      ? 'var(--status-bad-text)'
      : undefined
  return <span data-habit-row-meta-state={token.kind}
    className={wrapDateStatus && token.kind === 'date-status' ? 'min-w-0 [overflow-wrap:anywhere]' : undefined}
    style={color ? { color, fontWeight: 500 } : {}}>{token.label}</span>
}
