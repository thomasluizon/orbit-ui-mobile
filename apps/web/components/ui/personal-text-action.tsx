'use client'

import { cloneElement, useCallback, type CSSProperties, type ReactElement, type ReactNode } from 'react'

function hideVisualCopies(content: HTMLElement, name: string) {
  const hidden = new Set<Element>()
  const protectedContent = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"], [role]:not([role="none"]):not([role="presentation"]), img[alt]:not([alt=""])'
  const normalizedName = name.replace(/\s+/gu, ' ').trim()
  const hideStaticContent = (element: Element) => {
    if (element.getAttribute('aria-hidden') === 'true') return
    if (element.matches(protectedContent) && element.getAttribute('role') !== 'region') return
    const text = element.textContent.replace(/\s+/gu, ' ').trim()
    if (text && normalizedName.includes(text) && !element.matches(protectedContent) && !element.querySelector(protectedContent)) {
      element.setAttribute('aria-hidden', 'true')
      element.setAttribute('data-personal-text-visual-copy', '')
      hidden.add(element)
      return
    }
    for (const child of element.children) hideStaticContent(child)
  }
  const restore = () => {
    for (const element of hidden) {
      element.removeAttribute('aria-hidden')
      element.removeAttribute('data-personal-text-visual-copy')
    }
    hidden.clear()
  }
  const update = () => {
    restore()
    hideStaticContent(content)
  }
  update()
  const observer = new MutationObserver(update)
  observer.observe(content, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['tabindex', 'role', 'aria-label', 'aria-labelledby', 'alt', 'href', 'contenteditable'] })
  return () => { observer.disconnect(); restore() }
}

export function usePersonalTextContentRef(name: string) {
  return useCallback((element: HTMLElement | null) => element ? hideVisualCopies(element, name) : undefined, [name])
}

export function PersonalTextAction({ control, label, className = '', contentClassName = '', contentStyle, contentId }: Readonly<{
  control: ReactElement<{ children?: ReactNode; className?: string; 'aria-label'?: string; 'aria-labelledby'?: string }>
  label: string
  className?: string
  contentClassName?: string
  contentStyle?: CSSProperties
  contentId?: string
}>) {
  const contentRef = usePersonalTextContentRef(label)
  return <span data-personal-text-action="" className={`group block relative min-w-0 hover:has-[>:is(button,a):not(:disabled)]:[--orbit-list-row-secondary:var(--fg-2)] hover:has-[>:is(button,a):not(:disabled)]:[--fg-3:var(--fg-2)] has-[>:is(button,a):not(:disabled):active]:[--fg-3:var(--fg-2)] ${className}`}>
    {cloneElement(control, { 'aria-label': label, className: `${control.props.className ?? ''} absolute inset-0`, children: null })}
    <span ref={contentRef} id={contentId} data-personal-text-content="" className={`block pointer-events-none [&_:is(button,a,input,select,textarea,[tabindex])]:pointer-events-auto relative min-w-0 ${contentClassName}`} style={contentStyle}>{control.props.children}</span>
  </span>
}
