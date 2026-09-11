import { readdirSync, readFileSync } from 'node:fs'
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

/**
 * RemoteViews.findBestFitLayout keeps every key that fits and then takes the SMALLEST squared
 * distance, so a key on the breakpoint beats the key just above it. Transcribed from
 * android/widget/RemoteViews.java: fitsIn is `ceil(host) + 1 > key` and the comparison is strict.
 */
type SizeDp = Readonly<{
  width: number
  height: number
}>

type NamedSizeDp = SizeDp & Readonly<{
  viewName: string
}>

function fitsIn(keyDp: SizeDp, hostDp: SizeDp) {
  return Math.ceil(hostDp.width) + 1 > keyDp.width
    && Math.ceil(hostDp.height) + 1 > keyDp.height
}

function selectedSizeKey(keysDp: readonly NamedSizeDp[], hostDp: SizeDp) {
  let selected: NamedSizeDp | null = null
  let smallestSquareDistance = Number.POSITIVE_INFINITY

  for (const keyDp of keysDp) {
    if (!fitsIn(keyDp, hostDp)) continue
    const squareDistance = (keyDp.width - hostDp.width) ** 2
      + (keyDp.height - hostDp.height) ** 2
    if (selected === null || squareDistance < smallestSquareDistance) {
      selected = keyDp
      smallestSquareDistance = squareDistance
    }
  }

  return selected ?? keysDp.reduce((smallest, key) => (
    key.width * key.height < smallest.width * smallest.height ? key : smallest
  ))
}

/**
 * The body of one Kotlin function, by brace matching. A file-wide `toContain` is satisfied by any
 * other call site: `renderWidgets()` also appears in `renderPlaceholder` and in the exception path,
 * so deleting the successful sync's own render left every widget test green.
 */
function kotlinFunctionBody(source: string, name: string) {
  const declaration = source.indexOf(`private fun ${name}(`)
  if (declaration < 0) throw new Error(`Missing Kotlin function: ${name}`)

  const open = source.indexOf('{', declaration)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  throw new Error(`Unbalanced braces in Kotlin function: ${name}`)
}

function kotlinFloatConstant(source: string, name: string) {
  const value = source.match(new RegExp(`(?:private|internal) const val ${name} = ([\\d.]+)f`))?.[1]
  if (value === undefined) throw new Error(`Missing Kotlin constant: ${name}`)
  return Number(value)
}

function kotlinFloatExpression(source: string, expression: string) {
  const normalized = expression.trim()
  const literal = normalized.match(/^([\d.]+)f$/)?.[1]
  if (literal !== undefined) return Number(literal)

  const addition = normalized.match(/^(\w+) \+ ([\d.]+)f$/)
  if (addition) {
    const [, constantName, addend] = addition
    if (constantName === undefined || addend === undefined) {
      throw new Error(`Malformed Kotlin float expression: ${expression}`)
    }
    return kotlinFloatConstant(source, constantName) + Number(addend)
  }

  return kotlinFloatConstant(source, normalized)
}

function remoteViewSizeKeys(source: string) {
  return [...source.matchAll(/SizeF\(([^,]+), ([^)]+)\) to (\w+)/g)].map(match => {
    const [, width, height, viewName] = match
    if (width === undefined || height === undefined || viewName === undefined) {
      throw new Error(`Malformed RemoteViews size key: ${match[0]}`)
    }
    return {
      width: kotlinFloatExpression(source, width),
      height: kotlinFloatExpression(source, height),
      viewName,
    }
  })
}

function widgetKotlinSources() {
  return readdirSync(widgetSourceRoot)
    .filter(name => name.endsWith('.kt'))
    .map(name => ({ name, source: readFileSync(resolve(widgetSourceRoot, name), 'utf8') }))
}

/** Every `SharedPreferences.edit() ... apply()` chain in one Kotlin source, as raw text. */
function preferenceWriteChains(source: string) {
  return [...source.matchAll(/\.edit\(\)[\s\S]*?\.(?:apply|commit)\(\)/g)].map(
    match => match[0],
  )
}

function layoutViews(relativePath = 'layout/widget_layout.xml') {
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
    .write(readFileSync(resolve(widgetRoot, relativePath), 'utf8'))
    .close()

  return views
}

function drawable(relativePath: string) {
  return readFileSync(resolve(widgetRoot, `drawable/${relativePath}`), 'utf8')
}

