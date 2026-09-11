package org.useorbit.app.widget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.google.gson.Gson
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.math.floor

class OrbitWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return OrbitWidgetFactory(
            applicationContext,
            intent.getFloatExtra(
                OrbitWidgetProvider.EXTRA_WIDGET_HEIGHT_DP,
                OrbitWidgetProvider.FOUR_BY_TWO_HEIGHT_DP
            ),
            intent.getBooleanExtra(OrbitWidgetProvider.EXTRA_SHOW_TIME, true)
        )
    }
}

internal const val HEADER_HEIGHT_DP = 48f
internal const val ROW_HEIGHT_DP = 48f
internal const val REMAINDER_HEIGHT_DP = 48f

internal data class WidgetGeometry(
    val visibleRowCount: Int,
    val remainderCount: Int,
    val canStateRemainder: Boolean
)

internal fun calculateWidgetGeometry(heightDp: Float, totalRows: Int): WidgetGeometry {
    val availableHeightDp = heightDp - HEADER_HEIGHT_DP
    val fit = maxOf(1, floor(availableHeightDp / ROW_HEIGHT_DP).toInt())
    val canStateRemainder = totalRows > fit &&
        fit >= 2 &&
        availableHeightDp - (fit - 1) * ROW_HEIGHT_DP >= REMAINDER_HEIGHT_DP
    val visibleRowCount = if (canStateRemainder) maxOf(1, fit - 1) else minOf(fit, totalRows)
    return WidgetGeometry(
        visibleRowCount = visibleRowCount,
        remainderCount = totalRows - visibleRowCount,
        canStateRemainder = canStateRemainder
    )
}

data class HabitItem(
    val id: String,
    val title: String,
    val isCompleted: Boolean,
    val isOverdue: Boolean,
    val dueTime: String?,
    val checklistChecked: Int,
    val checklistTotal: Int,
    val isBadHabit: Boolean,
    val depth: Int,
    val hasChildren: Boolean,
    val childrenDone: Int,
    val childrenTotal: Int,
    val deeperCount: Int
)

data class ApiHabit(
    val id: String,
    val title: String,
    val isCompleted: Boolean,
    val isOverdue: Boolean,
    val dueTime: String?,
    val checklistChecked: Int?,
    val checklistTotal: Int?,
    val isBadHabit: Boolean,
    val children: List<ApiHabit>?
)

data class HabitWidgetResponse(
    val dayOffset: Int,
    val language: String?,
    val currentStreak: Int?,
    val items: List<ApiHabit>?
)

internal enum class WidgetString(val resourceId: Int) {
    TODAY(R.string.widget_today),
    TOMORROW(R.string.widget_tomorrow),
    OF(R.string.widget_of),
    COMPLETED(R.string.widget_completed),
    ALL_CLEAR(R.string.widget_all_clear),
    SIGN_IN(R.string.widget_sign_in),
    STREAK_UNIT(R.string.widget_streak_unit),
    REFRESH(R.string.widget_refresh),
    REFRESHING(R.string.widget_refreshing),
    LOADING(R.string.widget_loading),
    CHECKLIST_BADGE(R.string.widget_checklist_badge),
    DEEPER_COUNT(R.string.widget_deeper_count),
    STATUS_DONE(R.string.widget_status_done),
    STATUS_OVERDUE(R.string.widget_status_overdue),
    STATUS_PENDING(R.string.widget_status_pending),
    MORE(R.string.widget_more),
    MORE_DESCRIPTION(R.string.widget_more_description)
}

internal data class WidgetDayState(
    val habits: List<HabitItem>,
    val completedCount: Int,
    val totalCount: Int,
    val isTomorrow: Boolean
)

