import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SaxesParser } from 'saxes'
import { describe, expect, it } from 'vitest'

const widgetRoot = resolve(
  process.cwd(),
  'modules/orbit-widget/android/src/main/res',
)
const widgetSourceRoot = resolve(
  process.cwd(),
  'modules/orbit-widget/android/src/main/java/org/useorbit/app/widget',
)

function resourceStrings(relativePath: string) {
  const strings = new Map<string, string>()
  let currentName: string | undefined
  let currentText = ''
  const parser = new SaxesParser()

  parser.on('opentag', tag => {
    if (tag.name === 'string') {
      currentName = String(tag.attributes.name)
      currentText = ''
    }
  })
  parser.on('text', text => {
    if (currentName) currentText += text
  })
  parser.on('closetag', tag => {
    if (tag.name === 'string' && currentName) {
      strings.set(currentName, currentText)
      currentName = undefined
    }
  })
  parser.write(readFileSync(resolve(widgetRoot, relativePath), 'utf8')).close()

  return strings
}

function layoutViews() {
  const views = new Map<string, Record<string, string>>()
  const parser = new SaxesParser()

  parser.on('opentag', tag => {
    const id = tag.attributes['android:id']
    if (id) {
      views.set(
        String(id).replace('@+id/', ''),
        Object.fromEntries(
          Object.entries(tag.attributes).map(([name, value]) => [name, String(value)]),
        ),
      )
    }
  })
  parser
    .write(readFileSync(resolve(widgetRoot, 'layout/widget_layout.xml'), 'utf8'))
    .close()

  return views
}

