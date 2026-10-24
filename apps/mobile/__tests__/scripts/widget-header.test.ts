import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SaxesParser } from 'saxes'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  PICKER_PREVIEW_FIXTURE,
  PICKER_PREVIEW_OUTPUTS,
  buildWidgetPreviewSvgs,
} from '../../scripts/generate-widget-preview'

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

/** Scopes source assertions to one Kotlin block so another call site cannot satisfy them. */
function kotlinBlockBody(source: string, start: number) {
  if (start < 0) throw new Error('Missing Kotlin block')
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  throw new Error('Unbalanced braces in Kotlin block')
}

function kotlinFunctionBody(source: string, name: string) {
  const declaration = source.search(new RegExp(`(?:(?:private|internal) )?fun ${name}\\(`))
  if (declaration < 0) throw new Error(`Missing Kotlin function: ${name}`)
  return kotlinBlockBody(source, declaration)
}

function expectDeferredWidgetRender(service: string) {
  const changed = kotlinFunctionBody(service, 'onDataSetChanged')
  const render = kotlinFunctionBody(service, 'renderWidgets')
  const queued = kotlinBlockBody(render, render.indexOf('OrbitWidgetModule.enqueueWidgetUpdate'))

  expect(changed).toMatch(/val previousCardState = cardState\(\)\s*try \{\s*loadWidgetData\(\)/)
  expect(changed).toMatch(/if \(cardState\(\) != previousCardState\) renderWidgets\(\)\s*$/)
  expect(changed.match(/renderWidgets\(\)/g)).toHaveLength(1)
  expect(render).toMatch(/^\s*OrbitWidgetModule\.enqueueWidgetUpdate \{[\s\S]*\}\s*$/)
  expect(queued).toContain('OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)')
  expect(service).not.toContain('partiallyUpdateAppWidget(')
  expect(service).not.toContain('notifyAppWidgetViewDataChanged(')
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

function layoutViews(relativePath = 'layout/widget_layout.xml', resolveDimensions = true) {
  const dimensions = new Map([...readFileSync(resolve(widgetRoot, 'values/widget_dimens.xml'), 'utf8')
    .matchAll(/<dimen name="([^"]+)">([^<]+)<\/dimen>/g)].map(match => [match[1], match[2]]))
  const views = new Map<string, Record<string, string>>()
  const parser = new SaxesParser()

  parser.on('opentag', tag => {
    if (tag.name === 'include') {
      const included = String(tag.attributes.layout).replace('@layout/', 'layout/') + '.xml'
      for (const [id, attributes] of layoutViews(included, resolveDimensions)) views.set(id, attributes)
    }
    const id = tag.attributes['android:id']
    if (id) {
      views.set(
        String(id).replace('@+id/', ''),
        Object.fromEntries(
          Object.entries(tag.attributes).map(([name, value]) => [name,
            resolveDimensions && String(value).startsWith('@dimen/')
              ? dimensions.get(String(value).slice(7)) ?? String(value)
              : String(value),
          ]),
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

it('uses the drawn widget time and empty-message sizes', () => {
  const items = layoutViews('layout/widget_item.xml')
  expect(items.get('item_time')?.['android:textSize']).toBe('12sp')
  expect(items.get('item_time_overdue')?.['android:textSize']).toBe('12sp')
  expect(layoutViews().get('widget_empty_text')?.['android:textSize']).toBe('15sp')
})

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

describe('Android widget first paint', () => {
  it('renders a body before the provider or adapter has supplied a payload', () => {
    const views = layoutViews()
    expect(views.get('widget_content')?.['android:visibility']).not.toBe('gone')
    expect(views.get('widget_loading')?.['android:visibility']).toBe('visible')
    expect(views.get('widget_content')?.['android:minHeight']).toBe('48dp')
  })

  it('reserves one drawn body row even in the shortest supported size', () => {
    const dimensions = readFileSync(resolve(widgetRoot, 'values/widget_dimens.xml'), 'utf8')
    expect(dimensions).toContain('<dimen name="widget_row_height">48dp</dimen>')
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    expect(kotlinFunctionBody(provider, 'buildWidgetViews')).not.toContain('if (compact) View.GONE')
  })
})

describe('Android widget content sizing', () => {
  it('uses a 48dp header followed immediately by full-width rows', () => {
    const views = layoutViews()
    expect(views.get('widget_root')?.['android:padding']).toBe('0dp')
    expect(views.get('widget_content')?.['android:layout_marginTop']).toBe('0dp')
    expect(views.get('widget_list')?.['android:dividerHeight']).toBe('0dp')
    expect(views.get('widget_header_height')?.['android:height']).toBe('48dp')
    expect(views.has('widget_header_divider')).toBe(true)
    expect(views.has('widget_progress_ring')).toBe(false)
  })

  it.each([
    ['values', 'day', 'days'],
    ['values-pt-rBR', 'dia', 'dias'],
  ])('selects singular and plural streak units in %s', (directory, singular, plural) => {
    const source = readFileSync(resolve(widgetRoot, directory, 'widget_strings.xml'), 'utf8')
    expect(source).toContain('<plurals name="widget_streak_unit">')
    expect(source).toContain(`<item quantity="one">${singular}</item>`)
    expect(source).toContain(`<item quantity="other">${plural}</item>`)
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    expect(kotlinFunctionBody(provider, 'buildWidgetViews')).toContain('OrbitWidgetFactory.streakUnit(context, lang, streak)')
  })

  it('keeps the same row vocabulary and a 48dp refresh target at every size', () => {
    const views = layoutViews()
    for (const control of ['widget_refresh', 'widget_refresh_loading']) {
      expect(views.get(control)).toMatchObject({
        'android:layout_width': '48dp', 'android:layout_height': '48dp',
      })
    }
    expect(layoutViews('layout/widget_item.xml').get('widget_item_content')).toMatchObject({
      'android:paddingStart': '12dp', 'android:paddingEnd': '12dp',
      'android:paddingTop': '0dp', 'android:paddingBottom': '0dp',
    })
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    expect(provider).not.toContain('widget_layout_compact')
    expect(provider).not.toContain('widget_layout_narrow')
    expect(provider).not.toContain('widget_next_habit')
  })

  it('fills the launcher slot with the drawn card', () => {
    expect(rootAttributes('layout/widget_layout.xml')['android:layout_height']).toBe('match_parent')
  })

  it('drops due times in the narrow widget as drawn', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    expect(kotlinFunctionBody(service, 'applyDueTime')).toContain(
      'widgetWidthDp <= OrbitWidgetProvider.STREAK_UNIT_BREAKPOINT_DP',
    )
  })

})

describe('Android widget header', () => {
  it('places the narrow streak below the day without consuming its label width', () => {
    const views = layoutViews('layout/widget_header_stacked.xml')
    expect(views.get('widget_header_right')).toMatchObject({
      'android:layout_height': 'wrap_content',
    })
    expect(views.get('widget_header_height')?.['android:height']).toBe('48dp')
    expect(views.get('widget_header')?.['android:maxLines']).toBe('2')
    const hierarchy: string[] = []
    const parents = new Map<string, string | undefined>()
    let nextNodeIndex = 0
    const parser = new SaxesParser()
    parser.on('opentag', tag => {
      const id = String(tag.attributes['android:id'] ?? `node-${nextNodeIndex++}`)
      parents.set(id, hierarchy.at(-1))
      hierarchy.push(id)
    })
    parser.on('closetag', () => { hierarchy.pop() })
    parser.write(readFileSync(resolve(widgetRoot, 'layout/widget_header_stacked.xml'), 'utf8')).close()
    expect(parents.get('@+id/widget_streak_group')).toBe(parents.get('@+id/widget_subtitle'))
    expect(parents.get('@+id/widget_streak_group')).not.toBe('@+id/widget_header_right')
  })

  it('ships the complete header copy in English and Brazilian Portuguese', () => {
    const english = resourceStrings('values/widget_strings.xml')
    const portuguese = resourceStrings('values-pt-rBR/widget_strings.xml')

    expect(Object.fromEntries(english)).toMatchObject({
      widget_today: 'Today',
      widget_tomorrow: 'Tomorrow',
      widget_of: 'of',
      widget_completed: 'completed',
      widget_all_clear: 'All clear',
      widget_nothing_scheduled: 'Nothing scheduled',
      widget_refresh: 'Refresh',
    })
    expect(Object.fromEntries(portuguese)).toMatchObject({
      widget_today: 'Hoje',
      widget_tomorrow: 'Amanhã',
      widget_of: 'de',
      widget_completed: 'concluídos',
      widget_all_clear: 'Tudo feito',
      widget_nothing_scheduled: 'Nada agendado',
      widget_refresh: 'Atualizar',
    })
  })

  it('selects empty copy from the payload reason with the completed case as fallback', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const emptyWidgetString = kotlinFunctionBody(service, 'emptyWidgetString')
    const loadWidgetData = kotlinFunctionBody(service, 'loadWidgetData')
    const buildWidgetViews = kotlinFunctionBody(provider, 'buildWidgetViews')

    expect(service).toContain('val emptyReason: String? = null')
    expect(emptyWidgetString).toMatch(
      /"nothing-scheduled" -> WidgetString\.NOTHING_SCHEDULED/,
    )
    expect(emptyWidgetString).toContain('else -> WidgetString.ALL_CLEAR')
    expect(loadWidgetData).toContain('.putString("empty_reason", widgetData.emptyReason)')
    expect(buildWidgetViews).toContain(
      'val emptyReason = prefs.getString("empty_reason", null)',
    )
    expect(buildWidgetViews).toContain('emptyWidgetString(emptyReason)')
  })

  it('renders a compact two-line header with one accent element', () => {
    const views = layoutViews()

    expect(views.get('widget_header_container')).toMatchObject({
      'android:layout_height': 'wrap_content',
    })
    expect(views.get('widget_header')).toMatchObject({
      'android:textAllCaps': 'false',
      'android:textColor': '@color/widget_fg_3',
      'android:textSize': '13sp',
    })
    expect(views.get('widget_subtitle')).toMatchObject({
      'android:maxLines': '1',
      'android:textColor': '@color/widget_fg_3',
      'android:textSize': '12sp',
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

  it('hides a zero streak without reserving its group and shows a positive streak', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const buildWidgetViews = kotlinFunctionBody(provider, 'buildWidgetViews')

    expect(buildWidgetViews).toContain(
      'val streakVisible = if (streak > 0) View.VISIBLE else View.GONE',
    )
    expect(buildWidgetViews).toContain(
      'views.setViewVisibility(R.id.widget_streak_group, streakVisible)',
    )
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
      parser.on('opentag', tag => { if (tag.name !== 'include') tags.push(tag.name) })
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
      /if \(Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.S\) \{\s*return buildWidgetViews\([\s\S]*?View\.VISIBLE,\s*bgHeight \/ context\.resources\.displayMetrics\.density,\s*bgWidth \/ context\.resources\.displayMetrics\.density\s*\)\s*\}/,
    )
    expect(provider).toMatch(
      /val compactViews = buildWidgetViews\([\s\S]*?View\.GONE,\s*FOUR_BY_ONE_HEIGHT_DP\s*\)/,
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
      /val fourByOneViews = buildWidgetViews\([\s\S]*?View\.VISIBLE,\s*FOUR_BY_ONE_HEIGHT_DP\s*\)/,
    )
    expect.soft(provider).toContain(
      'SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, FOUR_BY_ONE_HEIGHT_DP) to fourByOneViews',
    )
    expect.soft(provider).toContain(
      'SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, FOUR_BY_TWO_HEIGHT_DP) to fourByTwoViews',
    )
    expect.soft(provider).toMatch(
      /val fourByThreeViews = buildWidgetViews\([\s\S]*?View\.VISIBLE,\s*FOUR_BY_THREE_HEIGHT_DP\s*\)/,
    )
    expect.soft(provider).toContain(
      'SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, FOUR_BY_THREE_HEIGHT_DP) to fourByThreeViews',
    )
    expect.soft(provider).toMatch(
      /val twoByTwoViews = buildWidgetViews\([\s\S]*?View\.GONE,\s*TWO_BY_TWO_HEIGHT_DP\s*\)/,
    )
    expect.soft(provider).toContain(
      'SizeF(NARROW_WIDTH_DP, TWO_BY_TWO_HEIGHT_DP) to twoByTwoViews',
    )
    expect.soft(provider).toMatch(
      /putExtra\(EXTRA_WIDGET_HEIGHT_DP, widgetHeightDp\)\s*putExtra\(EXTRA_WIDGET_WIDTH_DP, widgetWidthDp\)\s*data = Uri\.parse\(toUri\(Intent\.URI_INTENT_SCHEME\)\)/,
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
    const views = layoutViews()

    const geometry = readFileSync(resolve(widgetSourceRoot, 'WidgetGeometry.kt'), 'utf8')
    expect(geometry).toContain('heightDp - headerHeightDp')
    expect(geometry).toContain('floor(contentHeight / rowHeightDp)')
    expect(geometry).toContain('if (canStateRemainder) fit - 1')
    for (const index of [1, 2, 3, 4, 5]) {
      expect.soft(views.get(`widget_skeleton_${index}`)).toMatchObject({
        'android:layout_height': '48dp',
        'android:gravity': 'center_vertical',
        'android:orientation': 'horizontal',
      })
    }
  })

  it('counts parents by non-bad children, good leaves as one, and bad leaves as nothing', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const prepareWidgetDay = kotlinFunctionBody(service, 'prepareWidgetDay')

    expect(prepareWidgetDay).toMatch(
      /for \(habit in habits\.filter \{ it\.depth == 0 \}\) \{\s*if \(habit\.childrenTotal > 0\) \{\s*totalCount \+= habit\.childrenTotal\s*completedCount \+= habit\.childrenDone\s*\} else if \(!habit\.isBadHabit\) \{\s*totalCount \+= 1\s*if \(habit\.isCompleted\) completedCount \+= 1/,
    )
  })

  it('counts a good parent itself when all its children are bad habits', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const prepareWidgetDay = kotlinFunctionBody(service, 'prepareWidgetDay')

    expect(prepareWidgetDay).toMatch(
      /if \(habit\.childrenTotal > 0\) \{[\s\S]*?\} else if \(!habit\.isBadHabit\) \{\s*totalCount \+= 1\s*if \(habit\.isCompleted\) completedCount \+= 1/,
    )
    expect(prepareWidgetDay).not.toContain('if (habit.hasChildren)')
  })

  it('draws each first-load row as a placeholder mark and name bar', () => {
    const layout = readFileSync(resolve(widgetRoot, 'layout/widget_body.xml'), 'utf8')
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

  it('keeps cached rows and cache metadata when a refresh fetch fails', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const resolveWidgetData = kotlinFunctionBody(service, 'resolveWidgetData')
    const loadWidgetData = kotlinFunctionBody(service, 'loadWidgetData')
    const cacheWrites = preferenceWriteChains(resolveWidgetData)

    expect(cacheWrites).toHaveLength(1)
    expect(cacheWrites[0]).toContain('.putString("habits_json", freshJson)')
    expect(cacheWrites[0]).toContain('.putString("habits_session", session)')
    expect(cacheWrites[0]).toContain('.putLong("habits_updated_at", System.currentTimeMillis())')
    expect(resolveWidgetData).toMatch(
      /if \(freshData != null && freshJson != null\) \{[\s\S]*?\.apply\(\)\s*return freshData\s*\}\s*return cachedData\s*$/,
    )
    expect(loadWidgetData).toMatch(
      /val widgetData = resolveWidgetData\(token\)[\s\S]*?if \(widgetData == null\) \{\s*renderPlaceholder\(\)\s*return\s*\}[\s\S]*?habits = dayState\.habits[\s\S]*?\.putString\("header_label", headerLabel\)[\s\S]*?\.apply\(\)/,
    )
    expectDeferredWidgetRender(service)
  })

  it('renders an accessible remainder item and retains time on every variant', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const remainder = layoutViews('layout/widget_remainder.xml')

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
    expect.soft(kotlinFunctionBody(service, 'applyDueTime')).not.toContain('showTime')
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

  it('keeps a static picker preview on every supported Android version', async () => {
    const provider = rootAttributes('xml/orbit_widget_info.xml')
    const generator = readFileSync(resolve(process.cwd(), 'scripts/generate-widget-preview.ts'), 'utf8')

    expect(provider['android:previewImage']).toBe('@drawable/widget_picker_preview')
    expect(provider['android:previewLayout']).toBeUndefined()
    expect(PICKER_PREVIEW_FIXTURE).toMatchObject({
      width: 336,
      height: 192,
      rows: [
        { nameKey: 'widget_preview_done_name', status: 'done' },
        { nameKey: 'widget_preview_overdue_name', status: 'overdue' },
        { nameKey: 'widget_preview_pending_name', status: 'pending' },
      ],
    })
    expect.soft(generator).toContain("dimension('widget_inset_card')")
    expect.soft(generator).toContain('fixture.rows.slice(0, rowCount)')

    const requiredCopy = PICKER_PREVIEW_FIXTURE.rows.map(row => row.nameKey)
    for (const resourcePath of [
      'values/widget_strings.xml',
      'values-pt-rBR/widget_strings.xml',
    ]) {
      const strings = resourceStrings(resourcePath)
      for (const name of requiredCopy) expect(strings.get(name), `${resourcePath}:${name}`).toBeTruthy()
    }

    expect(PICKER_PREVIEW_OUTPUTS.map(output => output.directory)).toEqual([
      'drawable-xxxhdpi',
      'drawable-night-xxxhdpi',
      'drawable-pt-rBR-xxxhdpi',
      'drawable-pt-rBR-night-xxxhdpi',
    ])
    for (const output of PICKER_PREVIEW_OUTPUTS) {
      const previewPath = resolve(widgetRoot, output.directory, 'widget_picker_preview.png')
      const metadata = await sharp(previewPath).metadata()
      expect(metadata).toMatchObject({ format: 'png', width: 1344, height: 768 })
    }
  })

  it('matches the reproducible SVG source for every picker preview', async () => {
    for (const { output, svg } of await buildWidgetPreviewSvgs()) {
      expect(svg).toMatchSnapshot(output.directory)
    }
  })

  it('routes every post-sync header and loading mutation through the full provider render', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const worker = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetRefreshTimeoutWorker.kt'),
      'utf8',
    )
    const cardState = kotlinFunctionBody(service, 'cardState')

    for (const key of [
      'header_label',
      'row_count',
      'habit_count',
      'completed_count',
      'user_streak',
      'lang',
      'empty_reason',
      'habits_updated_at',
    ]) {
      expect(provider).toContain(`"${key}"`)
      expect(service).toContain(`"${key}"`)
      expect(cardState).toContain(`"${key}"`)
    }
    expect(cardState).toContain('prefs.getString(renderSessionKey, null)')
    for (const key of ['CACHE_REFRESHING', 'CACHE_LOADING_SKELETON']) {
      expect(provider).toContain(`getBoolean(${key}`)
      expect(service).toContain(`putBoolean(OrbitWidgetProvider.${key}`)
      expect(worker).toContain(`putBoolean(OrbitWidgetProvider.${key}`)
      expect(cardState).toContain(`getBoolean(OrbitWidgetProvider.${key}`)
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
    expect(kotlinFunctionBody(service, 'loadWidgetData')).toMatch(
      /\.putBoolean\(OrbitWidgetProvider\.CACHE_LOADING_SKELETON, false\)\s*\.apply\(\)\s*\}\s*$/,
    )
    expectDeferredWidgetRender(service)
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
      /fun applyOpenAppActions\(context: Context, views: RemoteViews\)[\s\S]*?setPendingIntentTemplate\(R\.id\.widget_list, openApp\)[\s\S]*?for \(target in OPEN_APP_TARGETS\) views\.setOnClickPendingIntent\(target, openApp\)/,
    )
    for (const target of ['widget_root', 'widget_header_container', 'widget_header', 'widget_empty', 'widget_loading']) {
      expect(provider).toContain(`R.id.${target},`)
    }
    expect(provider).toMatch(
      /val fallback = RemoteViews\(context\.packageName, R\.layout\.widget_layout\)\s*applyOpenAppActions\(context, fallback\)/,
    )
    expect(provider).toContain('applyOpenAppActions(context, views)')
    expect(provider).toContain('views.setViewVisibility(R.id.widget_empty, View.VISIBLE)')
    expect(provider).not.toContain('setEmptyView(')
    expect(provider).toContain('if (signedOut || (!showSkeleton && rowCount == 0)) View.VISIBLE else View.GONE')
  })


  it('drops a load whose session ended or account changed and keeps a rotation', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(service).toMatch(
      /val currentToken = OrbitWidgetModule\.getToken\(context\)\s*if \(currentToken == null\) \{\s*habits = emptyList\(\)\s*habitsSession = null\s*return\s*\}\s*if \(OrbitWidgetModule\.sessionKey\(currentToken\) != OrbitWidgetModule\.sessionKey\(token\)\) \{\s*habits = emptyList\(\)\s*habitsSession = null\s*return\s*\}\s*if \(currentToken != token\) \{\s*return\s*\}/,
    )
    expect(service).toMatch(/private fun renderPlaceholder\([^)]*\) \{\s*habits = emptyList\(\)/)

    const afterFetch = service.slice(service.indexOf('val widgetData = resolveWidgetData(token)'))
    const guardAt = afterFetch.indexOf('val currentToken = OrbitWidgetModule.getToken(context)')
    const cacheAt = afterFetch.indexOf('.putInt("user_streak"')
    expect(guardAt).toBeGreaterThan(-1)
    expect(cacheAt).toBeGreaterThan(guardAt)
    const placeholder = kotlinFunctionBody(service, 'renderPlaceholder')
    expect(placeholder).toContain('.remove(renderSessionKey)')
    expect(placeholder).not.toContain('renderWidgets()')
    expectDeferredWidgetRender(service)
  })

  it('hides old rows and header while the next account load is blocked', () => {
    const module = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const saveToken = kotlinBlockBody(module, module.indexOf('AsyncFunction("saveToken")'))
    const accountState = readFileSync(resolve(widgetSourceRoot, 'WidgetAccountState.kt'), 'utf8')
    const replaceAccount = kotlinFunctionBody(accountState, 'replaceAccount')
    const buildWidgetViews = kotlinFunctionBody(provider, 'buildWidgetViews')
    const loadWidgetData = kotlinFunctionBody(service, 'loadWidgetData')

    expect(saveToken).toContain('WidgetAccountState(accountRenderLock, widgetPublisher)')
    expect(saveToken).toContain('saveToken = { getEncryptedPrefs(context).edit().putString(KEY_TOKEN, token).apply() }')
    expect(saveToken).toContain('clearCache = { clearWidgetCache(context) }')
    expect(saveToken).toContain('repaint = { refreshWidgetsInBackground(context) }')
    expect(replaceAccount).toMatch(/if \(session == null \|\| currentSession\(\) != session\) clearCache\(\)\s*saveToken\(\)\s*\}\s*repaint\(\)/)
    expect(buildWidgetViews).toContain('renderSessionKey(appWidgetId, widgetHeightDp)')
    expect(buildWidgetViews).toContain('OrbitWidgetModule.sessionKey')
    expect(buildWidgetViews).toMatch(/views\.setViewVisibility\(R\.id\.widget_list, if \(ownsRows && !showSkeleton && rowCount > 0\) View\.VISIBLE else View\.GONE\)/)
    expect(buildWidgetViews).toMatch(/val headerLabel = if \(ownsRows\)/)
    expect(provider).toContain('fallback.setViewVisibility(R.id.widget_list, View.GONE)')
    expect(loadWidgetData).toContain('.putString(renderSessionKey, OrbitWidgetModule.sessionKey(token))')
    expect(loadWidgetData).toMatch(/\.putBoolean\(OrbitWidgetProvider\.CACHE_LOADING_SKELETON, false\)\s*\.apply\(\)\s*\}\s*$/)
    expectDeferredWidgetRender(service)
    expect(service).toContain('.remove(renderSessionKey)')
    expect(service).toMatch(/override fun getCount\(\): Int = runCatching \{\s*if \(habitsSession != OrbitWidgetModule\.getToken/)
    expect(service).toMatch(/private fun buildItemView\(position: Int\): RemoteViews \{\s*if \(habitsSession != OrbitWidgetModule\.getToken/)
  })

  it('keeps a blocked widget hidden when another factory finishes loading', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const buildWidgetViews = kotlinFunctionBody(provider, 'buildWidgetViews')
    const loadWidgetData = kotlinFunctionBody(service, 'loadWidgetData')
    const keyTemplate = provider.match(
      /fun renderSessionKey\(appWidgetId: Int, widgetHeightDp: Float\): String =\s*"([^"]+)"/,
    )?.[1]

    expect(keyTemplate).toBe('render_session_${appWidgetId}_${widgetHeightDp}')
    if (!keyTemplate) throw new Error('Missing adapter readiness key')
    const renderSessionKey = (widgetId: number, height: number) => keyTemplate
      .replace('${appWidgetId}', String(widgetId))
      .replace('${widgetHeightDp}', String(height))
    const readySessions = new Map([[renderSessionKey(101, 192), 'account-b']])

    expect(readySessions.get(renderSessionKey(101, 192))).toBe('account-b')
    expect(readySessions.get(renderSessionKey(202, 192))).toBeUndefined()
    expect(readySessions.get(renderSessionKey(101, 96))).toBeUndefined()
    readySessions.delete(renderSessionKey(202, 192))
    expect(readySessions.get(renderSessionKey(101, 192))).toBe('account-b')
    expect(service).toContain('intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)')
    expect(service).toContain('OrbitWidgetProvider.renderSessionKey(appWidgetId, widgetHeightDp)')
    expect(loadWidgetData).toContain('.putString(renderSessionKey, OrbitWidgetModule.sessionKey(token))')
    expect(buildWidgetViews).toMatch(/prefs\.getString\(\s*renderSessionKey\(appWidgetId, widgetHeightDp\), null\s*\)/)
    expect(buildWidgetViews).not.toContain('prefs.getString("render_session", null)')
    const renderPlaceholder = kotlinFunctionBody(service, 'renderPlaceholder')
    expect(renderPlaceholder).toContain('.remove(renderSessionKey)')
    expect(renderPlaceholder).not.toContain('CACHE_LOADING_SKELETON')
    expect(renderPlaceholder).not.toContain('.putString("header_label"')
  })

  it('serializes provider publication with account token changes', () => {
    const module = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const publisher = readFileSync(resolve(widgetSourceRoot, 'WidgetPublisher.kt'), 'utf8')
    const accountState = readFileSync(resolve(widgetSourceRoot, 'WidgetAccountState.kt'), 'utf8')
    const update = kotlinFunctionBody(provider, 'updateWidgetLayout')
    const publish = kotlinFunctionBody(publisher, '<Views> publish').replace(/\/\/[^\n]*/g, '')
    const wait = kotlinFunctionBody(publisher, 'runAndWait')
    const replace = kotlinFunctionBody(accountState, 'replaceAccount')
    const transition = kotlinBlockBody(replace, replace.indexOf('publisher.runAndWait'))
    const tokenWrite = kotlinBlockBody(transition, transition.indexOf('synchronized(lock)'))
    const save = kotlinBlockBody(module, module.indexOf('AsyncFunction("saveToken")'))
    const clear = kotlinBlockBody(module, module.indexOf('AsyncFunction("clearToken")'))

    expect(module).toContain('val widgetPublisher = WidgetPublisher(accountRenderLock)')
    const builds = [...update.matchAll(/OrbitWidgetModule\.widgetPublisher\.publish\(\s*build = \{ ([^\n]+) \},\s*publishViews = \{ views -> appWidgetManager\.updateAppWidget\(appWidgetId, views\) \}/g)]
    expect(builds.map(match => match[1])).toEqual([
      'renderWidget(context, appWidgetManager, appWidgetId)',
      'buildFallbackViews(context)',
    ])
    expect(publish).toContain('check(publishing.get() == true)')
    expect(publish).toContain('check(!Thread.holdsLock(accountLock))')
    expect(publish).toMatch(/val views = synchronized\(accountLock\) \{ build\(\) \}\s*publishViews\(views\)\s*$/)
    expect(wait).toContain('check(publishing.get() != true)')
    expect(wait).toContain('check(!Thread.holdsLock(accountLock))')
    expect(wait).toContain('enqueue(action = action).get()')
    expect(tokenWrite).toMatch(/if \(session == null \|\| currentSession\(\) != session\) clearCache\(\)\s*saveToken\(\)/)
    expect(transition).toMatch(/synchronized\(lock\) \{[\s\S]*\}\s*repaint\(\)\s*$/)
    for (const callback of [save, clear]) {
      expect(callback).toContain('WidgetAccountState(accountRenderLock, widgetPublisher)')
      expect(callback).toContain('.replaceAccount(')
      expect(callback).toContain('clearCache = { clearWidgetCache(context) }')
      expect(callback).toContain('repaint = { refreshWidgetsInBackground(context) }')
      expect(callback).not.toContain('refreshWidgets(context)')
    }
    expect(save).toContain('saveToken = { getEncryptedPrefs(context).edit().putString(KEY_TOKEN, token).apply() }')
    expect(clear).toContain('saveToken = { getEncryptedPrefs(context).edit().remove(KEY_TOKEN).apply() }')
  })

  it('dispatches every widget bridge call on its own serial queue', () => {
    const module = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')
    expect(module).toContain('private val moduleQueue = CoroutineScope(Executors.newSingleThreadExecutor().asCoroutineDispatcher() + SupervisorJob())')
    for (const name of ['saveToken', 'clearToken', 'syncTheme', 'syncWidgetData']) {
      const start = module.indexOf(`AsyncFunction("${name}")`)
      const body = kotlinBlockBody(module, start)
      const after = module.slice(start + module.slice(start).indexOf(body) + body.length + 1)
      expect(after.trimStart().startsWith('.runOnQueue(moduleQueue)')).toBe(true)
    }
  })

  it('keeps a newer render when an older factory resumes after an account switch', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const load = kotlinFunctionBody(service, 'loadWidgetData')
    const afterFetch = load.slice(load.indexOf('val widgetData = resolveWidgetData(token)'))
    const publication = kotlinBlockBody(afterFetch, afterFetch.indexOf('synchronized(OrbitWidgetModule.accountRenderLock)'))
    const differentAccount = kotlinBlockBody(
      publication,
      publication.indexOf('if (OrbitWidgetModule.sessionKey(currentToken) != OrbitWidgetModule.sessionKey(token))'),
    )

    expect(load).toMatch(/val token = synchronized\(OrbitWidgetModule\.accountRenderLock\) \{[\s\S]*if \(currentToken == null\) \{\s*renderPlaceholder\(\)/)
    expect(publication).toContain('val currentToken = OrbitWidgetModule.getToken(context)')
    expect(publication).toContain('.putString(renderSessionKey, OrbitWidgetModule.sessionKey(token))')
    expect(publication).not.toContain('renderWidgets()')
    expect(differentAccount).toContain('habits = emptyList()')
    expect(differentAccount).toContain('habitsSession = null')
    expect(differentAccount).toContain('return')
    expect(differentAccount).not.toContain('.putString(')
    expect(differentAccount).not.toContain('renderPlaceholder(')
    expect(differentAccount).not.toContain('renderWidgets()')
    expectDeferredWidgetRender(service)
  })

  /**
   * The drawing's touch note: "Android's minimum is 48dp, not 44, so every tappable region here is
   * 48 tall." The header around the refresh opens Orbit, so a short refresh does not merely miss the
   * floor, it hands near-edge taps to a different action.
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


  it('takes cache ownership from the calling account, not the token current at write time', () => {
    const widgetModule = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetModule.kt'), 'utf8')

    expect(widgetModule).toMatch(
      /AsyncFunction\("syncWidgetData"\) \{ json: String, token: String\? ->/,
    )
    expect(widgetModule).not.toMatch(/token\s*\?:\s*getToken\(context\)/)
    expect(widgetModule).toMatch(
      /if \(token != null\) \{\s*val session = sessionKey\(token\)\s*if \(getToken\(context\)\?\.let \{ sessionKey\(it\) \} == session\) \{\s*context\.getSharedPreferences\(CACHE_PREFS_NAME, Context\.MODE_PRIVATE\)\s*\.edit\(\)\s*\.putString\("habits_json", json\)\s*\.putString\("habits_session", session\)/,
    )
    expect(widgetModule).toMatch(
      /\.digest\(\(accountId\(token\) \?: token\)\.toByteArray\(Charsets\.UTF_8\)\)/,
    )
    const nativeSync = widgetModule.slice(
      widgetModule.indexOf('AsyncFunction("syncWidgetData")'),
      widgetModule.indexOf('OnActivityEntersBackground'),
    )
    expect(nativeSync).toMatch(/\n      \}\n      refreshWidgets\(context\)/)

    const caller = readFileSync(resolve(process.cwd(), 'lib/orbit-widget.ts'), 'utf8')
    const sync = caller.slice(caller.indexOf('export async function syncWidgetData'))

    expect(sync).toContain(
      'const { data, authorizingToken } = await apiClientWithAuthorizingToken<unknown>(',
    )
    expect(sync).toContain('await widgetModule.syncWidgetData(JSON.stringify(data), authorizingToken)')
    expect(sync).not.toMatch(/syncWidgetData\(JSON\.stringify\(data\), token\)/)
  })

  it('formats row times with the clock preference from the owning account payload', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    expect(service).toContain('val uses24HourClock: Boolean? = null')
    expect(kotlinFunctionBody(service, 'loadWidgetData')).toContain('uses24HourClock = widgetData.uses24HourClock')
    expect(kotlinFunctionBody(service, 'applyDueTime')).toContain('formatWidgetTime(dueTime, uses24HourClock, Locale.forLanguageTag(lang))')
    expect(kotlinFunctionBody(service, 'formatWidgetTime')).toContain('if (uses24HourClock != false)')
  })

  it('keeps the binary palette for legacy theme calls and uses qualified colors for redesign calls', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')
    const colors = kotlinFunctionBody(service, 'readColor')
    expect(colors).toContain('if (!prefs.getBoolean("theme_mode_preferences", false)) return fallbackColor(mode, token)')
    expect(colors).toContain('"${OrbitWidgetModule.COLOR_KEY_PREFIX}${mode}_$token"')
    expect(service).toContain('if (mode == "dark") WidgetColorFallbacks.dark else WidgetColorFallbacks.light')
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
    expect(views.get('widget_header_height')).toMatchObject({ 'android:height': '48dp' })
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
    expect(kotlinFunctionBody(provider, 'hideRefresh')).toContain('views.setViewVisibility(R.id.widget_header_right, View.GONE)')
    expect(kotlinFunctionBody(provider, 'applyRefreshingState')).toContain('views.setViewVisibility(R.id.widget_header_right, View.VISIBLE)')
    expect(provider).toContain('applySignedOutCard(context, fallback)')
    expect(provider).toMatch(
      /fun applySignedOutCard[\s\S]*?setTextViewText\(R\.id\.widget_header, "Orbit"\)[\s\S]*?R\.id\.widget_subtitle,\s*OrbitWidgetFactory\.tr\(context, lang, WidgetString\.SIGN_IN\)[\s\S]*?R\.id\.widget_empty_text,\s*OrbitWidgetFactory\.tr\(context, lang, WidgetString\.SIGN_IN\)[\s\S]*?hideRefresh\(views\)/,
    )
    expect(provider).toMatch(/if \(isSignedOut\(context\)\) \{\s*for \(id in appWidgetIds\) updateWidgetLayout/)
    expect(service).toContain('renderPlaceholder()')
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

  it('overwrites the retained subtitle description on signed-out reapplication', () => {
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const signedInRender = kotlinFunctionBody(provider, 'buildWidgetViews')
    const signedOutRender = kotlinFunctionBody(provider, 'applySignedOutCard')

    expect(signedInRender).toContain('applyProgressSummary(context, views, lang, widgetWidthDp, syncedOnce,')
    expect(kotlinFunctionBody(provider, 'applyProgressSummary')).toContain(
      'views.setContentDescription(R.id.widget_subtitle, subtitleText)',
    )
    expect(signedInRender).toContain('applySignedOutCard(context, views)')
    expect(provider).toContain('applySignedOutCard(context, fallback)')
    for (const setter of ['setTextViewText', 'setContentDescription']) {
      expect(signedOutRender).toContain(
        `views.${setter}(\n                R.id.widget_subtitle,\n                OrbitWidgetFactory.tr(context, lang, WidgetString.SIGN_IN)\n            )`,
      )
    }
    expect(resourceStrings('values/widget_strings.xml').get('widget_sign_in'))
      .toBe('Open Orbit to sign in')
    expect(resourceStrings('values-pt-rBR/widget_strings.xml').get('widget_sign_in'))
      .toBe('Abra o Orbit para entrar')
  })

  it('keeps the static refresh name and replaces it through the widget language path', () => {
    const views = layoutViews()
    const provider = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'),
      'utf8',
    )

    expect(views.get('widget_refresh')).toMatchObject({
      'android:contentDescription': '@string/widget_refresh',
      'android:accessibilityLiveRegion': 'polite',
    })
    expect(provider).toMatch(
      /val refreshDescription = OrbitWidgetFactory\.tr\(\s*context,\s*lang,\s*WidgetString\.REFRESH\s*\)/,
    )
    expect(provider).toContain(
      'views.setContentDescription(R.id.widget_refresh, refreshDescription)',
    )
  })

  it('names every visible refresh spinner through the widget language path', () => {
    expect(layoutViews().get('widget_refresh_loading')).toMatchObject({
      'android:accessibilityLiveRegion': 'polite',
    })

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
  it('uses the drawn 48dp row with room for a title and time', () => {
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
      'views.setViewPadding(R.id.widget_item_content, start, block, inline, block)',
    )
  })
})