internal fun prepareWidgetDay(apiHabits: List<ApiHabit>, dayOffset: Int): WidgetDayState {
    val isTomorrow = dayOffset == 1
    val habits = flattenHabits(apiHabits, isTomorrow)
    var totalCount = 0
    var completedCount = 0

    for (habit in habits.filter { it.depth == 0 }) {
        if (habit.hasChildren) {
            totalCount += habit.childrenTotal
            completedCount += habit.childrenDone
        } else if (!habit.isBadHabit) {
            totalCount += 1
            if (habit.isCompleted) completedCount += 1
        }
    }

    return WidgetDayState(habits, completedCount, totalCount, isTomorrow)
}

private fun flattenHabits(apiHabits: List<ApiHabit>, isTomorrow: Boolean): List<HabitItem> {
    val result = mutableListOf<HabitItem>()
    for (habit in apiHabits) {
        val children = habit.children ?: emptyList()
        val countingChildren = children.filter { !it.isBadHabit }
        val allChildrenDone = !isTomorrow && countingChildren.isNotEmpty() &&
            countingChildren.all { it.isCompleted }
        val done = !isTomorrow && (habit.isCompleted || allChildrenDone)
        val childrenDone = if (isTomorrow) 0 else countingChildren.count { it.isCompleted }
        result.add(
            HabitItem(
                id = habit.id,
                title = habit.title,
                isCompleted = done,
                isOverdue = !isTomorrow && !done && habit.isOverdue,
                dueTime = habit.dueTime,
                checklistChecked = habit.checklistChecked ?: 0,
                checklistTotal = habit.checklistTotal ?: 0,
                isBadHabit = habit.isBadHabit,
                depth = 0,
                hasChildren = children.isNotEmpty(),
                childrenDone = childrenDone,
                childrenTotal = countingChildren.size,
                deeperCount = 0
            )
        )
        for (child in children) {
            val childDone = !isTomorrow && child.isCompleted
            result.add(
                HabitItem(
                    id = child.id,
                    title = child.title,
                    isCompleted = childDone,
                    isOverdue = !isTomorrow && !childDone && child.isOverdue,
                    dueTime = child.dueTime,
                    checklistChecked = child.checklistChecked ?: 0,
                    checklistTotal = child.checklistTotal ?: 0,
                    isBadHabit = child.isBadHabit,
                    depth = 1,
                    hasChildren = false,
                    childrenDone = 0,
                    childrenTotal = 0,
                    deeperCount = countDescendants(child)
                )
            )
        }
    }
    return result
}

private fun countDescendants(habit: ApiHabit): Int {
    val children = habit.children.orEmpty()
    return children.size + children.sumOf(::countDescendants)
}

/** Resolved granted token colors for the active scheme + mode, synced from JS. */
data class WidgetColors(
    val background: Int,
    val surface: Int,
    val surfaceGround: Int,
    val textPrimary: Int,
    val textSecondary: Int,
    val textMuted: Int,
    val border: Int,
    val borderMuted: Int,
    val overdue: Int,
    val streak: Int,
    val streakText: Int,
    val statusEmpty: Int
)

data class WidgetColorModes(
    val light: WidgetColors,
    val dark: WidgetColors
)

internal fun RemoteViews.setModeAwareColor(
    viewId: Int,
    methodName: String,
    colorModes: WidgetColorModes,
    color: (WidgetColors) -> Int
) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setColorInt(viewId, methodName, color(colorModes.light), color(colorModes.dark))
    }
}

internal fun RemoteViews.setModeAwareBitmap(
    viewId: Int,
    lightBitmap: Bitmap,
    darkBitmap: Bitmap
) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setIcon(
            viewId,
            "setImageIcon",
            Icon.createWithBitmap(lightBitmap),
            Icon.createWithBitmap(darkBitmap)
        )
    }
}

