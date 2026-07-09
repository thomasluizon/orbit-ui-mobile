import { describe, expect, it } from 'vitest'
import { resolveSidebarSectionRowPresentation } from '@/components/navigation/app-sidebar-presentation'

describe('resolveSidebarSectionRowPresentation', () => {
  it('applies the primary-tinted active presentation', () => {
    const presentation = resolveSidebarSectionRowPresentation({
      collapsed: false,
      parentActive: true,
    })

    expect(presentation.className).toContain('text-[var(--primary)]')
    expect(presentation.style.background).toBe('var(--selection-bg)')
    expect(presentation.style.fontWeight).toBe(500)
    expect(presentation.iconStrokeWidth).toBe(2.2)
    expect(presentation.iconColor).toBe('var(--primary)')
  })

  it('uses the muted inactive presentation', () => {
    const presentation = resolveSidebarSectionRowPresentation({
      collapsed: false,
      parentActive: false,
    })

    expect(presentation.className).toContain('text-[var(--fg-3)]')
    expect(presentation.style.background).toBeUndefined()
    expect(presentation.style.fontWeight).toBe(400)
    expect(presentation.iconStrokeWidth).toBe(1.8)
    expect(presentation.iconColor).toBe('currentColor')
  })

  it('collapses spacing and centers content in the icon rail', () => {
    const collapsed = resolveSidebarSectionRowPresentation({
      collapsed: true,
      parentActive: false,
    })
    expect(collapsed.style.gap).toBe(0)
    expect(collapsed.style.paddingInline).toBe(0)
    expect(collapsed.style.justifyContent).toBe('center')

    const expanded = resolveSidebarSectionRowPresentation({
      collapsed: false,
      parentActive: false,
    })
    expect(expanded.style.gap).toBe(12)
    expect(expanded.style.paddingInline).toBe(12)
    expect(expanded.style.justifyContent).toBe('flex-start')
  })
})
