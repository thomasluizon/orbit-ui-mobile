'use client'

import { Fragment, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'

type PersonalTextProps = Omit<ComponentProps<'span'>, 'children'> & {
  children: string
  lines?: 1 | 2
  expanded?: boolean
  unclamped?: boolean
}

function ScrollableToken({ children, accessibleName, className = '', ...props }: Readonly<Omit<PersonalTextProps, 'expanded' | 'unclamped'> & { accessibleName: string }>) {
  const [overflowing, setOverflowing] = useState(false)
  const scrollerRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = scrollerRef.current
    if (!element) return
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(element.firstElementChild!)
    return () => observer.disconnect()
  }, [])
  return <span {...props} ref={scrollerRef} tabIndex={overflowing ? 0 : undefined} role={overflowing ? 'region' : undefined} aria-label={accessibleName} className={`overflow-x-auto ${overflowing ? 'pointer-events-auto' : ''} ${className}`}><span className="inline-block">{children}</span></span>
}

export function PersonalText({ children, lines: lineLimit = 2, expanded = false, unclamped = false, className = '', style, ...props }: Readonly<PersonalTextProps>) {
  const parts = children.split(/(\s+)/u)
  const singleToken = parts.filter((part) => part.trim()).length <= 1
  const singleLine = singleToken || lineLimit === 1 && !expanded
  const textStyle = { ...style, whiteSpace: singleLine ? 'nowrap' : 'normal', overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none' } as const
  if (expanded && singleToken) return <span className={`block min-w-0 max-w-full p-1 ${className}`} style={{ ...textStyle, lineHeight: 1.4 }}>
    <ScrollableToken {...props} data-personal-text="" data-personal-text-expanded="" accessibleName={children} className="block min-w-0 max-w-full">{children}</ScrollableToken>
  </span>
  return <span aria-label={children} {...props} data-personal-text="" data-personal-text-unclamped={unclamped ? '' : undefined} data-personal-text-expanded={expanded ? '' : undefined} className={`${expanded ? 'block p-1' : singleLine ? 'block truncate' : unclamped ? 'block' : 'line-clamp-2'} min-w-0 max-w-full ${className}`} style={{ ...textStyle, ...(expanded ? { lineHeight: 'calc(1.4em + 8px)' } : {}) }}>
    {singleLine ? children : parts.map((part, index) => /^\s+$/u.test(part)
      ? <Fragment key={index}>{part}</Fragment>
      : expanded ? <ScrollableToken key={index} accessibleName={children} className="inline-block max-w-full align-bottom whitespace-nowrap" style={{ lineHeight: 1.4 }}>{part}</ScrollableToken>
      : <span key={index} className="inline-block max-w-full align-bottom whitespace-nowrap overflow-hidden text-ellipsis">{part}</span>)}
  </span>
}
