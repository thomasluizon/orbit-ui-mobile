package org.useorbit.app.widget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
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

class OrbitWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return OrbitWidgetFactory(applicationContext)
    }
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
    val hasDeeper: Boolean
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
    val children: List<ApiHabit>?,
    val hasSubHabits: Boolean?
)

data class HabitWidgetResponse(
    val dayOffset: Int,
    val language: String?,
    val currentStreak: Int?,
    val items: List<ApiHabit>?,
    val totalCount: Int?
)

internal enum class WidgetString(val resourceId: Int) {
    TODAY(R.string.widget_today),
    TOMORROW(R.string.widget_tomorrow),
    OF(R.string.widget_of),
    COMPLETED(R.string.widget_completed),
    ALL_CLEAR(R.string.widget_all_clear),
    SIGN_IN(R.string.widget_sign_in),
    STREAK_UNIT(R.string.widget_streak_unit)
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

    for (habit in habits.filter { it.depth == 0 && !it.isBadHabit }) {
        if (habit.hasChildren) {
            totalCount += habit.childrenTotal
            completedCount += habit.childrenDone
        } else {
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
                hasDeeper = false
            )
        )
        for (child in children) {
            val hasDeeper = (child.children?.isNotEmpty() == true) || (child.hasSubHabits == true)
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
                    hasDeeper = hasDeeper
                )
            )
        }
    }
    return result
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

class OrbitWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

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

        internal fun tr(context: Context, lang: String, string: WidgetString): String {
            val localeTag = if (lang.startsWith("pt", ignoreCase = true)) "pt-BR" else "en"
            val configuration = Configuration(context.resources.configuration).apply {
                setLocale(Locale.forLanguageTag(localeTag))
            }
            return context.createConfigurationContext(configuration).getString(string.resourceId)
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
     * Applies a partial RemoteViews update to every mounted widget. Partial (not full
     * updateWidgetLayout) on purpose: a full update recreates the RemoteAdapter and
     * resets the factory mid-load.
     */
    private fun updateWidgets(mutate: (RemoteViews) -> Unit) {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, OrbitWidgetProvider::class.java)
        )
        for (id in widgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            mutate(views)
            appWidgetManager.partiallyUpdateAppWidget(id, views)
        }
    }

    /**
     * Clears the habit list and restores the idle header. With showSkeleton=true the
     * loading skeleton stays up (signed in, no data yet) so the widget never paints
     * blank; with false it yields to the empty/sign-in view (signed out).
     */
    private fun renderPlaceholder(showSkeleton: Boolean) {
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
            .apply()

        updateWidgets { views ->
            views.setViewVisibility(R.id.widget_refresh, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.widget_refresh_loading, android.view.View.GONE)
            views.setViewVisibility(
                R.id.widget_loading,
                if (showSkeleton) android.view.View.VISIBLE else android.view.View.GONE
            )
        }
    }

    override fun onDataSetChanged() {
        try {
            loadWidgetData()
        } catch (_: Exception) {
            runCatching {
                updateWidgets { views ->
                    views.setViewVisibility(R.id.widget_refresh, android.view.View.VISIBLE)
                    views.setViewVisibility(R.id.widget_refresh_loading, android.view.View.GONE)
                }
            }
        }
    }

    private fun loadWidgetData() {
        colorModes = getThemeColorModes(context)
        val token = OrbitWidgetModule.getToken(context)
        if (token == null) {
            renderPlaceholder(showSkeleton = false)
            return
        }

        val widgetData = resolveWidgetData(token)
        if (widgetData == null) {
            renderPlaceholder(showSkeleton = true)
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
        val subtitleText = "${dayState.completedCount} " +
            "${tr(context, lang, WidgetString.OF)} ${dayState.totalCount} " +
            tr(context, lang, WidgetString.COMPLETED)

        // Cache header info for the provider to read
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("header_label", headerLabel)
            .putInt("habit_count", dayState.totalCount)
            .putInt("completed_count", dayState.completedCount)
            .putInt("user_streak", streak)
            .putString("lang", lang)
            .apply()

        val colorModes = getThemeColorModes(context)
        val streakVisible = if (streak > 0) android.view.View.VISIBLE else android.view.View.GONE
        updateWidgets { views ->
            views.setTextViewText(R.id.widget_header, headerLabel)
            views.setModeAwareColor(R.id.widget_header, "setTextColor", colorModes) { it.textPrimary }
            views.setTextViewText(R.id.widget_subtitle, subtitleText)
            views.setModeAwareColor(R.id.widget_subtitle, "setTextColor", colorModes) { it.textMuted }
            views.setTextViewText(R.id.widget_streak, "$streak")
            views.setModeAwareColor(R.id.widget_streak, "setTextColor", colorModes) { it.streak }
            views.setTextViewText(
                R.id.widget_streak_unit,
                tr(context, lang, WidgetString.STREAK_UNIT)
            )
            views.setModeAwareColor(R.id.widget_streak_unit, "setTextColor", colorModes) { it.textMuted }
            views.setViewVisibility(R.id.widget_streak_group, streakVisible)
            // Restore refresh button, hide loading spinner and skeleton
            views.setViewVisibility(R.id.widget_refresh, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.widget_refresh_loading, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_loading, android.view.View.GONE)
        }
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
     * Returns parsed widget data, preferring a recent app-pushed cache, then a
     * live fetch, then the last cached payload. Only the network fetch can fail,
     * so a blip or a blocked binder-thread request degrades to stale data instead
     * of a blank list. A successful fetch is cached for the next cold start.
     */
    private fun resolveWidgetData(token: String): HabitWidgetResponse? {
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        val cachedData = parseWidgetResponse(prefs.getString("habits_json", null))
        val cacheAge = System.currentTimeMillis() - prefs.getLong("habits_updated_at", 0L)
        if (cachedData != null && cacheAge in 0L..FRESH_WINDOW_MS) {
            return cachedData
        }

        val freshJson = fetchWidget(token)
        val freshData = parseWidgetResponse(freshJson)
        if (freshData != null && freshJson != null) {
            prefs.edit()
                .putString("habits_json", freshJson)
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

    override fun getCount(): Int = runCatching { habits.size }.getOrDefault(0)

    override fun getViewAt(position: Int): RemoteViews {
        return try {
            buildItemView(position)
        } catch (_: Exception) {
            RemoteViews(context.packageName, R.layout.widget_item)
        }
    }

    private fun buildItemView(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_item)
        if (position >= habits.size) return views

        val habit = habits[position]
        val isChild = habit.depth > 0
        val density = context.resources.displayMetrics.density

        // Item background (programmatic rounded rect bitmap)
        val bgWidth = (context.resources.displayMetrics.widthPixels * 0.9f).toInt()
        val bgHeight = (if (isChild) 40 else 44) * density
        val cornerRadius = 16f * density
        val strokeWidth = 1f * density

        fun createItemBackground(modeColors: WidgetColors): Bitmap = when {
            isChild -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(), modeColors.surfaceGround, 12f * density
            )
            habit.isCompleted -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(), modeColors.surface, cornerRadius
            )
            else -> createRoundedBitmap(
                bgWidth,
                bgHeight.toInt(),
                modeColors.surface,
                cornerRadius,
                strokeWidth,
                modeColors.borderMuted
            )
        }
        val lightBackground = createItemBackground(colorModes.light)
        val darkBackground = createItemBackground(colorModes.dark)
        views.setModeAwareBitmap(R.id.item_bg, lightBackground, darkBackground)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            val backgroundResource = when {
                isChild -> R.drawable.widget_item_bg_child
                habit.isCompleted -> R.drawable.widget_item_bg_completed
                else -> R.drawable.widget_item_bg_fallback
            }
            views.setImageViewResource(R.id.item_bg, backgroundResource)
        }

        // Indent child items
        if (isChild) {
            views.setViewPadding(R.id.widget_item_content, dpToPx(24), dpToPx(8), dpToPx(12), dpToPx(8))
        } else {
            views.setViewPadding(R.id.widget_item_content, dpToPx(12), dpToPx(11), dpToPx(12), dpToPx(11))
        }

        // Title
        val displayTitle = if (habit.hasDeeper) "${habit.title} ..." else habit.title
        views.setTextViewText(R.id.item_title, displayTitle)
        views.setFloat(R.id.item_title, "setTextSize", if (isChild) 12f else 14f)
        views.setBoolean(R.id.item_title, "setEnabled", !habit.isCompleted)

        if (habit.isCompleted) {
            views.setInt(R.id.item_title, "setPaintFlags",
                Paint.STRIKE_THRU_TEXT_FLAG or Paint.ANTI_ALIAS_FLAG)
            views.setModeAwareColor(R.id.item_title, "setTextColor", colorModes) { it.textMuted }
        } else {
            views.setInt(R.id.item_title, "setPaintFlags", Paint.ANTI_ALIAS_FLAG)
            views.setModeAwareColor(R.id.item_title, "setTextColor", colorModes) { it.textPrimary }
        }

        // Status circle vs progress badge
        if (habit.hasChildren && !habit.isCompleted) {
            views.setViewVisibility(R.id.item_status_icon, android.view.View.INVISIBLE)
            views.setViewVisibility(R.id.item_progress_badge, android.view.View.VISIBLE)
            views.setTextViewText(R.id.item_progress_badge, "${habit.childrenDone}/${habit.childrenTotal}")
            views.setModeAwareColor(R.id.item_progress_badge, "setTextColor", colorModes) { it.textSecondary }
        } else {
            views.setViewVisibility(R.id.item_status_icon, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.item_progress_badge, android.view.View.GONE)

            when {
                habit.isCompleted -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_filled)
                    views.setModeAwareColor(R.id.item_status_icon, "setColorFilter", colorModes) { it.textPrimary }
                }
                habit.isOverdue -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_overdue)
                    views.setModeAwareColor(R.id.item_status_icon, "setColorFilter", colorModes) { it.overdue }
                }
                else -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_empty)
                    views.setModeAwareColor(R.id.item_status_icon, "setColorFilter", colorModes) { it.statusEmpty }
                }
            }

            if (isChild) {
                views.setViewPadding(R.id.item_status_icon, dpToPx(3), dpToPx(3), dpToPx(3), dpToPx(3))
            } else {
                views.setViewPadding(R.id.item_status_icon, 0, 0, 0, 0)
            }
        }

        // Due time (inline below title)
        if (!habit.dueTime.isNullOrEmpty()) {
            val formattedTime = formatTime(habit.dueTime)
            val showOverdueTime = habit.isOverdue && !habit.isCompleted
            if (showOverdueTime) {
                views.setTextViewText(R.id.item_time_overdue, formattedTime)
                views.setViewVisibility(R.id.item_time, android.view.View.GONE)
                views.setViewVisibility(R.id.item_time_overdue, android.view.View.VISIBLE)
                views.setModeAwareColor(
                    R.id.item_time_overdue, "setTextColor", colorModes
                ) { it.overdue }
            } else {
                views.setTextViewText(R.id.item_time, formattedTime)
                views.setViewVisibility(R.id.item_time, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.item_time_overdue, android.view.View.GONE)
                views.setModeAwareColor(
                    R.id.item_time, "setTextColor", colorModes
                ) { it.textMuted }
            }
        } else {
            views.setViewVisibility(R.id.item_time, android.view.View.GONE)
            views.setViewVisibility(R.id.item_time_overdue, android.view.View.GONE)
        }

        // Checklist badge
        if (habit.checklistTotal > 0) {
            views.setTextViewText(R.id.item_checklist_badge, "${habit.checklistChecked}/${habit.checklistTotal}")
            views.setViewVisibility(R.id.item_checklist_badge, android.view.View.VISIBLE)
            views.setModeAwareColor(R.id.item_checklist_badge, "setTextColor", colorModes) { it.textSecondary }
        } else {
            views.setViewVisibility(R.id.item_checklist_badge, android.view.View.GONE)
        }

        // Tap opens app
        val fillInIntent = Intent()
        views.setOnClickFillInIntent(R.id.widget_item_container, fillInIntent)

        return views
    }

    private fun dpToPx(dp: Int): Int {
        return (dp * context.resources.displayMetrics.density).toInt()
    }

    private fun formatTime(time: String): String {
        val parts = time.split(":")
        return if (parts.size >= 2) "${parts[0]}:${parts[1]}" else time
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = false

}
