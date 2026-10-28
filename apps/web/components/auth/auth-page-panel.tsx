import type { ReactNode } from 'react'

export const AUTH_PAGE_PANEL_STYLES = `
.orbit-auth-panel { display:flex; width:100%; min-width:0; flex-direction:column; gap:32px; padding:16px 8px; }
@media (min-width:336px) { .orbit-auth-panel { padding-inline:16px; } }
@media (min-width:768px) { .orbit-auth-panel { max-width:420px; border-radius:var(--r-card); background:var(--bg-card); padding:32px; box-shadow:inset 0 0 0 1px var(--hairline-ghost); } }
`

export function AuthPagePanel({ children }: Readonly<{ children: ReactNode }>) {
  return <>
    <style>{AUTH_PAGE_PANEL_STYLES}</style>
    <div data-field-surface="responsive-card" className="orbit-auth-panel">{children}</div>
  </>
}
