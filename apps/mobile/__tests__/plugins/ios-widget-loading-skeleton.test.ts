import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const widgetRoot = resolve(process.cwd(), 'modules/orbit-widget')
const swift = readFileSync(resolve(widgetRoot, 'ios/Extension/OrbitWidget.swift'), 'utf8')
const androidBody = readFileSync(resolve(widgetRoot, 'android/src/main/res/layout/widget_body.xml'), 'utf8')
const androidDimens = readFileSync(resolve(widgetRoot, 'android/src/main/res/values/widget_dimens.xml'), 'utf8')
const swiftFallbacks = readFileSync(resolve(widgetRoot, 'ios/Shared/WidgetColors.generated.swift'), 'utf8')
const androidColours = (night: boolean) => readFileSync(resolve(widgetRoot, `android/src/main/res/values${night ? '-night' : ''}/widget_colors.xml`), 'utf8')

function dimension(name: string) {
  const match = androidDimens.match(new RegExp(`<dimen name="${name}">(\\d+)dp</dimen>`))
  expect(match, name).not.toBeNull()
  return Number(match![1])
}

describe('iOS widget loading state', () => {
  it('draws the Android skeleton rows, never a visible Loading word', () => {
    expect(androidBody).toContain('@drawable/widget_skeleton_mark')
    expect(swift).not.toMatch(/Text\(text\("loading"\)\)/)
    const skeleton = swift.slice(swift.indexOf('private var loadingSkeleton'))
    expect(skeleton).toContain('.accessibilityLabel(text("loading"))')
    expect(skeleton).toContain(`Circle().fill(color("surface")).frame(width: ${dimension('widget_status_size')}, height: ${dimension('widget_status_size')})`)
    expect(skeleton).toContain(`RoundedRectangle(cornerRadius: 6).fill(color("surface"))`)
    expect(skeleton).toContain(`.frame(width: widths[index], height: ${dimension('widget_skeleton_height')})`)
    const widths = [1, 2, 3, 4, 5].map((index) => dimension(`widget_skeleton_width_${index}`))
    expect(skeleton).toContain(`let widths: [CGFloat] = [${widths.join(', ')}]`)
    expect(skeleton).toContain(`HStack(spacing: ${dimension('widget_inline_gap')})`)
  })

  it('paints the skeleton in the colour Android calls widget_well, so no new colour enters the widget', () => {
    for (const night of [false, true]) {
      const well = androidColours(night).match(/<color name="widget_well">(#[0-9A-F]{6})<\/color>/i)![1]
      expect(swiftFallbacks).toContain(`"${night ? 'dark' : 'light'}_surface": "${well.toUpperCase()}"`)
    }
  })
})
