package org.useorbit.app.widget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
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

/** Resolved v8 token colors for the active scheme + mode, synced from JS. */
data class WidgetColors(
    val primary: Int,
    val background: Int,
    val surface: Int,
    val surfaceGround: Int,
    val textPrimary: Int,
    val textMuted: Int,
    val border: Int,
    val borderMuted: Int,
    val overdue: Int,
    val streak: Int,
    val statusEmpty: Int
)

class OrbitWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var habits: List<HabitItem> = emptyList()
    private var headerLabel: String = "Today"
    private var lang: String = "en"
    private var colors: WidgetColors = defaultColors()
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

        /** Terminal color fallback (navy-dark surface) when a value is blank or malformed. */
        private const val SAFE_FALLBACK = 0xFF020618.toInt()

        // Bootstrap fallback (purple dark) for the first paint before JS syncs the
        // active scheme into SharedPreferences. The full per-scheme palette lives
        // in the app's createTokensV2 and arrives via OrbitWidgetModule.syncTheme;
        // alpha tokens arrive pre-flattened over the canvas, mirrored here.
        private val FALLBACK_COLORS = mapOf(
            "primary" to "#7f46f7",
            "background" to "#020618",
            "surface" to "#111526",
            "surfaceGround" to "#010411",
            "textPrimary" to "#f8fafc",
            "textMuted" to "#90a1b9",
            "border" to "#1b1e2f",
            "borderMuted" to "#2e3241",
            "overdue" to "#fe9a00",
            "streak" to "#fe9a00",
            "statusEmpty" to "#383c4a"
        )

        // i18n strings
        private val STRINGS = mapOf(
            "en" to mapOf(
                "today" to "Today",
                "tomorrow" to "Tomorrow",
                "habits" to "habits",
                "of" to "of",
                "completed" to "completed",
                "allClear" to "All clear!",
                "signIn" to "Open Orbit to sign in"
            ),
            "pt-BR" to mapOf(
                "today" to "Hoje",
                "tomorrow" to "Amanh\u00e3",
                "habits" to "h\u00e1bitos",
                "of" to "de",
                "completed" to "conclu\u00eddos",
                "allClear" to "Tudo feito!",
                "signIn" to "Abra o Orbit para entrar"
            )
        )

        fun tr(lang: String, key: String): String {
            return STRINGS[lang]?.get(key) ?: STRINGS["en"]?.get(key) ?: key
        }

        /** Resolves a synced token color (or its purple-dark fallback) to an ARGB int. */
        private fun readColor(prefs: android.content.SharedPreferences, token: String): Int {
            val fallback = FALLBACK_COLORS.getValue(token)
            val value = prefs.getString(OrbitWidgetModule.COLOR_KEY_PREFIX + token, fallback) ?: fallback
            return parseColor(value, fallback)
        }

        private fun fallbackColor(token: String): Int {
            val value = FALLBACK_COLORS.getValue(token)
            return parseColor(value, value)
        }

        /** Purple-dark bootstrap colors for the first paint before JS syncs the active scheme. */
        fun defaultColors(): WidgetColors = WidgetColors(
            primary = fallbackColor("primary"),
            background = fallbackColor("background"),
            surface = fallbackColor("surface"),
            surfaceGround = fallbackColor("surfaceGround"),
            textPrimary = fallbackColor("textPrimary"),
            textMuted = fallbackColor("textMuted"),
            border = fallbackColor("border"),
            borderMuted = fallbackColor("borderMuted"),
            overdue = fallbackColor("overdue"),
            streak = fallbackColor("streak"),
            statusEmpty = fallbackColor("statusEmpty")
        )

        fun getThemeColors(context: Context): WidgetColors {
            val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            return WidgetColors(
                primary = readColor(prefs, "primary"),
                background = readColor(prefs, "background"),
                surface = readColor(prefs, "surface"),
                surfaceGround = readColor(prefs, "surfaceGround"),
                textPrimary = readColor(prefs, "textPrimary"),
                textMuted = readColor(prefs, "textMuted"),
                border = readColor(prefs, "border"),
                borderMuted = readColor(prefs, "borderMuted"),
                overdue = readColor(prefs, "overdue"),
                streak = readColor(prefs, "streak"),
                statusEmpty = readColor(prefs, "statusEmpty")
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

        /** Hairline border tint for overdue rows: the overdue token at 20% alpha. */
        fun overdueBorder(overdue: Int): Int =
            Color.argb(0x33, Color.red(overdue), Color.green(overdue), Color.blue(overdue))

        /** Create flame icon bitmap tinted with the streak token (flat, single tone). */
        fun createFlameBitmap(density: Float, streakColor: Int): Bitmap {
            val w = (14 * density).toInt().coerceAtLeast(1)
            val h = (16 * density).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val sx = w / 16f
            val sy = h / 20f
            canvas.scale(sx, sy)

            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = streakColor
                style = Paint.Style.FILL
            }

            val outer = Path().apply {
                moveTo(8f, 0f)
                cubicTo(8f, 0f, 2f, 6.5f, 2f, 12f)
                arcTo(RectF(2f, 6f, 14f, 18f), 180f, -180f, false)
                cubicTo(14f, 6.5f, 8f, 0f, 8f, 0f)
                close()
            }
            canvas.drawPath(outer, paint)

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
        headerLabel = tr(lang, "today")

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
        colors = getThemeColors(context)
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
        habits = flattenHabits(widgetData.items ?: emptyList())
        headerLabel = if (widgetData.dayOffset == 1 && habits.isNotEmpty()) {
            tr(lang, "tomorrow")
        } else {
            tr(lang, "today")
        }

        // Compute completion stats
        val topLevelHabits = habits.filter { it.depth == 0 }
        val topLevelCount = topLevelHabits.size
        val completedCount = topLevelHabits.count { it.isCompleted }
        val subtitleText = "$completedCount ${tr(lang, "of")} $topLevelCount ${tr(lang, "completed")}"

        // Cache header info for the provider to read
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("header_label", headerLabel)
            .putInt("habit_count", topLevelCount)
            .putInt("completed_count", completedCount)
            .putInt("user_streak", streak)
            .putString("lang", lang)
            .apply()

        val colors = getThemeColors(context)
        val density = context.resources.displayMetrics.density
        val streakVisible = if (streak > 0) android.view.View.VISIBLE else android.view.View.GONE
        val flameBitmap = createFlameBitmap(density, colors.streak)
        updateWidgets { views ->
            views.setTextViewText(R.id.widget_header, headerLabel)
            views.setTextColor(R.id.widget_header, colors.textPrimary)
            views.setTextViewText(R.id.widget_subtitle, subtitleText)
            views.setTextColor(R.id.widget_subtitle, Color.argb(0x99, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))
            views.setTextViewText(R.id.widget_streak, "$streak")
            views.setTextColor(R.id.widget_streak, colors.textPrimary)
            views.setImageViewBitmap(R.id.widget_flame, flameBitmap)
            views.setViewVisibility(R.id.widget_flame, streakVisible)
            views.setViewVisibility(R.id.widget_streak, streakVisible)
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

    /** The widget endpoint precomputes completion for the selected day. */
    private fun isDoneForRange(habit: ApiHabit): Boolean {
        return habit.isCompleted
    }

    private fun flattenHabits(apiHabits: List<ApiHabit>): List<HabitItem> {
        val result = mutableListOf<HabitItem>()
        for (habit in apiHabits) {
            val children = habit.children ?: emptyList()
            val allChildrenDone = children.isNotEmpty() && children.all { isDoneForRange(it) }
            val done = isDoneForRange(habit) || allChildrenDone
            val childrenDone = children.count { isDoneForRange(it) }
            result.add(
                HabitItem(
                    id = habit.id,
                    title = habit.title,
                    isCompleted = done,
                    isOverdue = if (done) false else habit.isOverdue,
                    dueTime = habit.dueTime,
                    checklistChecked = habit.checklistChecked ?: 0,
                    checklistTotal = habit.checklistTotal ?: 0,
                    isBadHabit = habit.isBadHabit,
                    depth = 0,
                    hasChildren = children.isNotEmpty(),
                    childrenDone = childrenDone,
                    childrenTotal = children.size,
                    hasDeeper = false
                )
            )
            for (child in children) {
                val hasDeeper = (child.children?.isNotEmpty() == true) || (child.hasSubHabits == true)
                val childDone = isDoneForRange(child)
                result.add(
                    HabitItem(
                        id = child.id,
                        title = child.title,
                        isCompleted = childDone,
                        isOverdue = if (childDone) false else child.isOverdue,
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

        val baseSurface = Color.argb(0xDD, Color.red(colors.surface), Color.green(colors.surface), Color.blue(colors.surface))
        val bgBitmap = when {
            isChild -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(),
                colors.surfaceGround,
                12f * density
            )
            habit.isCompleted -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(),
                Color.argb(0x55, Color.red(colors.surface), Color.green(colors.surface), Color.blue(colors.surface)),
                cornerRadius
            )
            habit.isOverdue -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(),
                baseSurface,
                cornerRadius, strokeWidth, overdueBorder(colors.overdue)
            )
            else -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(),
                baseSurface,
                cornerRadius, strokeWidth, colors.borderMuted
            )
        }
        views.setImageViewBitmap(R.id.item_bg, bgBitmap)

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

        if (habit.isCompleted) {
            views.setInt(R.id.item_title, "setPaintFlags",
                Paint.STRIKE_THRU_TEXT_FLAG or Paint.ANTI_ALIAS_FLAG)
            val dimAlpha = 0x99
            views.setTextColor(R.id.item_title, Color.argb(dimAlpha, Color.red(colors.textPrimary), Color.green(colors.textPrimary), Color.blue(colors.textPrimary)))
        } else {
            views.setInt(R.id.item_title, "setPaintFlags", Paint.ANTI_ALIAS_FLAG)
            views.setTextColor(R.id.item_title, colors.textPrimary)
        }

        // Status circle vs progress badge
        if (habit.hasChildren && !habit.isCompleted) {
            views.setViewVisibility(R.id.item_status_icon, android.view.View.INVISIBLE)
            views.setViewVisibility(R.id.item_progress_badge, android.view.View.VISIBLE)
            views.setTextViewText(R.id.item_progress_badge, "${habit.childrenDone}/${habit.childrenTotal}")
            views.setTextColor(R.id.item_progress_badge, colors.textMuted)
        } else {
            views.setViewVisibility(R.id.item_status_icon, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.item_progress_badge, android.view.View.GONE)

            when {
                habit.isCompleted -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_filled)
                    views.setInt(R.id.item_status_icon, "setColorFilter", colors.primary)
                }
                habit.isOverdue -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_overdue)
                    views.setInt(R.id.item_status_icon, "setColorFilter", colors.overdue)
                }
                else -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_empty)
                    views.setInt(R.id.item_status_icon, "setColorFilter", colors.statusEmpty)
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
            views.setTextViewText(R.id.item_time, formattedTime)
            views.setViewVisibility(R.id.item_time, android.view.View.VISIBLE)
            when {
                habit.isCompleted -> views.setTextColor(R.id.item_time, Color.argb(0x44, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))
                habit.isOverdue -> views.setTextColor(R.id.item_time, Color.argb(0xCC, Color.red(colors.overdue), Color.green(colors.overdue), Color.blue(colors.overdue)))
                else -> views.setTextColor(R.id.item_time, Color.argb(0x80, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))
            }
        } else {
            views.setViewVisibility(R.id.item_time, android.view.View.GONE)
        }

        // Checklist badge
        if (habit.checklistTotal > 0) {
            views.setTextViewText(R.id.item_checklist_badge, "${habit.checklistChecked}/${habit.checklistTotal}")
            views.setViewVisibility(R.id.item_checklist_badge, android.view.View.VISIBLE)
            if (habit.isCompleted) {
                views.setTextColor(R.id.item_checklist_badge, Color.argb(0x55, Color.red(colors.primary), Color.green(colors.primary), Color.blue(colors.primary)))
            } else {
                views.setTextColor(R.id.item_checklist_badge, colors.primary)
            }
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
