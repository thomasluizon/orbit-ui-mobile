'use client'

import { Fragment, useEffect, useRef, useState, type ComponentProps } from 'react'

type PersonalTextProps = Omit<ComponentProps<'span'>, 'children'> & {
  children: string
  expanded?: boolean
}

function ScrollableToken({ children, accessibleName, className = '', ...props }: Readonly<Omit<PersonalTextProps, 'expanded'> & { accessibleName: string }>) {
  const elementRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const element = elementRef.current!
    const observer = new ResizeObserver(() => setOverflowing(element.scrollWidth > element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [children])
  return <span {...props} ref={elementRef} tabIndex={overflowing ? 0 : undefined} role={overflowing ? 'region' : undefined} aria-label={accessibleName} className={`overflow-x-auto ${overflowing ? 'pointer-events-auto' : ''} ${className}`}><span>{children}</span></span>
}

export function PersonalText({ children, expanded = false, className = '', style, ...props }: Readonly<PersonalTextProps>) {
  const parts = children.split(/(\s+)/u)
  const singleToken = parts.filter((part) => part.trim()).length <= 1
  const textStyle = { ...style, whiteSpace: singleToken ? 'nowrap' : 'normal', overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none' } as const
  if (expanded && singleToken) return <span className={`block min-w-0 max-w-full p-1 ${className}`} style={{ ...textStyle, lineHeight: 1.4 }}>
    <ScrollableToken {...props} data-personal-text="" data-personal-text-expanded="" accessibleName={children} className="block min-w-0 max-w-full">{children}</ScrollableToken>
  </span>
  return <span aria-label={children} {...props} data-personal-text="" data-personal-text-expanded={expanded ? '' : undefined} className={`${expanded ? 'block p-1' : singleToken ? 'block truncate' : 'line-clamp-2'} min-w-0 max-w-full ${className}`} style={{ ...textStyle, ...(expanded ? { lineHeight: 'calc(1.4em + 8px)' } : {}) }}>
    {singleToken ? children : parts.map((part, index) => /^\s+$/u.test(part)
      ? <Fragment key={index}>{part}</Fragment>
      : expanded ? <ScrollableToken key={index} accessibleName={children} className="inline-block max-w-full align-bottom whitespace-nowrap" style={{ lineHeight: 1.4 }}>{part}</ScrollableToken>
      : <span key={index} className="inline-block max-w-full align-bottom whitespace-nowrap overflow-hidden text-ellipsis">{part}</span>)}
  </span>
}
