'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useId, useRef, useState, type ComponentProps, type MouseEventHandler, type ReactNode } from 'react'
import Link from 'next/link'
import { PersonalText, useReadableLineHeight } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronDown, ChevronRight } from '@/components/ui/icons'
import { SwitchTrack } from '@/components/ui/switch'
import { Icon } from '@/components/ui/icon'

type WebListRowProps = Omit<ListRowProps, 'onClick'> & {
  onClick?: MouseEventHandler<HTMLElement>
  titleTranslate?: 'no'
  personalTextInsetStart?: boolean
}

function hasSupportingLine({ description, textMode, value }: Readonly<Pick<WebListRowProps, 'description' | 'textMode' | 'value'>>) {
  return !!description || (textMode === 'personal' && !!value)
}

function alignsFirstLine({ textMode, description, value, toggle, trailing, readOnly }: Readonly<Pick<WebListRowProps, 'textMode' | 'description' | 'value' | 'toggle' | 'trailing' | 'readOnly'>>) {
  return !!toggle || (textMode === 'label' && !!(description || value || (trailing && !readOnly)))
}

function getBodyStyle(hasDescription: boolean, column: boolean) {
  return { minHeight: hasDescription ? 'var(--row-h)' : 'var(--row-h-compact)', paddingBlock: 12, ...(column ? { position: 'relative' as const } : { paddingInline: 16 }) }
}

function getActionStyle(hasDescription: boolean) {
  return { marginBlock: hasDescription ? 8 : 4, marginInlineEnd: 16, marginInlineStart: 0, alignSelf: 'center' as const }
}

function descriptionClass(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle']) {
  return wrapTitle ? 'break-words' : undefined
}

function titleLineHeight(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle'], description: WebListRowProps['description']) {
  if (textMode === 'label') return 1.4
  if (description) return 1.25
  return wrapTitle ? 1.4 : 1.25
}

