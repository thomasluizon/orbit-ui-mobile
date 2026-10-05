import { Fragment, type ComponentProps } from 'react'

type PersonalTextProps = Omit<ComponentProps<'span'>, 'children'> & {
  children: string
  expanded?: boolean
}

export function PersonalText({ children, expanded = false, className = '', style, ...props }: Readonly<PersonalTextProps>) {
  const parts = children.split(/(\s+)/u)
  const singleToken = parts.filter((part) => part.trim()).length <= 1
  return <span aria-label={children} {...props} data-personal-text="" className={`${expanded ? 'block overflow-x-auto' : singleToken ? 'block truncate' : 'line-clamp-2'} min-w-0 max-w-full ${className}`} style={{ ...style, overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none' }}>
    {singleToken ? children : parts.map((part, index) => /^\s+$/u.test(part)
      ? <Fragment key={index}>{part}</Fragment>
      : <span key={index} className={`inline-block max-w-full align-bottom whitespace-nowrap ${expanded ? 'overflow-x-auto' : 'overflow-hidden text-ellipsis'}`}>{part}</span>)}
  </span>
}
