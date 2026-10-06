'use client'

import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useId, useState, type MouseEventHandler, type ReactNode } from 'react'
import Link from 'next/link'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronDown, ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'

type WebListRowProps = Omit<ListRowProps, 'onClick'> & {
  onClick?: MouseEventHandler<HTMLElement>
  titleTranslate?: 'no'
}

function getBodyPadding(compact: boolean, hasTrailing: boolean) {
  return compact && hasTrailing ? 0 : 4
}

function getBodyStyle(compact: boolean, hasAction: boolean, inset: boolean, hasDescription: boolean, compactForm: boolean, hasTrailing: boolean) {
  const paddingBlock = getBodyPadding(compact, hasTrailing)
  if (!inset) return { minHeight: 'var(--row-h-compact)', paddingBlock, paddingInlineStart: 0, paddingInlineEnd: 0 }
  return compact
    ? { minHeight: 'var(--row-h-compact)', paddingBlock, paddingInline: compactForm ? 12 : 16, paddingInlineEnd: hasAction ? 0 : compactForm ? 12 : 16 }
    : { minHeight: hasDescription ? 76 : 56, paddingBlock: hasDescription ? 16 : 4, paddingInline: 16, paddingInlineEnd: hasAction ? 0 : 16 }
}

function getActionStyle(compact: boolean, inset: boolean, compactForm: boolean, hasDescription: boolean) {
  return { marginBlock: !compact && inset && hasDescription ? 16 : 4, marginInlineEnd: inset ? compactForm ? 12 : 16 : 0, marginInlineStart: 0, alignSelf: 'center' as const }
}

function descriptionClass(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle']) {
  return wrapTitle ? 'break-words' : undefined
}

function titleLineHeight(textMode: WebListRowProps['textMode'], wrapTitle: WebListRowProps['wrapTitle']) {
  return textMode === 'label' || wrapTitle ? 1.4 : 1.25
}

