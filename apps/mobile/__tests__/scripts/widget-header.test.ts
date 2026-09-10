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