function rootAttributes(relativePath: string) {
  let attributes: Record<string, string> | undefined
  const parser = new SaxesParser()

  parser.on('opentag', tag => {
    if (attributes) return
    attributes = Object.fromEntries(
      Object.entries(tag.attributes).map(([name, value]) => [name, String(value)]),
    )
  })
  parser.write(readFileSync(resolve(widgetRoot, relativePath), 'utf8')).close()

  return attributes ?? {}
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
      'android:textColor': '@color/widget_streak_text',
    })
    expect(views.get('widget_streak_unit')).toMatchObject({
      'android:textColor': '@color/widget_fg_3',
    })
    expect(
      [...views.entries()]
        .filter(([, attributes]) =>
          Object.values(attributes).includes('@color/widget_streak_text'),
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

    expect(views.get('widget_header')?.['android:textColor']).toBe('@color/widget_fg_3')
    expect(views.get('widget_subtitle')?.['android:textColor']).toBe('@color/widget_fg_3')
    expect(
      [...views.entries()].filter(([, attributes]) =>
        Object.values(attributes).includes('@color/widget_fg_4'),
      ),
    ).toEqual([])
    expect(provider).toMatch(
      /setModeAwareColor\(R\.id\.widget_header, "setTextColor", colorModes\) \{ it\.textMuted \}/,
    )
    expect(provider).not.toContain(
      'setModeAwareColor(R.id.widget_header, "setTextColor", colorModes) { it.textPrimary }',
    )
  })

  /**
   * Ticket #490 is the deliberate replacement for the old SizeF guard. The host can select a
   * size-keyed child safely only after every update becomes a full update: Android's partial merge
   * mutates the parent actions but renders a child, which leaves the selected variant stale.
   *
   * Both children are keyed at 1dp tall, so `ceil(height) + 1 > 1` always holds and width alone
   * decides. Every sampled width above the breakpoint is one a host can really produce, because
   * AppWidgetHostView divides its laid out pixel span by the display density: 526px at density
   * 2.625 arrives as 200.38dp.
   */
  /**
   * RemoteViews inflates only classes annotated @RemoteView, and android.view.View is not one of
   * them. A bare <View> makes RemoteViews.apply throw and the host substitutes its own error view,
   * which no source-text guard and no unit test can see. Proven on an API 35 emulator: the hairline
   * that pull request 873 added as a <View> failed with
   * `Class not allowed to be inflated android.view.View`.
   */
  it('builds every widget layout from RemoteViews-inflatable classes only', () => {
    const inflatable = new Set([
      'AdapterViewFlipper', 'AnalogClock', 'Button', 'Chronometer', 'FrameLayout', 'GridLayout',
      'GridView', 'ImageButton', 'ImageView', 'LinearLayout', 'ListView', 'ProgressBar',
      'RelativeLayout', 'StackView', 'TextClock', 'TextView', 'ViewFlipper',
    ])
    const layoutDirectory = resolve(widgetRoot, 'layout')

    for (const name of readdirSync(layoutDirectory).filter(file => file.endsWith('.xml'))) {
      const tags: string[] = []
      const parser = new SaxesParser()
      parser.on('opentag', tag => tags.push(tag.name))
      parser.write(readFileSync(resolve(layoutDirectory, name), 'utf8')).close()

      for (const tag of tags) {
        expect(inflatable.has(tag), `${name} inflates <${tag}>`).toBe(true)
      }
    }
  })

  it('lets the host select the streak unit without any partial widget updates', () => {
    const views = layoutViews()
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')

    expect(views.get('widget_streak_unit')).toBeDefined()
    for (const { source } of widgetKotlinSources()) {
      expect(source).not.toContain('partiallyUpdateAppWidget')
      expect(source).not.toContain('OPTION_APPWIDGET_MIN_WIDTH')
    }
    const breakpointDp = kotlinFloatConstant(provider, 'STREAK_UNIT_BREAKPOINT_DP')
    const keysDp = remoteViewSizeKeys(provider)

    expect(breakpointDp).toBe(200)
    for (const hostDp of [110, 160, 199, 199.5, 199.9, 200]) {
      expect(
        selectedSizeKey(keysDp, { width: hostDp, height: 96 }).width,
        `${hostDp}dp`,
      ).toBeLessThanOrEqual(breakpointDp)
    }
    for (const hostDp of [200.1, 200.38, 200.5, 201, 250, 400]) {
      expect(
        selectedSizeKey(keysDp, { width: hostDp, height: 96 }).width,
        `${hostDp}dp`,
      ).toBe(breakpointDp + 1)
    }
    expect(provider).toMatch(
      /if \(Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.S\) \{\s*return buildWidgetViews\([\s\S]*?View\.VISIBLE,\s*FOUR_BY_TWO_HEIGHT_DP,\s*true\s*\)\s*\}/,
    )
    expect(provider).toMatch(
      /val compactViews = buildWidgetViews\([\s\S]*?View\.GONE,\s*TWO_BY_TWO_HEIGHT_DP,\s*false\s*\)/,
    )
  })

  it('offers the four launcher geometries as host-selected complete views', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const breakpointKeyDp = kotlinFloatConstant(provider, 'STREAK_UNIT_BREAKPOINT_DP') + 1
    const keysDp = remoteViewSizeKeys(provider)
    const expectedSelections = [
      { host: { width: 336, height: 96 }, viewName: 'fourByOneViews' },
      { host: { width: 336, height: 192 }, viewName: 'fourByTwoViews' },
      { host: { width: 336, height: 288 }, viewName: 'fourByThreeViews' },
      { host: { width: 160, height: 192 }, viewName: 'twoByTwoViews' },
      { host: { width: 250, height: 192 }, viewName: 'fourByTwoViews' },
    ] as const

    expect.soft(provider).toMatch(
      /val fourByOneViews = buildWidgetViews\([\s\S]*?View\.VISIBLE,\s*FOUR_BY_ONE_HEIGHT_DP,\s*true\s*\)/,
    )
    expect.soft(provider).toContain(
      'SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, FOUR_BY_ONE_HEIGHT_DP) to fourByOneViews',
    )
    expect.soft(provider).toContain(
      'SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, FOUR_BY_TWO_HEIGHT_DP) to fourByTwoViews',
    )
    expect.soft(provider).toMatch(
      /val fourByThreeViews = buildWidgetViews\([\s\S]*?View\.VISIBLE,\s*FOUR_BY_THREE_HEIGHT_DP,\s*true\s*\)/,
    )
    expect.soft(provider).toContain(
      'SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, FOUR_BY_THREE_HEIGHT_DP) to fourByThreeViews',
    )
    expect.soft(provider).toMatch(
      /val twoByTwoViews = buildWidgetViews\([\s\S]*?View\.GONE,\s*TWO_BY_TWO_HEIGHT_DP,\s*false\s*\)/,
    )
    expect.soft(provider).toContain(
      'SizeF(NARROW_WIDTH_DP, TWO_BY_TWO_HEIGHT_DP) to twoByTwoViews',
    )
    expect.soft(provider).toMatch(
      /putExtra\(EXTRA_WIDGET_HEIGHT_DP, widgetHeightDp\)\s*putExtra\(EXTRA_SHOW_TIME, showTime\)\s*data = Uri\.parse\(toUri\(Intent\.URI_INTENT_SCHEME\)\)/,
    )
    for (const { host, viewName } of expectedSelections) {
      expect.soft(
        selectedSizeKey(keysDp, host).viewName,
        `${host.width} by ${host.height}dp`,
      ).toBe(viewName)
    }
    for (const viewName of ['fourByOneViews', 'fourByTwoViews', 'fourByThreeViews']) {
      expect.soft(keysDp.find(key => key.viewName === viewName)?.width).toBe(breakpointKeyDp)
    }
  })

  it('derives row capacity and remainder space from the drawing geometry', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const views = layoutViews()

    expect.soft(service).toContain('internal fun calculateWidgetGeometry(')
    expect.soft(service).toContain('val availableHeightDp = heightDp - HEADER_HEIGHT_DP')
    expect.soft(service).toContain('floor(availableHeightDp / ROW_HEIGHT_DP)')
    expect.soft(service).toContain('availableHeightDp - (fit - 1) * ROW_HEIGHT_DP >= REMAINDER_HEIGHT_DP')
    expect.soft(service).toContain('if (canStateRemainder) maxOf(1, fit - 1)')
    for (const index of [1, 2, 3, 4, 5]) {
      expect.soft(views.get(`widget_skeleton_${index}`)).toMatchObject({
        'android:layout_height': '48dp',
        'android:gravity': 'center_vertical',
        'android:orientation': 'horizontal',
      })
    }
  })

  it('draws each first-load row as a placeholder mark and name bar', () => {
    const layout = readFileSync(resolve(widgetRoot, 'layout/widget_layout.xml'), 'utf8')
    const views = layoutViews()
    const mark = drawable('widget_skeleton_mark.xml')
    const nameBar = drawable('widget_skeleton_bar.xml')
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')

    expect(layout.match(/@drawable\/widget_skeleton_mark/g)).toHaveLength(5)
    expect(layout.match(/@drawable\/widget_skeleton_bar/g)).toHaveLength(5)
    for (const [index, width] of [150, 126, 102, 78, 54].entries()) {
      expect(views.get(`widget_skeleton_bar_${index + 1}`)).toMatchObject({
        'android:layout_width': `${width}dp`,
        'android:layout_height': '12dp',
      })
    }
    expect(mark).toContain('android:shape="oval"')
    expect(mark).toContain('<solid android:color="@color/widget_well" />')
    expect(nameBar).toContain('<corners android:radius="6dp" />')
    expect(provider).toMatch(
      /setContentDescription\(\s*R\.id\.widget_loading,[\s\S]{0,160}?WidgetString\.LOADING/,
    )

    expect(resourceStrings('values/widget_strings.xml').get('widget_loading')).toBe('Loading')
    expect(resourceStrings('values-pt-rBR/widget_strings.xml').get('widget_loading')).toBe(
      'Carregando',
    )
  })

  it('dims only the rows while refresh is active and restores them for every idle render', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')

    expect(provider).toMatch(
      /private fun applyRefreshingState\(views: RemoteViews, refreshing: Boolean\)[\s\S]*?setViewVisibility\(R\.id\.widget_refresh, if \(refreshing\) View\.GONE else View\.VISIBLE\)[\s\S]*?setViewVisibility\(\s*R\.id\.widget_refresh_loading, if \(refreshing\) View\.VISIBLE else View\.GONE\s*\)[\s\S]*?setFloat\(R\.id\.widget_list, "setAlpha", if \(refreshing\) 0\.6f else 1f\)/,
    )
    expect(provider).toContain('applyRefreshingState(views, refreshing)')
    expect(provider).not.toContain('setFloat(R.id.widget_content, "setAlpha"')
  })

  it('renders an accessible remainder item and hides only time on the narrow variant', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const remainder = layoutViews('layout/widget_remainder.xml')

    expect.soft(kotlinFloatConstant(service, 'REMAINDER_HEIGHT_DP')).toBe(48)
    expect.soft(remainder.get('widget_remainder')).toMatchObject({
      'android:layout_height': '48dp',
    })
    expect.soft(remainder.get('widget_remainder_text')).toMatchObject({
      'android:layout_height': '24dp',
      'android:paddingStart': '12dp',
      'android:paddingEnd': '12dp',
      'android:textColor': '@color/widget_fg_3',
      'android:textSize': '12sp',
    })
    expect.soft(service).toContain('R.layout.widget_remainder')
    expect.soft(service).toContain(
      'views.setTextViewText(R.id.widget_remainder_text, remainderText)',
    )
    expect.soft(service).toContain(
      'views.setContentDescription(R.id.widget_remainder, remainderDescription)',
    )
    expect.soft(service).toContain(
      'views.setOnClickFillInIntent(R.id.widget_remainder, Intent())',
    )
    expect.soft(service).toMatch(
      /val remainderDescription = tr\(\s*context,\s*lang,\s*WidgetString\.MORE_DESCRIPTION,\s*remainderCount\s*\)/,
    )
    expect.soft(service).toMatch(/if \(!showTime\) \{[\s\S]*?R\.id\.item_time[\s\S]*?R\.id\.item_time_overdue/)
    expect.soft(service).toContain('override fun getViewTypeCount(): Int = 2')
  })

  it('ships the one-count remainder format in both widget locales', () => {
    const english = resourceStrings('values/widget_strings.xml')
    const portuguese = resourceStrings('values-pt-rBR/widget_strings.xml')

    expect.soft(english.get('widget_more')).toBe('%1$d more')
    expect.soft(portuguese.get('widget_more')).toBe('mais %1$d')
    expect.soft(english.get('widget_more_description')).toBe(
      '%1$d more habits are not shown.',
    )
    expect.soft(portuguese.get('widget_more_description')).toBe(
      'Mais %1$d hábitos não são exibidos.',
    )
    expect.soft(english.get('widget_more')?.match(/%1\$d/g)).toHaveLength(1)
    expect.soft(portuguese.get('widget_more')?.match(/%1\$d/g)).toHaveLength(1)
    expect.soft(english.get('widget_more_description')?.match(/%1\$d/g)).toHaveLength(1)
    expect.soft(portuguese.get('widget_more_description')?.match(/%1\$d/g)).toHaveLength(1)
  })

  it('defaults to 4 by 2 and admits the supported resize floors', () => {
    const provider = rootAttributes('xml/orbit_widget_info.xml')

    expect.soft(provider['android:minWidth']).toBe('250dp')
    expect.soft(provider['android:minHeight']).toBe('110dp')
    expect.soft(provider['android:minResizeWidth']).toBe('160dp')
    expect.soft(provider['android:minResizeHeight']).toBe('96dp')
    expect.soft(provider['android:targetCellWidth']).toBe('4')
    expect.soft(provider['android:targetCellHeight']).toBe('2')
  })

  it('routes every post-sync header and loading mutation through the full provider render', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const worker = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetRefreshTimeoutWorker.kt'),
      'utf8',
    )

    for (const key of [
      'header_label',
      'habit_count',
      'completed_count',
      'user_streak',
      'lang',
    ]) {
      expect(provider).toContain(`"${key}"`)
      expect(service).toContain(`"${key}"`)
    }
    for (const key of ['CACHE_REFRESHING', 'CACHE_LOADING_SKELETON']) {
      expect(provider).toContain(`getBoolean(${key}`)
      expect(service).toContain(`putBoolean(OrbitWidgetProvider.${key}`)
      expect(worker).toContain(`putBoolean(OrbitWidgetProvider.${key}`)
    }
    for (const view of [
      'widget_header',
      'widget_subtitle',
      'widget_streak',
      'widget_streak_group',
      'widget_refresh',
      'widget_refresh_loading',
      'widget_loading',
    ]) {
      expect(provider).toContain(`R.id.${view}`)
    }
    expect(provider).toContain(
      'views.setContentDescription(R.id.widget_refresh, refreshDescription)',
    )
    /**
     * The successful sync must persist the complete header and loading state and only then issue
     * one full render, so the size-keyed child the host selects is never left stale.
     */
    expect(kotlinFunctionBody(service, 'loadWidgetData')).toMatch(
      /\.putBoolean\(OrbitWidgetProvider\.CACHE_LOADING_SKELETON, false\)\s*\.apply\(\)\s*renderWidgets\(\)\s*$/,
    )
    expect(worker).toContain('OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)')
  })

  /**
   * The drawn signed-out card is one tap target with no control on it, because the widget cannot
   * sign anyone in. Three paths could put the refresh back: the full render, the placeholder the
   * token-null branch draws, and the refresh timeout worker.
   */
  /**
   * updateAppWidget submits a complete representation and the host may inflate it rather than
   * reapply it, so a fallback that only sets text would render a card with no empty view and no
   * open-app action. Both full submissions install them from the same helper.
   */
  it('gives every full render the empty view and the open-app targets', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')

    expect(provider).toMatch(
      /fun applyOpenAppActions\(context: Context, views: RemoteViews\)[\s\S]*?setEmptyView\(R\.id\.widget_list, R\.id\.widget_empty\)[\s\S]*?setPendingIntentTemplate\(R\.id\.widget_list, openApp\)[\s\S]*?for \(target in OPEN_APP_TARGETS\) views\.setOnClickPendingIntent\(target, openApp\)/,
    )
    for (const target of ['widget_root', 'widget_header_container', 'widget_header', 'widget_empty', 'widget_loading']) {
      expect(provider).toContain(`R.id.${target},`)
    }
    expect(provider).toMatch(
      /val fallback = RemoteViews\(context\.packageName, R\.layout\.widget_layout\)\s*applyOpenAppActions\(context, fallback\)/,
    )
    expect(provider).toContain('applyOpenAppActions(context, views)')
    expect(provider).toContain('views.setViewVisibility(R.id.widget_empty, View.VISIBLE)')
  })

  /**
   * `resolveWidgetData` blocks for seconds, and everything after it repopulates the cache and the
   * signed-in header. A load must prove it still owns the session, and the two ways it can stop
   * owning it are not the same: a CLEARED token is a sign-out and the signed-out card wins, while a
   * CHANGED token naming the SAME account is an access-token rotation, the person is still signed
   * in, and a newer load already owns the render, so this one drops silently rather than blanking a
   * signed-in widget. A token naming a DIFFERENT account is neither: returning would leave `habits`
   * holding the previous account's rows for `getViewAt` to keep serving, so it goes through
   * `renderPlaceholder`, which is the thing that clears that list.
   */
  it('drops a load whose session ended, blanks one whose account changed, and keeps a rotation', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(service).toMatch(
      /val currentToken = OrbitWidgetModule\.getToken\(context\)\s*if \(currentToken == null\) \{\s*renderPlaceholder\(showSkeleton = false, signedOut = true\)\s*return\s*\}\s*if \(OrbitWidgetModule\.sessionKey\(currentToken\) != OrbitWidgetModule\.sessionKey\(token\)\) \{\s*renderPlaceholder\(showSkeleton = true, signedOut = false\)\s*return\s*\}\s*if \(currentToken != token\) \{\s*return\s*\}/,
    )
    expect(service).toMatch(/private fun renderPlaceholder\([^)]*\) \{\s*habits = emptyList\(\)/)

    const afterFetch = service.slice(service.indexOf('val widgetData = resolveWidgetData(token)'))
    const guardAt = afterFetch.indexOf('val currentToken = OrbitWidgetModule.getToken(context)')
    const cacheAt = afterFetch.indexOf('.putInt("user_streak"')
    expect(guardAt).toBeGreaterThan(-1)
    expect(cacheAt).toBeGreaterThan(guardAt)
    expect(service).toMatch(
      /private fun renderPlaceholder[\s\S]*?putBoolean\(OrbitWidgetProvider\.CACHE_LOADING_SKELETON, showSkeleton && !signedOut\)[\s\S]*?renderWidgets\(\)/,
    )
  })

  /**
   * The drawing's touch note: "Android's minimum is 48dp, not 44, so every tappable region here is
   * 48 tall." The header around the refresh opens Orbit, so a short refresh does not merely miss the
   * floor, it hands near-edge taps to a different action.
   */
  /**
   * The cross-account leak this closes: a fetch still in flight at logout writes its response back
   * after the cache is cleared, and the NEXT account to sign in reads it as fresh and renders
   * another person's habits without ever making a request under its own token. Ordering the write
   * against the logout cannot fix it, because `onDataSetChanged` is synchronized and the
   * replacement callback runs after the old one has already landed. So the payload records which
   * session produced it and only that session can read it back. The key is the token's DIGEST, never
   * the token, which lives in encrypted preferences and must not reach the plain widget cache.
   */
  it('scopes the payload cache to the session that produced it', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const widgetModule = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')

    expect(service).toMatch(
      /val cachedData = if \(prefs\.getString\("habits_session", null\) == session\) \{\s*parseWidgetResponse\(prefs\.getString\("habits_json", null\)\)\s*\} else \{\s*null\s*\}/,
    )
    expect(service).toContain('val session = OrbitWidgetModule.sessionKey(token)')
    expect(widgetModule).toMatch(
      /fun sessionKey\(token: String\): String =\s*MessageDigest\.getInstance\("SHA-256"\)/,
    )
    for (const { source } of widgetKotlinSources()) {
      expect(source).not.toMatch(/putString\("habits_session", token\)/)
    }
  })

  /**
   * Ownership belongs to the ACCOUNT that fetched the payload, never to whichever token happens to
   * be current when the bridge call lands, and never to the token bytes.
   *
   * Two failures meet here. Labelling the response with the current token puts one account's habits
   * on the next account's home screen when a sign-out or an account switch lands mid-flight. Keying
   * on the token instead of the account throws the cache away on every silent refresh, and
   * `apiClient` refreshes and retries on a 401 as a matter of routine, so the app-pushed write
   * would be discarded on the very path it exists to serve. The account claim answers both: it
   * survives a refresh and it changes when somebody else signs in.
   *
   * The TypeScript half is held by the two-argument module type, which `type-check` gates, and by
   * `lib/orbit-widget.ts` passing the token the API accepted rather than the one it read before the
   * fetch. `api-client.test.ts` covers why those two differ.
   */
  it('takes cache ownership from the calling account, not the token current at write time', () => {
    const widgetModule = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')

    expect(widgetModule).toMatch(
      /AsyncFunction\("syncWidgetData"\) \{ json: String, token: String ->/,
    )
    expect(widgetModule).toMatch(
      /val session = sessionKey\(token\)\s*if \(getToken\(context\)\?\.let \{ sessionKey\(it\) \} == session\) \{\s*context\.getSharedPreferences\(CACHE_PREFS_NAME, Context\.MODE_PRIVATE\)\s*\.edit\(\)\s*\.putString\("habits_json", json\)\s*\.putString\("habits_session", session\)/,
    )
    expect(widgetModule).toMatch(
      /\.digest\(\(accountId\(token\) \?: token\)\.toByteArray\(Charsets\.UTF_8\)\)/,
    )

    const caller = readFileSync(resolve(process.cwd(), 'lib/orbit-widget.ts'), 'utf8')
    const sync = caller.slice(caller.indexOf('export async function syncWidgetData'))

    expect(sync).toContain(
      'const { data, authorizingToken } = await apiClientWithAuthorizingToken<unknown>(',
    )
    expect(sync).toContain('await widgetModule.syncWidgetData(JSON.stringify(data), authorizingToken)')
    expect(sync).not.toMatch(/syncWidgetData\(JSON\.stringify\(data\), token\)/)
  })

  /**
   * The widget derives the account from the same JWT the app does, so the two must read the same
   * claims in the same order. Let them drift and the widget names a different account than the app
   * signed in, which either strands a valid cache or, in the other direction, reads one the account
   * does not own. `auth-store.ts` is the producer here: it is what actually authenticates.
   */
  it('reads the account claims the app reads, in the same order', () => {
    const jwtSession = readFileSync(resolve(process.cwd(), 'lib/jwt-session.ts'), 'utf8')
    const userIdBlock = jwtSession.slice(
      jwtSession.indexOf('export function getAccountIdFromPayload'),
      jwtSession.indexOf('export function getAccountIdFromToken'),
    )
    const appClaims = [...userIdBlock.matchAll(/payload(?:\['([^']+)'\]|\.(\w+))/g)].map(
      match => match[1] ?? match[2],
    )

    const widgetModule = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')
    const kotlinList = widgetModule.slice(
      widgetModule.indexOf('NAME_IDENTIFIER_CLAIMS = listOf('),
      widgetModule.indexOf('fun getEncryptedPrefs'),
    )
    const widgetClaims = [...kotlinList.matchAll(/"([^"]+)"/g)].map(match => match[1])

    expect(appClaims).toHaveLength(3)
    expect(widgetClaims).toEqual(appClaims)
  })

  /**
   * The reader accepts a payload only when `habits_session` names the current token, so a writer
   * that omits the tag writes a cache nothing can read: the widget discards habits the app already
   * fetched, repeats the request natively, and keeps no fallback when that request fails. The
   * service writer and the app-pushed `syncWidgetData` writer are both bound by this, and so is any
   * writer added later, which is why this sweeps every widget source rather than naming two. The
   * per-file count assertion keeps the sweep honest: a writer placed outside an
   * `edit() ... apply()` chain would otherwise slip past the tag check unseen.
   */
  it('tags every habits_json writer with the session that owns it', () => {
    const writers: string[] = []

    for (const { name, source } of widgetKotlinSources()) {
      const chains = preferenceWriteChains(source)
      const chainWrites = chains.filter(chain => chain.includes('putString("habits_json"')).length
      const fileWrites = source.split('putString("habits_json"').length - 1

      expect({ name, fileWrites }).toEqual({ name, fileWrites: chainWrites })

      for (const chain of chains) {
        if (!chain.includes('putString("habits_json"')) continue
        writers.push(name)
        expect({ name, tagged: chain.includes('putString("habits_session"') }).toEqual({
          name,
          tagged: true,
        })
      }
    }

    expect(writers.sort((left, right) => left.localeCompare(right))).toEqual([
      'OrbitWidgetModule.kt',
      'OrbitWidgetService.kt',
    ])
  })

  /**
   * The status mark is the only place a row states done, overdue or pending: the title and the due
   * time never name it, and the icon plus its colour filter carry the whole meaning. Left at
   * `@null` it is outside the accessibility tree, so the state is readable by sight alone. The name
   * comes through `tr()` like every other visible string, because the widget renders the account's
   * language from the cached payload rather than the device's resource configuration.
   */
  it('names the row status for a screen reader, in both locales', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(service).toMatch(
      /habit\.isCompleted -> R\.drawable\.widget_status_done to WidgetString\.STATUS_DONE\s*habit\.isOverdue -> R\.drawable\.widget_status_overdue to WidgetString\.STATUS_OVERDUE\s*else -> R\.drawable\.widget_status_pending to WidgetString\.STATUS_PENDING/,
    )
    expect(service).toContain(
      'views.setContentDescription(R.id.item_status_icon, tr(context, lang, description))',
    )

    const english = resourceStrings('values/widget_strings.xml')
    const portuguese = resourceStrings('values-pt-rBR/widget_strings.xml')
    for (const key of ['widget_status_done', 'widget_status_overdue', 'widget_status_pending']) {
      expect(english.get(key), `en:${key}`).toBeTruthy()
      expect(portuguese.get(key), `pt-BR:${key}`).toBeTruthy()
      expect(portuguese.get(key), `pt-BR:${key}`).not.toBe(english.get(key))
    }
  })

  it('gives the refresh control the 48dp target the drawing specifies', () => {
    const views = layoutViews()

    for (const id of ['widget_refresh', 'widget_refresh_loading']) {
      expect(views.get(id)).toMatchObject({
        'android:layout_width': '48dp',
        'android:layout_height': '48dp',
      })
    }
    expect(views.get('widget_header_container')).toMatchObject({ 'android:layout_height': '48dp' })
  })

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
    expect(provider).toContain('applySignedOutCard(context, fallback)')
    expect(provider).toMatch(
      /fun applySignedOutCard[\s\S]*?setTextViewText\(R\.id\.widget_header, "Orbit"\)[\s\S]*?R\.id\.widget_subtitle,\s*OrbitWidgetFactory\.tr\(context, lang, WidgetString\.SIGN_IN\)[\s\S]*?R\.id\.widget_empty_text,\s*OrbitWidgetFactory\.tr\(context, lang, WidgetString\.SIGN_IN\)[\s\S]*?hideRefresh\(views\)/,
    )
    expect(provider).toMatch(/if \(isSignedOut\(context\)\) \{\s*for \(id in appWidgetIds\) updateWidgetLayout/)
    expect(service).toContain('renderPlaceholder(showSkeleton = false, signedOut = true)')
    expect(service).toContain('OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)')
    expect(worker).toContain('OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)')
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

    expect(views.get('widget_refresh')).toMatchObject({
      'android:contentDescription': '@string/widget_refresh',
    })
    expect(provider).toMatch(
      /val refreshDescription = OrbitWidgetFactory\.tr\(\s*context,\s*lang,\s*WidgetString\.REFRESH\s*\)/,
    )
    expect(provider).toContain(
      'views.setContentDescription(R.id.widget_refresh, refreshDescription)',
    )
  })

  it('names every visible refresh spinner through the widget language path', () => {
    const makesSpinnerVisible =
      /setViewVisibility\(\s*R\.id\.widget_refresh_loading,[\s\S]{0,80}?(?:android\.view\.)?View\.VISIBLE/
    const namesSpinner =
      /setContentDescription\(\s*R\.id\.widget_refresh_loading,[\s\S]{0,160}?WidgetString\.REFRESHING/

    const namingSources = widgetKotlinSources().filter(({ source }) =>
      makesSpinnerVisible.test(source),
    )
    expect(namingSources.length).toBeGreaterThan(0)
    for (const { name, source } of namingSources) {
      expect(source, name).toMatch(namesSpinner)
    }

    expect(resourceStrings('values/widget_strings.xml').get('widget_refreshing')).toBe(
      'Refreshing',
    )
    expect(
      resourceStrings('values-pt-rBR/widget_strings.xml').get('widget_refreshing'),
    ).toBe('Atualizando')
  })
})

describe('Android widget habit rows', () => {
  it('keeps every row at the 48dp widget touch minimum', () => {
    const views = layoutViews('layout/widget_item.xml')

    expect(views.get('widget_item_container')).toMatchObject({
      'android:layout_height': '48dp',
    })
    expect(views.get('widget_item_content')).toMatchObject({
      'android:layout_height': '48dp',
    })
    expect(views.get('item_title')).toMatchObject({
      'android:textSize': '15sp',
    })
    expect(views.get('item_status_icon')).toMatchObject({
      'android:layout_width': '20dp',
      'android:layout_height': '20dp',
    })
  })

  it('mutes completed titles through the pre-31 enabled-state path', () => {
    const service = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetService.kt'),
      'utf8',
    )

    expect(service).toContain(
      'views.setBoolean(R.id.item_title, "setEnabled", !habit.isCompleted)',
    )
  })

  it('draws done, overdue, and pending as vector status marks', () => {
    const done = drawable('widget_status_done.xml')
    const overdue = drawable('widget_status_overdue.xml')
    const pending = drawable('widget_status_pending.xml')

    expect(done).toContain('<vector')
    expect(done).toContain('android:fillType="evenOdd"')
    expect(overdue).toContain('<vector')
    expect(overdue).toContain('android:strokeColor="@color/widget_overdue"')
    expect(pending).toContain('<vector')
    expect(pending).toContain('android:strokeColor="@color/widget_track_empty"')
  })

  it('ships localized checklist and deeper-tree labels with the complete row vocabulary', () => {
    const english = resourceStrings('values/widget_strings.xml')
    const portuguese = resourceStrings('values-pt-rBR/widget_strings.xml')
    const views = layoutViews('layout/widget_item.xml')
    const service = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetService.kt'),
      'utf8',
    )

    expect(Object.fromEntries(english)).toMatchObject({
      widget_checklist_badge: 'list %1$s',
      widget_deeper_count: '+%1$d inside',
    })
    expect(Object.fromEntries(portuguese)).toMatchObject({
      widget_checklist_badge: 'lista %1$s',
      widget_deeper_count: '+%1$d dentro',
    })
    expect(views.has('item_children_badge')).toBe(true)
    expect(views.has('item_checklist_badge')).toBe(true)
    expect(views.get('item_deeper_count')).toMatchObject({
      'android:textColor': '@color/widget_fg_3',
    })
    expect(service).toContain('deeperCount = countDescendants(child)')
    expect(service).toContain(
      'views.setViewPadding(R.id.widget_item_content, dpToPx(32), 0, dpToPx(12), 0)',
    )
  })
})