function textBlockStyle(textMode: WebListRowProps['textMode'], wrapValue: WebListRowProps['wrapValue'], wrapTitle: WebListRowProps['wrapTitle'], compact: boolean, hasTrailing: boolean) {
  return { gap: 4, ...(compact && hasTrailing ? { paddingBlock: 4 } : {}), ...(wrapTitle && hasTrailing ? { minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' } : {}), ...(wrapValue ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%' } : textMode === 'label' ? { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%', minHeight: 24, justifyContent: 'center' } : {}) }
}

function personalTextProps(textMode: WebListRowProps['textMode'], expanded: boolean | undefined) {
  return textMode === 'personal' ? { expanded } : {}
}

function titleClass(textMode: WebListRowProps['textMode'], wrapTitle: boolean | undefined) {
  if (textMode === 'personal') return ''
  return textMode === 'label' || wrapTitle ? 'break-words' : 'truncate'
}

function RowText({ title, textMode, titleTranslate, wrapTitle, description, wrapValue, danger, trailing, compact = !description, value, readOnly, personalExpanded }: Readonly<Pick<WebListRowProps, 'title' | 'textMode' | 'titleTranslate' | 'wrapTitle' | 'description' | 'wrapValue' | 'danger' | 'trailing' | 'compact' | 'value' | 'readOnly' | 'personalExpanded'>>) {
  const Title = textMode === 'personal' ? PersonalText : 'span'
  const Description = textMode === 'personal' ? PersonalText : 'span'
  const titleColor = danger ? 'var(--status-bad-text)' : 'var(--fg-1)'
  return <span className="flex min-w-0 flex-1 flex-col" style={{ color: titleColor, ...textBlockStyle(textMode, wrapValue, wrapTitle, compact, !!trailing), ...(readOnly && textMode === 'label' && trailing && !value ? { flexBasis: 0, flexShrink: 1 } : {}) }}>
    <Title {...personalTextProps(textMode, personalExpanded)} data-slot="list-row-title" translate={titleTranslate} className={titleClass(textMode, wrapTitle)} style={{ fontFamily: 'var(--font-sans)', fontSize: textMode === 'personal' ? '1.0625rem' : 17, fontWeight: 400, lineHeight: titleLineHeight(textMode, wrapTitle) }}>{title}</Title>
    {description ? <Description {...personalTextProps(textMode, personalExpanded)} data-slot="list-row-description" className={descriptionClass(textMode, wrapTitle)} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', fontFamily: 'var(--font-sans)', fontSize: textMode === 'personal' ? '0.75rem' : 14, lineHeight: 1.4 }}>{description}</Description> : null}
  </span>
}

function RowValue({ value, textMode, wrapValue, valueTextMode, personalExpanded }: Readonly<Pick<WebListRowProps, 'value' | 'textMode' | 'wrapValue' | 'valueTextMode' | 'personalExpanded'>>) {
  if (!value) return null
  if (valueTextMode === 'personal') return <PersonalText expanded={personalExpanded} data-slot="list-row-value" className="t-meta min-w-0" style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', lineHeight: 1.4 }}>{value}</PersonalText>
  return <span data-slot="list-row-value" className={`t-meta shrink-0 ${textMode === 'label' ? 'max-w-full break-words' : wrapValue ? 'max-w-full break-words' : 'max-w-[50%] truncate'}`} style={{ color: 'var(--orbit-list-row-secondary, var(--fg-3))', lineHeight: 1.4 }}>{value}</span>
}

function getContentStyle(textMode: WebListRowProps['textMode'], hasWrappedControl: boolean) {
  return textMode === 'label' || hasWrappedControl
    ? { minHeight: 24, gap: 12, alignItems: 'flex-start' }
    : { minHeight: 24, gap: 12 }
}

function RowBody(props: Readonly<WebListRowProps>) {
  const { textMode, icon, danger, trailing } = props
  const rowColors = { iconColor: danger ? 'var(--status-bad)' : 'var(--fg-1)' }
  const rowValue = <RowValue {...props} />
  const rowTrailing = trailing ? <span className="flex shrink-0 items-center px-2">{trailing}</span> : null
  return (
    <>
      {icon ? (
        <span aria-hidden="true" style={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0, color: rowColors.iconColor }}>
          {typeof icon === 'string' ? <Icon name={icon} size={24} color={rowColors.iconColor} /> : icon}
        </span>
      ) : null}
      <RowTextAndValue {...props} rowValue={rowValue} rowTrailing={rowTrailing} />
      {textMode !== 'label' ? rowTrailing : null}
    </>
  )
}

function RowTextAndValue(props: Readonly<WebListRowProps & { rowValue: ReactNode; rowTrailing: ReactNode }>) {
  const { textMode, wrapValue, trailing, rowValue, rowTrailing } = props
  return <>{textMode === 'personal' ? <span className="flex min-w-0 flex-1 flex-col gap-1"><RowText {...props} />{rowValue}</span> : wrapValue || textMode === 'label' ? <span className={`flex min-w-0 flex-1 items-center ${props.readOnly && textMode === 'label' && trailing && !props.value ? '' : 'flex-wrap'}`} style={{ gap: 12, ...(textMode === 'label' ? { alignItems: 'flex-start' } : {}) }}>{<RowText {...props} />}{rowValue}{textMode === 'label' ? rowTrailing : null}</span> : <>{<RowText {...props} />}{rowValue}</>}</>
}

function ownsPersonalDisclosure(original: Readonly<WebListRowProps>) {
  return (original.textMode === 'personal' || original.valueTextMode === 'personal') && !original.href && !original.onClick && !original.readOnly
}

function useRowDisclosure(original: Readonly<WebListRowProps>) {
  const [disclosed, setDisclosed] = useState(false)
  const contentId = useId()
  const ownsDisclosure = ownsPersonalDisclosure(original)
  const props = ownsDisclosure ? { ...original, accessibilityLabel: original.accessibilityLabel ?? [original.title, original.description, original.value].filter(Boolean).join(', '), expanded: disclosed, personalExpanded: disclosed, controls: contentId, chevron: true, onClick: () => setDisclosed(!disclosed) } : original
  const Chevron = ownsDisclosure ? ChevronDown : ChevronRight
  return { props, Chevron, contentId }
}

function rowControl(props: WebListRowProps, children: ReactNode, bodyStyle: ReturnType<typeof getBodyStyle>) {
  const { readOnly, href, onClick, disabled, accessibilityLabel, expanded, controls } = props
  return (readOnly || (!href && !onClick) ? (
        <div className="flex min-w-0 flex-1 items-center" style={bodyStyle}>{children}</div>
      ) : href && !disabled ? (
        <Link href={href} aria-label={accessibilityLabel} aria-expanded={expanded} aria-controls={controls} onClick={onClick} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] text-left no-underline" style={bodyStyle}>{children}</Link>
      ) : (
        <button type="button" aria-label={accessibilityLabel} aria-expanded={expanded} aria-controls={controls} onClick={onClick} disabled={disabled} className="orbit-list-row-body flex min-w-0 flex-1 cursor-pointer items-center rounded-[12px] border-0 bg-transparent text-left disabled:cursor-default disabled:opacity-50" style={bodyStyle}>{children}</button>
      ))
}

export function ListRow(original: Readonly<WebListRowProps>) {
  const { props, Chevron, contentId } = useRowDisclosure(original)
  const { accessibilityLabel, action, chevron = true, compact = !props.description, inset = true, href, inForm = false, onClick, readOnly = false } = props
  const body: ReactNode = <RowBody {...props} />
  const content = <span id={contentId} className="flex min-w-0 flex-1 items-center" style={getContentStyle(props.textMode, !!props.wrapTitle && !!props.trailing)}>{body}{!readOnly && chevron ? <span className="flex shrink-0 items-center justify-center" style={props.textMode ? { width: 24, minHeight: 24 } : { width: TOUCH_TARGET_MIN, height: 24 }}><Chevron aria-hidden="true" focusable="false" size={24} color="var(--fg-3)" strokeWidth={1.8} /></span> : null}</span>
  const compactForm = inForm && props.compact === true
  const bodyStyle = getBodyStyle(compact, !!action, inset, !!props.description, compactForm, !!props.trailing)

  const actionBody = rowControl(props, content, bodyStyle)

  return (
    <div className={`orbit-list-row-shell flex items-stretch ${inForm ? 'orbit-list-row-form' : ''}`} style={{ minHeight: 52 }}>
      {(props.textMode === 'personal' || props.valueTextMode === 'personal') && props.personalExpanded !== undefined && !readOnly && (href || onClick) ? <PersonalTextAction className="flex-1" label={accessibilityLabel ?? [props.title, props.description, props.value].filter(Boolean).join(', ')} contentClassName="flex min-w-0 flex-1 items-center" contentStyle={{ ...bodyStyle, opacity: props.disabled ? 0.5 : undefined }} control={actionBody} /> : actionBody}
      {action ? (
        <button type="button" aria-label={action.label} onClick={action.onPress} className="orbit-list-row-action flex size-[var(--touch-min)] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent active:scale-[0.96]" style={getActionStyle(compact, inset, compactForm, !!props.description)}>
          <span className="flex shrink-0 items-center justify-center" style={{ width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN }}>
            <Icon name={action.icon} size={20} color={action.danger ? 'var(--status-bad)' : 'var(--fg-2)'} />
          </span>
        </button>
      ) : null}
    </div>
  )
}
