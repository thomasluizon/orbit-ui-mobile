'use client'

import type { InputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useId, useRef, type ChangeEvent } from 'react'

const CONTROL_STYLE = { width: '100%', appearance: 'none', border: 0, background: 'transparent', outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: '24px', color: 'var(--fg-1)', padding: '15px 16px' } as const

function getDescriptionId(error: string | undefined, hint: string | undefined, errorId: string, hintId: string) {
  if (error && hint) return `${errorId} ${hintId}`
  if (error) return errorId
  return hint ? hintId : undefined
}

function Marks({ value, marks, label }: Readonly<{ value: string; marks: readonly { start: number; end: number }[] | undefined; label: string | undefined }>) {
  if (!marks?.length) return null
  return <div aria-label={label} role="list" className="flex flex-wrap gap-1 border-t border-[var(--hairline)] px-4 py-2 text-xs text-[var(--fg-3)]">{marks.map((mark) => <mark role="listitem" key={`${mark.start}-${mark.end}`} className="rounded-[8px] bg-[var(--bg-well)] px-2 py-1 text-[var(--fg-2)]">{value.slice(mark.start, mark.end)}</mark>)}</div>
}

function Captions({ error, errorId, hint, hintId }: Readonly<{ error?: string; errorId: string; hint?: string; hintId: string }>) {
  return <>{error ? <span id={errorId} role="alert" className="text-xs text-[var(--status-bad-text)]">{error}</span> : null}{hint ? <span id={hintId} className="text-xs text-[var(--fg-2)]">{hint}</span> : null}</>
}

function Control({ props, controlId, descriptionId }: Readonly<{ props: InputProps; controlId: string; descriptionId: string | undefined }>) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const multiline = props.multiline === true
  const marks = multiline && 'marks' in props ? props.marks : undefined
  const marksLabel = multiline && 'marksLabel' in props ? props.marksLabel : undefined
  useEffect(() => { if (props.focusRequest) inputRef.current?.focus() }, [props.focusRequest])
  const shared = {
    id: controlId,
    name: props.name,
    value: props.value,
    placeholder: props.placeholder,
    disabled: props.disabled,
    maxLength: props.maxLength,
    inputMode: props.inputMode,
    autoComplete: props.autoComplete,
    spellCheck: props.kind === 'email' ? false : undefined,
    autoFocus: props.autoFocus,
    'aria-invalid': props.error ? true : undefined,
    'aria-describedby': descriptionId,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.onChange(event.target.value),
    onBlur: props.onBlur,
    className: 'block resize-none placeholder:text-[var(--fg-3)]',
  } as const
  if (multiline) return <><textarea {...shared} ref={(control) => { inputRef.current = control }} rows={props.rows} style={{ ...CONTROL_STYLE, minHeight: 54, fontFamily: props.mono ? 'var(--font-mono)' : 'var(--font-sans)' }} /><Marks value={props.value} marks={marks} label={marksLabel} /></>
  return <div className="flex items-center"><input {...shared} ref={(control) => { inputRef.current = control }} type={props.kind ?? 'text'} onKeyDown={(event) => { if (event.key === 'Enter') props.onSubmit?.() }} style={{ ...CONTROL_STYLE, minHeight: 54, fontFamily: props.mono ? 'var(--font-mono)' : 'var(--font-sans)' }} />{props.trailing ? <span className="shrink-0 pr-4">{props.trailing}</span> : null}</div>
}

export function Input(props: Readonly<InputProps>) {
  const controlId = useId()
  const errorId = useId()
  const hintId = useId()
  const descriptionId = getDescriptionId(props.error, props.hint, errorId, hintId)
  const controlClass = `overflow-hidden rounded-[12px] bg-[var(--bg-field)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--primary)] forced-colors:border forced-colors:border-[CanvasText] forced-colors:focus-within:outline-[Highlight] ${props.error ? 'shadow-[inset_0_0_0_2px_var(--status-bad)]' : 'shadow-[inset_0_0_0_1px_var(--border-control)]'} ${props.disabled ? 'opacity-60' : ''}`
  return <div className="flex w-full flex-col gap-2" data-multiline={props.multiline ? '' : undefined} data-error={props.error ? '' : undefined}><label htmlFor={controlId} className="text-sm font-medium text-[var(--fg-2)]">{props.label}</label><div className={controlClass} style={{ minHeight: 54 }}><Control props={props} controlId={controlId} descriptionId={descriptionId} /></div><Captions error={props.error} errorId={errorId} hint={props.hint} hintId={hintId} /></div>
}
