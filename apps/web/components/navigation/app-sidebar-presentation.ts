import type { CSSProperties } from 'react'

export interface SidebarSectionRowPresentationInput {
  collapsed: boolean
  parentActive: boolean
}

export interface SidebarSectionRowPresentation {
  className: string
  style: CSSProperties
  iconStrokeWidth: number
  iconColor: string
}

const SECTION_BUTTON_BASE_CLASS =
  'relative flex items-center rounded-[12px] transition-[background-color,color] duration-[160ms] ease-[var(--ease-standard)] '

/**
 * Resolves the parent section button's className, inline style, and icon
 * appearance for the desktop sidebar row. Pure — encodes the collapsed (icon
 * rail) and active (primary-tinted pill) presentation branches.
 */
export function resolveSidebarSectionRowPresentation({
  collapsed,
  parentActive,
}: SidebarSectionRowPresentationInput): SidebarSectionRowPresentation {
  return {
    className:
      SECTION_BUTTON_BASE_CLASS +
      (parentActive
        ? 'text-[var(--primary)]'
        : 'text-[var(--fg-3)] hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]'),
    style: {
      minHeight: 44,
      gap: collapsed ? 0 : 12,
      paddingInline: collapsed ? 0 : 12,
      justifyContent: collapsed ? 'center' : 'flex-start',
      background: parentActive ? 'var(--selection-bg)' : undefined,
      fontFamily: 'var(--font-sans)',
      fontSize: 15,
      fontWeight: parentActive ? 500 : 400,
    },
    iconStrokeWidth: parentActive ? 2.2 : 1.8,
    iconColor: parentActive ? 'var(--primary)' : 'currentColor',
  }
}
