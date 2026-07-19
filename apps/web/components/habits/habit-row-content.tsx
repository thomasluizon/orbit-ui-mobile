import { Fragment, type ReactNode } from 'react'
import { stripInlineMarkdown } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const MAX_VISIBLE_TAGS = 3

/** Inline meta token rendered between dots in the row's meta strip.
 *  String tokens render in fg-3; tagged tokens get status color. */
export type HabitRowMetaToken =
  | string
  | { kind: 'overdue'; label: string }
  | { kind: 'future'; label: string }

interface HabitRowContentProps {
  habit: NormalizedHabit
  titleSize: number
  titleColor: string
  isDone: boolean
  meta: HabitRowMetaToken[]
  showStreak: boolean
  streak?: number
}

/** Middle column of a habit row: title, description, inline meta + streak, and tags. */
export function HabitRowContent({
  habit,
  titleSize,
  titleColor,
  isDone,
  meta,
  showStreak,
  streak,
}: Readonly<HabitRowContentProps>) {
  return (
    <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
      <TitleText title={habit.title} size={titleSize} color={titleColor} strikethrough={isDone} />
      {habit.description?.trim() && (
        <span
          className="overflow-hidden whitespace-nowrap text-ellipsis"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--fg-3)',
            lineHeight: 1.3,
          }}
        >
          {stripInlineMarkdown(habit.description)}
        </span>
      )}
      {(meta.length > 0 || showStreak) && (
        <span className="flex items-center" style={{ gap: 8 }}>
          {meta.length > 0 && <MetaStrip tokens={meta} />}
          {showStreak && (
            <span
              className="shrink-0"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--status-overdue-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              🔥 {streak}
            </span>
          )}
        </span>
      )}
      {habit.tags.length > 0 && (
        <span className="flex items-center overflow-hidden" style={{ gap: 8, marginTop: 1 }}>
          {habit.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center shrink-0 min-w-0"
              style={{ gap: 4, maxWidth: 132 }}
            >
              <span
                aria-hidden="true"
                className="rounded-full shrink-0"
                style={{ width: 6, height: 6, background: tag.color }}
              />
              <span
                className="truncate"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--fg-3)',
                  lineHeight: 1.2,
                }}
              >
                {tag.name}
              </span>
            </span>
          ))}
          {habit.tags.length > MAX_VISIBLE_TAGS && (
            <span
              className="shrink-0"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              +{habit.tags.length - MAX_VISIBLE_TAGS}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

const TITLE_TEXT_STYLE_BASE = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  textDecorationStyle: 'solid',
  textDecorationColor: 'var(--fg-4)',
  textDecorationThickness: 1,
  lineHeight: 1.25,
  letterSpacing: '-0.005em',
  overflowWrap: 'anywhere',
} as const

interface TitleTextProps {
  title: string
  size: number
  color: string
  strikethrough: boolean
}

export function TitleText({ title, size, color, strikethrough }: Readonly<TitleTextProps>) {
  return (
    <span
      className="flex-shrink min-w-0 overflow-hidden line-clamp-2"
      style={{
        ...TITLE_TEXT_STYLE_BASE,
        fontSize: size,
        color,
        textDecorationLine: strikethrough ? 'line-through' : 'none',
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
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        color: 'var(--fg-3)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {tokens.map((token, i) => (
        <Fragment key={metaTokenKey(token, i)}>
          {i > 0 && <span style={{ margin: '0 6px', color: 'var(--fg-3)' }}>·</span>}
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
  const color = token.kind === 'overdue' ? 'var(--status-overdue-text)' : undefined
  return <span style={color ? { color, fontWeight: 500 } : {}}>{token.label}</span>
}