describe('Android widget header', () => {
  it('ships the complete header copy in English and Brazilian Portuguese', () => {
    const english = resourceStrings('values/widget_strings.xml')
    const portuguese = resourceStrings('values-pt-rBR/widget_strings.xml')

    expect(Object.fromEntries(english)).toMatchObject({
      widget_today: 'Today',
      widget_tomorrow: 'Tomorrow',
      widget_of: 'of',
      widget_completed: 'completed',
      widget_streak_unit: 'days',
      widget_all_clear: 'All clear',
      widget_refresh: 'Refresh',
    })
    expect(Object.fromEntries(portuguese)).toMatchObject({
      widget_today: 'Hoje',
      widget_tomorrow: 'Amanhã',
      widget_of: 'de',
      widget_completed: 'concluídos',
      widget_streak_unit: 'dias',
      widget_all_clear: 'Tudo feito',
      widget_refresh: 'Atualizar',
    })
  })

  it('renders a compact two-line header with one accent element', () => {
    const views = layoutViews()

    expect(views.get('widget_header_container')).toMatchObject({
      'android:layout_height': '48dp',
    })
    expect(views.get('widget_header')).toMatchObject({
      'android:textAllCaps': 'true',
      'android:textColor': '@color/widget_fg_3',
      'android:textSize': '13sp',
    })
    expect(views.get('widget_subtitle')).toMatchObject({
      'android:ellipsize': 'end',
      'android:maxLines': '1',
      'android:textColor': '@color/widget_fg_3',
      'android:textSize': '11sp',
    })
    expect(views.get('widget_streak_group')).toMatchObject({
      'android:visibility': 'gone',
    })
    expect(views.get('widget_streak')).toMatchObject({
      'android:textColor': '@color/widget_primary',
    })
    expect(views.get('widget_streak_unit')).toMatchObject({
      'android:textColor': '@color/widget_fg_3',
    })
    expect(
      [...views.entries()]
        .filter(([, attributes]) =>
          Object.values(attributes).includes('@color/widget_primary'),
        )
        .map(([id]) => id),
    ).toEqual(['widget_streak'])
    expect(views.has('widget_header_dot')).toBe(false)
    expect(views.has('widget_flame')).toBe(false)
  })

  /**
   * The drawing renders the day label in fg-3 and the subtitle in fg-4. fg-4 measures 2.83 dark
   * and 3.48 light as 11sp text, both under the 4.5 floor, so the subtitle holds fg-3 and the
   * drawn step survives as size and weight. Asserting BOTH halves keeps a later sweep from
   * "restoring" the drawing into a contrast failure.
   */
  it('steps the day label down to fg-3 and keeps the subtitle off the unreadable fg-4', () => {
    const views = layoutViews()
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(views.get('widget_header')?.['android:textColor']).toBe('@color/widget_fg_3')
    expect(views.get('widget_subtitle')?.['android:textColor']).toBe('@color/widget_fg_3')
    expect(
      [...views.entries()].filter(([, attributes]) =>
        Object.values(attributes).includes('@color/widget_fg_4'),
      ),
    ).toEqual([])
    for (const source of [provider, service]) {
      expect(source).toMatch(
        /setModeAwareColor\(R\.id\.widget_header, "setTextColor", colorModes\) \{ it\.textMuted \}/,
      )
      expect(source).not.toContain(
        'setModeAwareColor(R.id.widget_header, "setTextColor", colorModes) { it.textPrimary }',
      )
    }
  })

  /** The 2x2 drawing keeps the streak numeral and drops its unit at 200dp and below. */
  it('hides only the streak unit on a narrow widget instance', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(provider).toContain('private const val NARROW_WIDGET_MAX_DP = 200')
    expect(provider).toMatch(
      /fun streakUnitVisibility\(minWidthDp: Int\): Int =\s*if \(minWidthDp in 1\.\.NARROW_WIDGET_MAX_DP\) View\.GONE else View\.VISIBLE/,
    )
    expect(provider).toContain(
      'views.setViewVisibility(R.id.widget_streak_unit, streakUnitVisibility(minWidthDp))',
    )
    expect(provider).toContain('OPTION_APPWIDGET_MIN_WIDTH')
    expect(provider).toContain('override fun onAppWidgetOptionsChanged(')
    expect(service).toContain('OPTION_APPWIDGET_MIN_WIDTH')
    expect(service).toContain('OrbitWidgetProvider.streakUnitVisibility(minWidthDp)')
    expect(service).not.toContain(
      'views.setViewVisibility(R.id.widget_streak_unit, android.view.View.VISIBLE)',
    )
  })

  /**
   * The drawn signed-out card is one tap target with no control on it, because the widget cannot
   * sign anyone in. Three paths could put the refresh back: the full render, the placeholder the
   * token-null branch draws, and the refresh timeout worker.
   */
  it('carries no refresh control on any signed-out path', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const worker = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetRefreshTimeoutWorker.kt'),
      'utf8',
    )

    expect(provider).toMatch(
      /fun hideRefresh\(views: RemoteViews\) \{\s*views\.setViewVisibility\(R\.id\.widget_refresh, View\.GONE\)\s*views\.setViewVisibility\(R\.id\.widget_refresh_loading, View\.GONE\)/,
    )
    expect(provider).toContain('hideRefresh(views)')
    expect(provider).toContain('if (isSignedOut(context)) hideRefresh(fallback) else showRefresh(fallback)')
    expect(provider).toMatch(/if \(isSignedOut\(context\)\) \{\s*for \(id in appWidgetIds\) updateWidgetLayout/)
    expect(service).toContain('renderPlaceholder(showSkeleton = false, signedOut = true)')
    expect(service).toContain('OrbitWidgetProvider.hideRefresh(views)')
    expect(worker).toContain('OrbitWidgetProvider.hideRefresh(views)')
    expect(provider).toContain(
      'fun isSignedOut(context: Context): Boolean = OrbitWidgetModule.getToken(context) == null',
    )
    for (const source of [service, worker]) {
      expect(source).toContain('OrbitWidgetProvider.isSignedOut(context)')
      expect(source).not.toContain('OrbitWidgetModule.getToken(context) == null')
    }
  })

  it('keeps the static refresh name and replaces it through the widget language path', () => {
    const views = layoutViews()
    const provider = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'),
      'utf8',
    )
    const service = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetService.kt'),
      'utf8',
    )

    expect(views.get('widget_refresh')).toMatchObject({
      'android:contentDescription': '@string/widget_refresh',
    })
    expect(provider).toMatch(
      /val refreshDescription = OrbitWidgetFactory\.tr\(\s*context,\s*lang,\s*WidgetString\.REFRESH\s*\)/,
    )
    expect(provider).toContain(
      'views.setContentDescription(R.id.widget_refresh, refreshDescription)',
    )
    expect(service).toContain(
      'val refreshDescription = tr(context, lang, WidgetString.REFRESH)',
    )
    expect(service).toContain(
      'views.setContentDescription(R.id.widget_refresh, refreshDescription)',
    )
  })
})