function textBlockStyle(textMode: WebListRowProps['textMode'], wrapValue: WebListRowProps['wrapValue'], inlineControl: boolean, switchRow: boolean) {
  return { gap: 4, ...(wrapValue ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%' } : textMode === 'label' ? { flexBasis: inlineControl ? 0 : 'var(--orbit-list-row-text-basis, auto)', flexShrink: inlineControl ? 1 : 'var(--orbit-list-row-text-shrink, 0)', maxWidth: '100%', minHeight: switchRow ? 28 : 24, justifyContent: 'center' } : {}) }
}

function personalTextProps(textMode: WebListRowProps['textMode'], expanded: boolean | undefined) {
  return textMode === 'personal' ? { expanded } : {}
}

function titleClass(textMode: WebListRowProps['textMode'], wrapTitle: boolean | undefined) {
  if (textMode === 'personal') return ''
  return textMode === 'label' || wrapTitle ? 'break-words' : 'truncate'
}

function PlainRowText({ children, style, ...props }: Readonly<Omit<ComponentProps<'span'>, 'children'> & { children: string }>) {
  const textRef = useRef<HTMLSpanElement>(null)
  const lineHeight = useReadableLineHeight(textRef, children, style)
  return <span {...props} data-row-multiline={typeof lineHeight === 'string' ? '' : undefined} ref={textRef} style={{ ...style, lineHeight }}>{children}</span>
}

function RowText({ title, textMode, titleTranslate, wrapTitle, description, wrapValue, danger, trailing, value, readOnly, toggle, personalExpanded, personalTextInsetStart }: Readonly<Pick<WebListRowProps, 'title' | 'textMode' | 'titleTranslate' | 'wrapTitle' | 'description' | 'wrapValue' | 'danger' | 'trailing' | 'compact' | 'value' | 'readOnly' | 'toggle' | 'personalExpanded' | 'personalTextInsetStart'>>) {
  const Title = textMode === 'personal' ? PersonalText : PlainRowText
  const Description = textMode === 'personal' ? PersonalText : PlainRowText
  const titleColor = danger ? 'var(--status-bad-text)' : 'var(--fg-1)'
  const titleLine = <Title {...personalTextProps(textMode, personalExpanded)} data-slot="list-row-title" translate={titleTranslate} className={titleClass(textMode, wrapTitle)} style={{ fontFamily: 'var(--font-sans)', fontSize: '1.0625rem', fontWeight: 400, lineHeight: titleLineHeight(textMode, wrapTitle || (textMode === 'personal' && !!value), description), paddingInlineStart: personalTextInsetStart === false ? 0 : undefined }}>{title}</Title>
  return <span className="flex min-w-0 flex-1 flex-col" style={{ color: titleColor, ...textBlockStyle(textMode, wrapValue, !!toggle || (readOnly === true && !!trailing && !value), !!toggle) }}>
    {toggle ? <span className="flex items-center" style={{ minHeight: 'max(28px, 1.4875rem)' }}>{titleLine}</span> : titleLine}
    {description ? <Description {...personalTextProps(textMode, personalExpanded)} data-slot="list-row-description" className={descriptionClass(textMode, wrapTitle)} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', fontFamily: 'var(--font-sans)', fontSize: '0.875rem', lineHeight: textMode === 'label' ? 1.4 : 1.25, paddingInlineStart: personalTextInsetStart === false ? 0 : undefined }}>{description}</Description> : null}
  </span>
}

function RowValue({ value, textMode, wrapValue, valueTextMode, personalExpanded }: Readonly<Pick<WebListRowProps, 'value' | 'textMode' | 'wrapValue' | 'valueTextMode' | 'personalExpanded'>>) {
  if (!value) return null
  if (valueTextMode === 'personal') return <PersonalText expanded={personalExpanded} data-slot="list-row-value" className="t-meta min-w-0" style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', lineHeight: 1.4 }}>{value}</PersonalText>
  const text = <span data-slot="list-row-value" className={`t-meta shrink-0 ${textMode === 'label' ? 'min-w-0 max-w-full break-words' : wrapValue ? 'max-w-full break-words' : 'max-w-[50%] truncate'}`} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', lineHeight: 1.4 }}>{value}</span>
  return textMode === 'label' ? <span className="orbit-list-row-value-line flex min-w-0 max-w-full items-center">{text}</span> : text
}

function getContentStyle(textMode: WebListRowProps['textMode'], hasWrappedControl: boolean, firstLine: boolean) {
  return firstLine || (textMode !== 'label' && hasWrappedControl)
    ? { minHeight: 24, gap: 12, alignItems: 'flex-start' }
    : { minHeight: 24, gap: 12 }
}

function iconLineHeight(props: WebListRowProps) {
  if (props.toggle) return 'max(28px, 1.4875rem)'
  return props.textMode === 'label' ? 'max(24px, 1.4875rem)' : undefined
}

function RowBody(props: Readonly<WebListRowProps>) {
  const { textMode, icon, danger } = props
  const trailing = props.toggle ? <SwitchTrack checked={props.toggle.checked} pending={props.toggle.pending} /> : props.trailing
  const rowColors = { iconColor: danger ? 'var(--status-bad)' : 'var(--fg-1)' }
  const rowValue = <RowValue {...props} />
  const rowTrailing = trailing ? <span data-slot="list-row-trailing" className="flex shrink-0 items-center" style={textMode === 'label' ? { minHeight: props.toggle ? 'max(28px, 1.4875rem)' : '1.4875rem' } : undefined}>{trailing}</span> : null
  return (
    <>
      {icon ? (
        <span data-slot="list-row-icon" aria-hidden="true" style={{ width: 28, minHeight: iconLineHeight(props), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: rowColors.iconColor }}>
          {typeof icon === 'string' ? <Icon name={icon} size={24} color={rowColors.iconColor} /> : icon}
        </span>
      ) : null}
      <RowTextAndValue {...props} trailing={trailing} rowValue={rowValue} rowTrailing={rowTrailing} />
      {textMode !== 'label' ? rowTrailing : null}
    </>
  )
}

function labelContentStyle(props: WebListRowProps) {
  return alignsFirstLine(props) ? { alignItems: 'flex-start' } : {}
}

function RowTextAndValue(props: Readonly<WebListRowProps & { rowValue: ReactNode; rowTrailing: ReactNode }>) {
  const { textMode, wrapValue, trailing, rowValue, rowTrailing } = props
  if (textMode === 'personal') return <span className="flex min-w-0 flex-1 flex-col gap-1"><RowText {...props} />{rowValue}</span>
  if (!wrapValue && textMode !== 'label') return <><RowText {...props} />{rowValue}</>
  const keepsControlInline = (props.toggle || props.readOnly) && textMode === 'label' && trailing && !props.value
  return <span className={`orbit-list-row-label-content flex min-w-0 flex-1 items-center ${keepsControlInline ? '' : 'flex-wrap'}`} style={{ gap: 12, ...labelContentStyle(props) }}><RowText {...props} />{rowValue}{textMode === 'label' ? rowTrailing : null}</span>
}

function ownsPersonalDisclosure(original: Readonly<WebListRowProps>) {
  return (original.textMode === 'personal' || original.valueTextMode === 'personal') && !original.href && !original.onClick && !original.readOnly
}

function useRowDisclosure(original: Readonly<WebListRowProps>) {
  const [disclosed, setDisclosed] = useState(false)
  const contentId = useId()
  const ownsDisclosure = ownsPersonalDisclosure(original)
  const props = ownsDisclosure ? { ...original, accessibilityLabel: original.accessibilityLabel ?? [original.title, original.description, original.value].filter(Boolean).join(', '), expanded: disclosed, personalExpanded: disclosed, controls: contentId, chevron: original.chevron ?? true, onClick: () => setDisclosed(!disclosed) } : original
  const Chevron = ownsDisclosure ? ChevronDown : ChevronRight
  return { props, Chevron, contentId }
}

function switchAccessibility(props: WebListRowProps) {
  return props.toggle ? { role: 'switch', 'aria-checked': props.toggle.checked, 'aria-busy': props.toggle.pending || undefined, 'aria-label': props.accessibilityLabel ?? props.title } : { 'aria-label': props.accessibilityLabel }
}

function rowControl(props: WebListRowProps, children: ReactNode, bodyStyle: ReturnType<typeof getBodyStyle>) {
  const { readOnly, href, onClick, disabled, accessibilityLabel, expanded, controls, toggle } = props
  const fill = props.placement === 'column' ? <span aria-hidden="true" data-press-fill="" data-slot="list-row-body" className="orbit-list-row-outset" style={{ minHeight: bodyStyle.minHeight, paddingBlock: 12 }} /> : null
  const slot = props.placement === 'column' ? undefined : 'list-row-body'
  const content = <>{fill}{children}</>
  return (readOnly || (!href && !onClick && !toggle) ? (
        <div data-slot={slot} className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{content}</div>
      ) : href && !disabled ? (
        <Link data-slot={slot} href={href} aria-label={accessibilityLabel} aria-expanded={expanded} aria-controls={controls} onClick={onClick} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] text-left no-underline" style={bodyStyle}>{content}</Link>
      ) : (
        <button data-slot={slot} type="button" {...switchAccessibility(props)} aria-expanded={expanded} aria-controls={controls} onClick={toggle ? () => toggle.onChange(!toggle.checked) : onClick} disabled={disabled || toggle?.pending} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] border-0 bg-transparent text-left disabled:cursor-default disabled:opacity-50" style={bodyStyle}>{content}</button>
      ))
}

export function ListRow(original: Readonly<WebListRowProps>) {
  const { props: disclosedProps, Chevron, contentId } = useRowDisclosure(original)
  const props = disclosedProps.toggle ? { ...disclosedProps, textMode: 'label' as const } : disclosedProps
  const { accessibilityLabel, action, chevron = true, href, onClick, readOnly = false } = props
  const body: ReactNode = <RowBody {...props} />
  const content = <span data-slot="list-row-content" id={contentId} className="flex min-w-0 flex-1 items-center" style={getContentStyle(props.textMode, !!props.wrapTitle && !!props.trailing, alignsFirstLine(props))}>{body}{!readOnly && !props.toggle && chevron ? <span data-slot="list-row-chevron" className="flex shrink-0 items-center justify-center" style={{ width: 24, minHeight: props.textMode === 'label' ? 'max(24px, 1.4875rem)' : 24 }}><Chevron aria-hidden="true" focusable="false" size={24} color="var(--fg-3)" strokeWidth={1.5} /></span> : null}</span>
  const bodyStyle = getBodyStyle(hasSupportingLine(props), props.placement === 'column')

  const actionBody = rowControl(props, content, bodyStyle)

  return (
    <div data-text-mode={props.textMode} className={`orbit-list-row-shell flex items-stretch ${props.placement === 'column' ? 'orbit-list-row-column' : ''}`} style={{ minHeight: 52 }}>
      {(props.textMode === 'personal' || props.valueTextMode === 'personal') && props.personalExpanded !== undefined && !readOnly && (href || onClick) ? <PersonalTextAction className="flex-1" label={accessibilityLabel ?? [props.title, props.description, props.value].filter(Boolean).join(', ')} contentClassName="flex min-w-0 flex-1 items-center" contentStyle={{ ...bodyStyle, opacity: props.disabled ? 0.5 : undefined }} control={actionBody} /> : actionBody}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="orbit-list-row-action flex size-[var(--touch-min)] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent active:scale-[0.96]" style={getActionStyle(!!props.description)}>
          <span className="flex shrink-0 items-center justify-center" style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN }}>
            <Icon name={action.icon} size={20} color={action.danger ? 'var(--status-bad)' : 'var(--fg-2)'} />
          </span>
        </button>
      ) : null}
    </div>
  )
}
