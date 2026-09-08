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
      'android:textColor': '@color/widget_fg_1',
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
    expect(pending).toContain('android:strokeColor="@color/widget_fg_4"')
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

describe('Android widget launcher geometry', () => {
  it('supports the four launcher sizes from one full-height layout', () => {
    const layout = layoutViews()
    const providerInfo = readFileSync(
      resolve(widgetRoot, 'xml/orbit_widget_info.xml'),
      'utf8',
    )

    expect(providerInfo).toContain('android:minWidth="336dp"')
    expect(providerInfo).toContain('android:minHeight="192dp"')
    expect(providerInfo).toContain('android:minResizeWidth="160dp"')
    expect(providerInfo).toContain('android:minResizeHeight="96dp"')
    expect(providerInfo).toContain('android:maxResizeWidth="336dp"')
    expect(providerInfo).toContain('android:maxResizeHeight="288dp"')
    expect(providerInfo).toContain('android:targetCellWidth="4"')
    expect(providerInfo).toContain('android:targetCellHeight="2"')
    expect(layout.get('widget_root')).not.toHaveProperty('android:padding')
    expect(layout.get('widget_list')).toMatchObject({
      'android:dividerHeight': '0dp',
    })
  })

  it('derives visible habits and the remainder from height geometry', () => {
    const provider = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'),
      'utf8',
    )
    const service = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetService.kt'),
      'utf8',
    )

    expect(provider).toContain('onAppWidgetOptionsChanged')
    expect(provider).toContain('EXTRA_WIDGET_HEIGHT_DP')
    expect(provider).toContain('EXTRA_WIDGET_WIDTH_DP')
    expect(service).toContain('internal fun calculateWidgetRows(')
    expect(service).toContain('val availableHeightDp = widgetHeightDp - WIDGET_HEADER_HEIGHT_DP')
    expect(service).toContain('visibleHabitCount = rowCapacity - 1')
    expect(service).toContain('R.layout.widget_remainder')
    expect(service).toContain('WidgetString.REMAINDER')
    expect(service).toContain('override fun getViewTypeCount(): Int = 2')
  })

  it('drops only the time at the narrow width and keeps the remainder on one line', () => {
    const english = resourceStrings('values/widget_strings.xml')
    const portuguese = resourceStrings('values-pt-rBR/widget_strings.xml')
    const remainder = layoutViews('layout/widget_remainder.xml')
    const service = readFileSync(
      resolve(widgetSourceRoot, 'OrbitWidgetService.kt'),
      'utf8',
    )

    expect(Object.fromEntries(english)).toMatchObject({
      widget_remainder: '%1$d more',
    })
    expect(Object.fromEntries(portuguese)).toMatchObject({
      widget_remainder: 'mais %1$d',
    })
    expect(remainder.get('widget_remainder_text')).toMatchObject({
      'android:layout_height': '24dp',
      'android:maxLines': '1',
      'android:textColor': '@color/widget_fg_3',
    })
    expect(service).toContain('internal fun shouldShowWidgetTimes(widgetWidthDp: Int)')
    expect(service).toContain('applyDueTime(views, habit, showTimes)')
  })
})
