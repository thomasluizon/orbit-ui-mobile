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

  /**
   * The 2x2 drawing drops the streak unit at 200dp and below, and this widget does NOT, on purpose.
   * A provider cannot read the width it is rendered at: OPTION_APPWIDGET_MIN_WIDTH and MAX_WIDTH are
   * global extrema across every possible host size, and size-keyed RemoteViews, which would let the
   * host choose, break `partiallyUpdateAppWidget` because `mergeRemoteViews` does not descend into
   * sized children, so the post-sync header would go stale on API 31 and later. Ticket #490 carries
   * both halves and needs a device. Until then the unit stays and ellipsizes, which loses less than
   * a stale header. This test exists so a fourth attempt is deliberate rather than accidental.
   */
  it('decides the streak unit in the layout, never from a width the provider cannot read', () => {
    const views = layoutViews()
    const provider = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetProvider.kt'), 'utf8')
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(views.get('widget_streak_unit')).toBeDefined()
    for (const source of [provider, service]) {
      expect(source).not.toContain('setViewVisibility(R.id.widget_streak_unit')
      expect(source).not.toContain('OPTION_APPWIDGET_MIN_WIDTH')
      expect(source).not.toContain('SizeF')
    }
    expect(provider).toContain('appWidgetManager.updateAppWidget(appWidgetId, views)')
    expect(service).toContain('appWidgetManager.partiallyUpdateAppWidget(id, views)')
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
   * CHANGED token is an access-token rotation, the person is still signed in, and a newer load
   * already owns the render, so this one drops silently rather than blanking a signed-in widget.
   */
  it('drops a load whose session ended, and separately one whose token merely rotated', () => {
    const service = readFileSync(resolve(widgetSourceRoot, 'OrbitWidgetService.kt'), 'utf8')

    expect(service).toMatch(
      /val currentToken = OrbitWidgetModule\.getToken\(context\)\s*if \(currentToken == null\) \{\s*renderPlaceholder\(showSkeleton = false, signedOut = true\)\s*return\s*\}\s*if \(currentToken != token\) \{\s*return\s*\}/,
    )
    const afterFetch = service.slice(service.indexOf('val widgetData = resolveWidgetData(token)'))
    const guardAt = afterFetch.indexOf('val currentToken = OrbitWidgetModule.getToken(context)')
    const cacheAt = afterFetch.indexOf('.putInt("user_streak"')
    expect(guardAt).toBeGreaterThan(-1)
    expect(cacheAt).toBeGreaterThan(guardAt)
    expect(service).toContain('OrbitWidgetProvider.applySignedOutCard(context, views)')
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
