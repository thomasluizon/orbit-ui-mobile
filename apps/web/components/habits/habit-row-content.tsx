import { Fragment, type ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

/** Inline meta token rendered between dots in the row's meta strip.
 *  String tokens render in fg-2; tagged tokens get status color. */
export type HabitRowMetaToken =
  | string
  | { kind: 'overdue'; label: string }
  | { kind: 'bad'; label: string }
  | { kind: 'future'; label: string }

interface HabitRowContentProps {
  habit: NormalizedHabit
  titleSize: number
  titleColor: string
  meta: HabitRowMetaToken[]
}

/** Middle column of a habit row: title and the single caller-composed meta line. */
export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  meta,
}: Readonly<HabitRowContentProps>) {
  const visibleMeta = meta.filter((token) => typeof token === 'string' || token.kind !== 'future')
  const futureHint = meta.find((token) => typeof token !== 'string' && token.kind === 'future')
  return (
    <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 4 }}>
      <TitleText title={habit.title} size={titleSize} color={titleColor} />
      {visibleMeta.length > 0 ? <MetaStrip tokens={visibleMeta} /> : null}
      {futureHint && typeof futureHint !== 'string' ? <span className="sr-only">{futureHint.label}</span> : null}
    </div>
  )
}

const TITLE_TEXT_STYLE_BASE = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  lineHeight: 1.25,
  letterSpacing: '-0.005em',
  overflowWrap: 'anywhere',
} as const

interface TitleTextProps {
  title: string
  size: number
  color: string
}

export function TitleText({ title, size, color }: Readonly<TitleTextProps>) {
  return (
    <span
      className="flex-shrink min-w-0 overflow-hidden line-clamp-2"
      style={{
        ...TITLE_TEXT_STYLE_BASE,
        fontSize: size,
        color,
      }}
    >
      {title}
    </span>
  )
}

interface MetaStripProps {
  tokens: HabitRowMetaToken[]
}

export function MetaStrip({ tokens }: Readonly<MetaStripProps>) {
  return (
    <span
      className="min-w-0 overflow-hidden whitespace-nowrap text-ellipsis"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--fg-2)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {tokens.map((token, i) => (
        <Fragment key={metaTokenKey(token, i)}>
          {i > 0 && <span style={{ margin: '0 4px', color: 'var(--fg-2)' }}>·</span>}
          {renderMetaToken(token)}
        </Fragment>
      ))}
    </span>
  )
}

function metaTokenKey(token: HabitRowMetaToken, index: number): string {
  if (typeof token === 'string') return `s:${index}:${token}`
  return `${token.kind}:${index}`
}

function renderMetaToken(token: HabitRowMetaToken): ReactNode {
  if (typeof token === 'string') return token
  const color = token.kind === 'overdue'
    ? 'var(--status-overdue-text)'
    : token.kind === 'bad'
      ? 'var(--status-bad-text)'
      : undefined
  return <span style={color ? { color, fontWeight: 500 } : {}}>{token.label}</span>
}