class OrbitWidgetFactory(
    private val context: Context,
    private val widgetHeightDp: Float,
    private val showTime: Boolean
) : RemoteViewsService.RemoteViewsFactory {

    private var habits: List<HabitItem> = emptyList()
    private var headerLabel: String = "Today"
    private var lang: String = "en"
    private var colorModes: WidgetColorModes = defaultColorModes()
    private val gson = Gson()

    companion object {
        private const val API_BASE = "https://api.useorbit.org"
        private const val TAG = "OrbitWidget"
        private const val FRESH_WINDOW_MS = 15_000L

        // Cap rasterized background bitmaps. Android rejects a widget update whose
        // summed RemoteViews bitmap memory (card background + every inlined list-item
        // background) exceeds ~6x the screen; full-resolution rasters blew past it
        // ("exceeds maximum bitmap memory usage"). Consumer ImageViews are fitXY, so a
        // capped bitmap upscales to fill with the radius/stroke scaled to match.
        private const val MAX_BITMAP_DIMENSION = 512

        /** WHY: --bg is the terminal fallback when a synced value is malformed. */
        private const val SAFE_FALLBACK = 0xFF09090B.toInt()

        internal fun tr(
            context: Context,
            lang: String,
            string: WidgetString,
            vararg formatArgs: Any
        ): String {
            val localeTag = if (lang.startsWith("pt", ignoreCase = true)) "pt-BR" else "en"
            val configuration = Configuration(context.resources.configuration).apply {
                setLocale(Locale.forLanguageTag(localeTag))
            }
            return context.createConfigurationContext(configuration)
                .getString(string.resourceId, *formatArgs)
        }

        private fun fallbackColors(mode: String): Map<String, String> =
            if (mode == "dark") WidgetColorFallbacks.dark else WidgetColorFallbacks.light

        /** Resolves a mode-qualified synced token color to an ARGB int. */
        private fun readColor(
            prefs: android.content.SharedPreferences,
            mode: String,
            token: String
        ): Int {
            val fallback = fallbackColors(mode).getValue(token)
            val preferenceKey = "${OrbitWidgetModule.COLOR_KEY_PREFIX}${mode}_$token"
            val value = prefs.getString(preferenceKey, fallback) ?: fallback
            return parseColor(value, fallback)
        }

        private fun fallbackColor(mode: String, token: String): Int {
            val value = fallbackColors(mode).getValue(token)
            return parseColor(value, value)
        }

        private fun defaultColors(mode: String): WidgetColors {
            return WidgetColors(
                background = fallbackColor(mode, "background"),
                surface = fallbackColor(mode, "surface"),
                surfaceGround = fallbackColor(mode, "surfaceGround"),
                textPrimary = fallbackColor(mode, "textPrimary"),
                textSecondary = fallbackColor(mode, "textSecondary"),
                textMuted = fallbackColor(mode, "textMuted"),
                border = fallbackColor(mode, "border"),
                borderMuted = fallbackColor(mode, "borderMuted"),
                overdue = fallbackColor(mode, "overdue"),
                streak = fallbackColor(mode, "streak"),
                streakText = fallbackColor(mode, "streakText"),
                statusEmpty = fallbackColor(mode, "statusEmpty")
            )
        }

        /** Generated light/dark bootstrap colors for the first paint before JS syncs. */
        fun defaultColorModes(): WidgetColorModes = WidgetColorModes(
            light = defaultColors("light"),
            dark = defaultColors("dark")
        )

        private fun readColors(
            prefs: android.content.SharedPreferences,
            mode: String
        ): WidgetColors {
            return WidgetColors(
                background = readColor(prefs, mode, "background"),
                surface = readColor(prefs, mode, "surface"),
                surfaceGround = readColor(prefs, mode, "surfaceGround"),
                textPrimary = readColor(prefs, mode, "textPrimary"),
                textSecondary = readColor(prefs, mode, "textSecondary"),
                textMuted = readColor(prefs, mode, "textMuted"),
                border = readColor(prefs, mode, "border"),
                borderMuted = readColor(prefs, mode, "borderMuted"),
                overdue = readColor(prefs, mode, "overdue"),
                streak = readColor(prefs, mode, "streak"),
                streakText = readColor(prefs, mode, "streakText"),
                statusEmpty = readColor(prefs, mode, "statusEmpty")
            )
        }

        fun getThemeColorModes(context: Context): WidgetColorModes {
            val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            return WidgetColorModes(
                light = readColors(prefs, "light"),
                dark = readColors(prefs, "dark")
            )
        }

        /**
         * Parses a CSS color string (`#rrggbb`, `#aarrggbb`, or `rgba(r, g, b, a)`)
         * into an ARGB int, falling back when the value is malformed.
         */
        fun parseColor(value: String, fallback: String): Int {
            val trimmed = value.trim()
            if (trimmed.isEmpty()) {
                val trimmedFallback = fallback.trim()
                return if (trimmedFallback.isEmpty() || trimmedFallback == trimmed) {
                    SAFE_FALLBACK
                } else {
                    parseColor(trimmedFallback, "")
                }
            }
            return try {
                if (trimmed.startsWith("rgba(") || trimmed.startsWith("rgb(")) {
                    parseRgba(trimmed)
                } else {
                    Color.parseColor(trimmed)
                }
            } catch (_: Exception) {
                val trimmedFallback = fallback.trim()
                if (trimmedFallback.isEmpty() || trimmedFallback == trimmed) {
                    SAFE_FALLBACK
                } else {
                    parseColor(trimmedFallback, "")
                }
            }
        }

        private fun parseRgba(value: String): Int {
            val parts = value
                .substringAfter('(')
                .substringBefore(')')
                .split(',')
                .map { it.trim() }
            val r = parts[0].toFloat().toInt().coerceIn(0, 255)
            val g = parts[1].toFloat().toInt().coerceIn(0, 255)
            val b = parts[2].toFloat().toInt().coerceIn(0, 255)
            val a = if (parts.size > 3) (parts[3].toFloat() * 255f).toInt().coerceIn(0, 255) else 255
            return Color.argb(a, r, g, b)
        }

        fun createRoundedBitmap(
            width: Int, height: Int, color: Int,
            cornerRadius: Float, strokeWidth: Float = 0f, strokeColor: Int = 0
        ): Bitmap {
            val rawWidth = width.coerceAtLeast(1)
            val rawHeight = height.coerceAtLeast(1)
            val scale = minOf(1f, MAX_BITMAP_DIMENSION.toFloat() / maxOf(rawWidth, rawHeight))
            val safeWidth = (rawWidth * scale).toInt().coerceAtLeast(1)
            val safeHeight = (rawHeight * scale).toInt().coerceAtLeast(1)
            val scaledRadius = cornerRadius * scale
            val scaledStroke = if (strokeWidth > 0f) (strokeWidth * scale).coerceAtLeast(1f) else 0f
            val bitmap = Bitmap.createBitmap(safeWidth, safeHeight, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val drawable = GradientDrawable().apply {
                setColor(color)
                setCornerRadius(scaledRadius)
                if (scaledStroke > 0f) setStroke(scaledStroke.toInt().coerceAtLeast(1), strokeColor)
            }
            drawable.setBounds(0, 0, safeWidth, safeHeight)
            drawable.draw(canvas)
            return bitmap
        }

    }

    override fun onCreate() {}

    /**
     * Renders after a load has resolved. Recreating the RemoteAdapter during a load would reset the
     * factory, but a full render here keeps every size-keyed child current without interrupting it.
     */
    private fun renderWidgets() {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, OrbitWidgetProvider::class.java)
        )
        for (id in widgetIds) {
            OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)
        }
    }

    /**
     * Clears the habit list and restores the idle header. With showSkeleton=true the
     * loading skeleton stays up (signed in, no data yet) so the widget never paints
     * blank; with false it yields to the empty/sign-in view (signed out).
     */
    private fun renderPlaceholder(showSkeleton: Boolean, signedOut: Boolean) {
        habits = emptyList()
        lang = detectLanguage(null)
        headerLabel = tr(context, lang, WidgetString.TODAY)

        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("header_label", headerLabel)
            .putInt("habit_count", 0)
            .putInt("completed_count", 0)
            .putInt("user_streak", 0)
            .putString("lang", lang)
            .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
            .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, showSkeleton && !signedOut)
            .apply()

        // The provider owns the whole card, including signed-out copy, controls and skeleton.
        renderWidgets()
    }

    override fun onDataSetChanged() {
        try {
            loadWidgetData()
        } catch (_: Exception) {
            runCatching {
                val signedOut = OrbitWidgetProvider.isSignedOut(context)
                val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
                val showSkeleton = !signedOut && prefs.getLong("habits_updated_at", 0L) <= 0L
                prefs.edit()
                    .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
                    .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, showSkeleton)
                    .apply()
                renderWidgets()
            }
        }
    }

    private fun loadWidgetData() {
        colorModes = getThemeColorModes(context)
        val token = OrbitWidgetModule.getToken(context)
        if (token == null) {
            renderPlaceholder(showSkeleton = false, signedOut = true)
            return
        }

        val widgetData = resolveWidgetData(token)

        // resolveWidgetData can block for seconds, and everything below repopulates the cache and
        // the signed-in header, so a load must prove it still owns the session before it lands.
        // The three ways it can stop owning it are NOT the same:
        //
        //  - the token is gone: a sign-out happened, and a load started under the old session would
        //    put a logged-out person's habits back on their home screen. The sign-out wins.
        //  - a DIFFERENT ACCOUNT is signed in: returning here would leave `habits` holding the rows
        //    the previous load put there, and getViewAt would keep serving one account's habits to
        //    the next one until their own load finished. Clearing the list is the point; the
        //    skeleton is what their own load replaces.
        //  - the token changed but names the SAME account: an access-token rotation, and the person
        //    is still signed in. auth-store.ts calls saveWidgetToken after every refresh, and
        //    OrbitWidgetModule.saveToken refreshes the widgets, so a NEWER load already owns the
        //    render. This one drops silently rather than blanking a signed-in widget, and it must
        //    keep the rows on screen because they are still that person's rows.
        val currentToken = OrbitWidgetModule.getToken(context)
        if (currentToken == null) {
            renderPlaceholder(showSkeleton = false, signedOut = true)
            return
        }
        if (OrbitWidgetModule.sessionKey(currentToken) != OrbitWidgetModule.sessionKey(token)) {
            renderPlaceholder(showSkeleton = true, signedOut = false)
            return
        }
        if (currentToken != token) {
            return
        }
        // The cache is account-scoped, so even a write that landed before this check is unreadable
        // by another account. These returns only avoid rendering a result somebody else supersedes.

        if (widgetData == null) {
            renderPlaceholder(showSkeleton = true, signedOut = false)
            return
        }

        lang = detectLanguage(widgetData.language)
        val streak = widgetData.currentStreak ?: 0
        val dayState = prepareWidgetDay(widgetData.items ?: emptyList(), widgetData.dayOffset)
        habits = dayState.habits
        headerLabel = if (dayState.isTomorrow) {
            tr(context, lang, WidgetString.TOMORROW)
        } else {
            tr(context, lang, WidgetString.TODAY)
        }
        // Cache header info for the provider to read
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("header_label", headerLabel)
            .putInt("habit_count", dayState.totalCount)
            .putInt("completed_count", dayState.completedCount)
            .putInt("user_streak", streak)
            .putString("lang", lang)
            .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
            .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, false)
            .apply()

        renderWidgets()
    }

    private fun detectLanguage(language: String?): String {
        // Use language from widget API if available
        if (language != null) return language

        // Fall back to cached value
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        val cached = prefs.getString("lang", null)
        if (cached != null) return cached

        // Fall back to device locale
        val deviceLocale = Locale.getDefault().language
        return if (deviceLocale == "pt") "pt-BR" else "en"
    }

    /**
     * Returns parsed widget data, preferring a recent app-pushed cache, then a live fetch, then the
     * last cached payload. Only the network fetch can fail, so a blip or a blocked binder-thread
     * request degrades to stale data instead of a blank list. A successful fetch is cached for the
     * next cold start.
     *
     * The payload cache belongs to ONE session and says so.
     *
     * Without that, a fetch still in flight at logout writes its response back after the cache is
     * cleared, and the next account to sign in reads it as fresh and renders another person's
     * habits without ever making a request under its own token. Ordering the write against the
     * logout does not fix it either: `onDataSetChanged` is synchronized, so the replacement
     * callback simply runs after the old one has already landed.
     *
     * So ownership is recorded rather than inferred. A payload is only readable by the account that
     * produced it, whatever order the callbacks finish in. The key names the ACCOUNT rather than the
     * access token, so a silent refresh keeps the cache it just filled.
     *
     * `OrbitWidgetModule.syncWidgetData` tags its app-pushed payload with the same key, so the two
     * writers stay readable by one account and a fresh sign-in keeps the data the app already has.
     */
    private fun resolveWidgetData(token: String): HabitWidgetResponse? {
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        val session = OrbitWidgetModule.sessionKey(token)
        val cachedData = if (prefs.getString("habits_session", null) == session) {
            parseWidgetResponse(prefs.getString("habits_json", null))
        } else {
            null
        }
        val cacheAge = System.currentTimeMillis() - prefs.getLong("habits_updated_at", 0L)
        if (cachedData != null && cacheAge in 0L..FRESH_WINDOW_MS) {
            return cachedData
        }

        val freshJson = fetchWidget(token)
        val freshData = parseWidgetResponse(freshJson)
        if (freshData != null && freshJson != null) {
            prefs.edit()
                .putString("habits_json", freshJson)
                .putString("habits_session", session)
                .putLong("habits_updated_at", System.currentTimeMillis())
                .apply()
            return freshData
        }

        return cachedData
    }

    private fun parseWidgetResponse(json: String?): HabitWidgetResponse? {
        if (json.isNullOrBlank()) return null
        return try {
            gson.fromJson(json, HabitWidgetResponse::class.java)
        } catch (e: Exception) {
            Log.w(TAG, "widget parse error: ${e.javaClass.simpleName}: ${e.message}")
            null
        }
    }

    private fun fetchWidget(token: String): String? {
        return try {
            val url = URL("$API_BASE/api/habits/widget")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            val code = conn.responseCode
            if (code == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val response = reader.readText()
                reader.close()
                response
            } else {
                Log.w(TAG, "widget fetch failed with HTTP $code")
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "widget fetch error: ${e.javaClass.simpleName}: ${e.message}")
            null
        }
    }

    override fun onDestroy() {
        habits = emptyList()
    }

    override fun getCount(): Int = runCatching {
        val geometry = calculateWidgetGeometry(widgetHeightDp, habits.size)
        geometry.visibleRowCount + if (geometry.canStateRemainder) 1 else 0
    }.getOrDefault(0)

    override fun getViewAt(position: Int): RemoteViews {
        return try {
            buildItemView(position)
        } catch (_: Exception) {
            RemoteViews(context.packageName, R.layout.widget_item)
        }
    }

    private fun buildItemView(position: Int): RemoteViews {
        val geometry = calculateWidgetGeometry(widgetHeightDp, habits.size)
        if (geometry.canStateRemainder && position == geometry.visibleRowCount) {
            return buildRemainderView(geometry.remainderCount)
        }
        val views = RemoteViews(context.packageName, R.layout.widget_item)
        if (position >= geometry.visibleRowCount) return views

        val habit = habits[position]
        val isChild = habit.depth > 0
        applyItemBackground(views, habit, isChild)
        applyItemTitle(views, habit, isChild)
        applyStatusMark(views, habit)
        applyDueTime(views, habit)
        applyBadges(views, habit)

        views.setOnClickFillInIntent(R.id.widget_item_container, Intent())
        return views
    }

    private fun buildRemainderView(remainderCount: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_remainder)
        val remainderText = tr(context, lang, WidgetString.MORE, remainderCount)
        val remainderDescription = tr(
            context,
            lang,
            WidgetString.MORE_DESCRIPTION,
            remainderCount
        )
        views.setTextViewText(R.id.widget_remainder_text, remainderText)
        views.setContentDescription(R.id.widget_remainder, remainderDescription)
        views.setModeAwareColor(
            R.id.widget_remainder_text,
            "setTextColor",
            colorModes
        ) { it.textMuted }
        views.setOnClickFillInIntent(R.id.widget_remainder, Intent())
        return views
    }

    private fun applyItemBackground(views: RemoteViews, habit: HabitItem, isChild: Boolean) {
        val density = context.resources.displayMetrics.density
        val width = (context.resources.displayMetrics.widthPixels * 0.9f).toInt()
        val height = (48 * density).toInt()
        val lightBackground = createItemBackground(habit, isChild, colorModes.light, width, height)
        val darkBackground = createItemBackground(habit, isChild, colorModes.dark, width, height)
        views.setModeAwareBitmap(R.id.item_bg, lightBackground, darkBackground)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            val backgroundResource = when {
                isChild -> R.drawable.widget_item_bg_child
                habit.isCompleted -> R.drawable.widget_item_bg_completed
                else -> R.drawable.widget_item_bg_fallback
            }
            views.setImageViewResource(R.id.item_bg, backgroundResource)
        }
    }

    private fun createItemBackground(
        habit: HabitItem,
        isChild: Boolean,
        modeColors: WidgetColors,
        width: Int,
        height: Int
    ): Bitmap {
        val density = context.resources.displayMetrics.density
        if (isChild) {
            return createRoundedBitmap(width, height, modeColors.surfaceGround, 12f * density)
        }
        if (habit.isCompleted) {
            return createRoundedBitmap(width, height, modeColors.surface, 16f * density)
        }
        return createRoundedBitmap(
            width,
            height,
            modeColors.surface,
            16f * density,
            1f * density,
            modeColors.borderMuted
        )
    }

    private fun applyItemTitle(views: RemoteViews, habit: HabitItem, isChild: Boolean) {
        if (isChild) {
            views.setViewPadding(R.id.widget_item_content, dpToPx(32), 0, dpToPx(12), 0)
        } else {
            views.setViewPadding(R.id.widget_item_content, dpToPx(12), 0, dpToPx(12), 0)
        }
        views.setTextViewText(R.id.item_title, habit.title)
        views.setBoolean(R.id.item_title, "setEnabled", !habit.isCompleted)
        if (habit.isCompleted) {
            views.setModeAwareColor(R.id.item_title, "setTextColor", colorModes) { it.textMuted }
        } else {
            views.setModeAwareColor(R.id.item_title, "setTextColor", colorModes) { it.textPrimary }
        }
    }

    /**
     * The mark is the ONLY place a row says done, overdue or pending: the title and the due time
     * never name the state. So it carries an accessible name beside the icon and the colour, or the
     * state is readable by sight alone.
     *
     * The name comes through `tr()` like every other visible string, not from an `@string` in the
     * layout, because the widget renders the account's language from the cached payload rather than
     * the device's resource configuration.
     */
    private fun applyStatusMark(views: RemoteViews, habit: HabitItem) {
        val (icon, description) = when {
            habit.isCompleted -> R.drawable.widget_status_done to WidgetString.STATUS_DONE
            habit.isOverdue -> R.drawable.widget_status_overdue to WidgetString.STATUS_OVERDUE
            else -> R.drawable.widget_status_pending to WidgetString.STATUS_PENDING
        }
        views.setImageViewResource(R.id.item_status_icon, icon)
        views.setContentDescription(R.id.item_status_icon, tr(context, lang, description))
        when {
            habit.isCompleted ->
                views.setModeAwareColor(R.id.item_status_icon, "setColorFilter", colorModes) { it.textPrimary }
            habit.isOverdue ->
                views.setModeAwareColor(R.id.item_status_icon, "setColorFilter", colorModes) { it.overdue }
            else ->
                views.setModeAwareColor(R.id.item_status_icon, "setColorFilter", colorModes) { it.statusEmpty }
        }
    }

    private fun applyBadges(views: RemoteViews, habit: HabitItem) {
        if (habit.hasChildren) {
            views.setTextViewText(
                R.id.item_children_badge,
                "${habit.childrenDone}/${habit.childrenTotal}"
            )
            views.setViewVisibility(R.id.item_children_badge, android.view.View.VISIBLE)
            views.setModeAwareColor(
                R.id.item_children_badge,
                "setTextColor",
                colorModes
            ) { it.textSecondary }
        } else {
            views.setViewVisibility(R.id.item_children_badge, android.view.View.GONE)
        }
        if (habit.checklistTotal > 0) {
            val checklistProgress = "${habit.checklistChecked}/${habit.checklistTotal}"
            views.setTextViewText(
                R.id.item_checklist_badge,
                tr(context, lang, WidgetString.CHECKLIST_BADGE, checklistProgress)
            )
            views.setViewVisibility(R.id.item_checklist_badge, android.view.View.VISIBLE)
            views.setModeAwareColor(R.id.item_checklist_badge, "setTextColor", colorModes) { it.textSecondary }
        } else {
            views.setViewVisibility(R.id.item_checklist_badge, android.view.View.GONE)
        }

        if (habit.deeperCount > 0) {
            views.setTextViewText(
                R.id.item_deeper_count,
                tr(context, lang, WidgetString.DEEPER_COUNT, habit.deeperCount)
            )
            views.setViewVisibility(R.id.item_deeper_count, android.view.View.VISIBLE)
            views.setModeAwareColor(
                R.id.item_deeper_count,
                "setTextColor",
                colorModes
            ) { it.textMuted }
        } else {
            views.setViewVisibility(R.id.item_deeper_count, android.view.View.GONE)
        }
    }

    private fun applyDueTime(views: RemoteViews, habit: HabitItem) {
        if (!showTime) {
            views.setViewVisibility(R.id.item_time, android.view.View.GONE)
            views.setViewVisibility(R.id.item_time_overdue, android.view.View.GONE)
            return
        }
        val dueTime = habit.dueTime
        if (dueTime.isNullOrEmpty()) {
            views.setViewVisibility(R.id.item_time, android.view.View.GONE)
            views.setViewVisibility(R.id.item_time_overdue, android.view.View.GONE)
            return
        }

        val formattedTime = formatTime(dueTime)
        if (habit.isOverdue && !habit.isCompleted) {
            views.setTextViewText(R.id.item_time_overdue, formattedTime)
            views.setViewVisibility(R.id.item_time, android.view.View.GONE)
            views.setViewVisibility(R.id.item_time_overdue, android.view.View.VISIBLE)
            views.setModeAwareColor(
                R.id.item_time_overdue,
                "setTextColor",
                colorModes
            ) { it.overdue }
            return
        }

        views.setTextViewText(R.id.item_time, formattedTime)
        views.setViewVisibility(R.id.item_time, android.view.View.VISIBLE)
        views.setViewVisibility(R.id.item_time_overdue, android.view.View.GONE)
        views.setModeAwareColor(R.id.item_time, "setTextColor", colorModes) { it.textMuted }
    }

    private fun dpToPx(dp: Int): Int {
        return (dp * context.resources.displayMetrics.density).toInt()
    }

    private fun formatTime(time: String): String {
        val parts = time.split(":")
        return if (parts.size >= 2) "${parts[0]}:${parts[1]}" else time
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 2

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = false

}
