import { actionClasses, actionStyle } from './pill-action-style'

export function PillAnchor({ href, children }: Readonly<{ href: string; children: string }>) {
  return <a href={href} referrerPolicy="no-referrer" data-variant="primary" data-size="sm"
    className={actionClasses('primary', 'sm', 'link')} style={actionStyle('sm')}>
    <span>{children}</span>
  </a>
}
