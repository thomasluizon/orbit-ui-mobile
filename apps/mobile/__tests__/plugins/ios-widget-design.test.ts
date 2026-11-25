import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const widgetRoot = resolve(process.cwd(), 'modules/orbit-widget')
const swift = readFileSync(resolve(widgetRoot, 'ios/Extension/OrbitWidget.swift'), 'utf8')
const androidDimens = readFileSync(resolve(widgetRoot, 'android/src/main/res/values/widget_dimens.xml'), 'utf8')
const androidDrawable = (name: string) => readFileSync(resolve(widgetRoot, `android/src/main/res/drawable/${name}.xml`), 'utf8')

function dimension(name: string) {
  const match = androidDimens.match(new RegExp(`<dimen name="${name}">(\\d+)(?:dp|sp)</dimen>`))
  expect(match, name).not.toBeNull()
  return Number(match![1])
}

function pathData(drawable: string) {
  return [...drawable.matchAll(/android:pathData="([^"]+)"/g)].map((match) => match[1]!)
}

describe('iOS widget in the Orbit design', () => {
  it('draws no SF Symbol and sets no system text style in the header, rows and badges', () => {
    expect(swift).not.toContain('systemName')
    expect(swift).not.toMatch(/\.font\(\s*\.(largeTitle|title|title2|title3|headline|subheadline|body|callout|footnote|caption|caption2)\b/)
    expect(swift).not.toMatch(/\.font\(\.system/)
  })

  it('sets every font in Space Grotesk or Geist, the families of the app', () => {
    expect(swift).toContain('"SpaceGrotesk-SemiBold"')
    expect(swift).toContain('"Geist-Regular"')
    expect([...swift.matchAll(/\.font\(([^)]*)\)/g)].every((match) => /^OrbitFont\./.test(match[1]!))).toBe(true)
    expect(swift).toContain('.dynamicTypeSize(...DynamicTypeSize.xLarge)')
  })

  it('keeps the Android geometry: 48 header, 48 rows, 24 remainder, 12 inset, 32 child inset, 20 mark', () => {
    expect(swift).toContain(`private let headerHeight: CGFloat = ${dimension('widget_row_height')}`)
    expect(swift).toContain(`private let rowHeight: CGFloat = ${dimension('widget_row_height')}`)
    expect(swift).toContain(`private let remainderHeight: CGFloat = ${dimension('widget_remainder_height')}`)
    expect(swift).toContain(`.padding(.horizontal, ${dimension('widget_row_inset_inline')})`)
    expect(swift).toContain(`row.depth == 0 ? ${dimension('widget_row_inset_inline')} : ${dimension('widget_child_inset')}`)
    expect(swift).toContain(`.frame(width: ${dimension('widget_status_size')}, height: ${dimension('widget_status_size')})`)
    expect(swift).toContain(`HStack(spacing: ${dimension('widget_inline_gap')})`)
    expect(swift).toContain(`.frame(height: ${dimension('widget_badge_height')})`)
    expect(swift).toContain(`.padding(.horizontal, ${dimension('widget_badge_inset')})`)
    expect(swift).toContain(`RoundedRectangle(cornerRadius: ${dimension('widget_badge_inset')})`)
    expect(swift).toContain(`StrokeStyle(lineWidth: 1.7 * size / 20`)
  })

  it('draws the Android status marks from the points of the vector drawables', () => {
    const [disc, check] = pathData(androidDrawable('widget_status_done'))[0]!.split('ZM')
    expect(disc).toContain('A10,10')
    expect(swift).toContain('path.addEllipse(in: CGRect(x: 0, y: 0, width: 20 * scale, height: 20 * scale))')
    const checkPoints = [...check!.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => `point(${match[1]}, ${match[2]})`)
    expect(checkPoints).toHaveLength(6)
    expect(swift).toContain(`path.addLines([${checkPoints.join(', ')}])`)
    expect(swift).toContain('FillStyle(eoFill: true)')

    const [triangle, stem, dot] = pathData(androidDrawable('widget_status_overdue'))
    expect(triangle).toBe('M10,2.2L18,17H2Z')
    expect(swift).toContain('CGPoint(x: 10 * scale, y: 2.2 * scale)')
    expect(swift).toContain('CGPoint(x: 18 * scale, y: 17 * scale)')
    expect(swift).toContain('CGPoint(x: 2 * scale, y: 17 * scale)')
    expect(stem).toBe('M10,7L10,11')
    expect(swift).toContain('CGPoint(x: 10 * scale, y: 7 * scale)')
    expect(swift).toContain('CGPoint(x: 10 * scale, y: 11 * scale)')
    expect(dot).toContain('M10,13m-1,0')
    expect(swift).toContain('CGRect(x: 9 * scale, y: 12 * scale, width: 2 * scale, height: 2 * scale)')

    const [ring] = pathData(androidDrawable('widget_status_pending'))
    expect(ring).toContain('A8.5,8.5')
    expect(androidDrawable('widget_status_pending')).toContain('android:strokeWidth="1.5"')
    expect(swift).toContain('Circle().stroke(color("statusEmpty"), lineWidth: 1.5).frame(width: 17, height: 17)')
  })

  it('names every state for VoiceOver and covers signed out, empty, loading and the remainder line', () => {
    expect(swift).toContain('.accessibilityLabel(text(row.statusKey))')
    expect(swift).toContain('message(text("signIn"))')
    expect(swift).toContain('message(text(payload.emptyKey))')
    expect(swift).toContain('loadingSkeleton')
    expect(swift).toContain('text("more")')
    expect(swift).toContain('.contentMarginsDisabled()')
  })
})
