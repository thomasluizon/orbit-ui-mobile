import { cloneElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'

export function PersonalTextAction({ control, label, className = '', contentClassName = '', contentStyle, contentId }: Readonly<{
  control: ReactElement<{ children?: ReactNode; className?: string; 'aria-label'?: string; 'aria-labelledby'?: string }>
  label: string
  className?: string
  contentClassName?: string
  contentStyle?: CSSProperties
  contentId?: string
}>) {
  return <span data-personal-text-action="" className={`group block relative min-w-0 hover:has-[>:is(button,a):not(:disabled)]:[--orbit-list-row-secondary:var(--fg-2)] hover:has-[>:is(button,a):not(:disabled)]:[--fg-3:var(--fg-2)] has-[>:is(button,a):not(:disabled):active]:[--fg-3:var(--fg-2)] ${className}`}>
    {cloneElement(control, { 'aria-label': label, className: `${control.props.className ?? ''} absolute inset-0`, children: null })}
    <span id={contentId} data-personal-text-content="" className={`block pointer-events-none [&_:is(button,a,input,select,textarea,[tabindex])]:pointer-events-auto relative min-w-0 ${contentClassName}`} style={contentStyle}>{control.props.children}</span>
  </span>
}
