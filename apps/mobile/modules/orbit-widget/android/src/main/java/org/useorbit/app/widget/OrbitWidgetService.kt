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
import android.graphics.PorterDuff
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.google.gson.Gson
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
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
    val checklistItems: List<ChecklistEntry>?,
    val isBadHabit: Boolean,
    val depth: Int,
    val hasChildren: Boolean,
    val childrenDone: Int,
    val childrenTotal: Int,
    val hasDeeper: Boolean
)

data class ChecklistEntry(
    val text: String,
    val isChecked: Boolean
)

data class ApiHabit(
    val id: String,
    val title: String,
    val isCompleted: Boolean,
    val isOverdue: Boolean,
    val dueTime: String?,
    val checklistItems: List<ChecklistEntry>?,
    val isBadHabit: Boolean,
    val children: List<ApiHabit>?,
    val hasSubHabits: Boolean?,
    val isLoggedInRange: Boolean?
)

data class PaginatedResponse(
    val items: List<ApiHabit>,
    val totalCount: Int
)

data class ProfileData(
    val language: String?,
    val currentStreak: Int?
)

/** Color tokens for a single theme variant (scheme + mode) */
data class WidgetColors(
    val primary: Int,
    val primaryScale400: Int,
    val background: Int,
    val surface: Int,
    val surfaceGround: Int,
    val textPrimary: Int,
    val textMuted: Int,
    val border: Int,
    val borderMuted: Int
)

class OrbitWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var habits: List<HabitItem> = emptyList()
    private var headerLabel: String = "Today"
    private var lang: String = "en"
    private var colors: WidgetColors = THEMES["purple_dark"]!!
    private val gson = Gson()

    companion object {
        private const val API_BASE = "https://api.useorbit.org"

        // Overdue colors (constant across all themes)
        private const val COLOR_OVERDUE_RED = 0xCCf87171.toInt()
        private const val COLOR_OVERDUE_BORDER = 0x33f87171.toInt()

        // All 6 color schemes x 2 theme modes
        // Values sourced from app/composables/useColorScheme.ts
        private val THEMES = mapOf(
            // --- Purple ---
            "purple_dark" to WidgetColors(
                primary = 0xFF8b5cf6.toInt(),
                primaryScale400 = 0xFFc084fc.toInt(),
                background = 0xFF07060e.toInt(),
                surface = 0xFF13111f.toInt(),
                surfaceGround = 0xFF0d0b16.toInt(),
                textPrimary = 0xFFf0eef6.toInt(),
                textMuted = 0xFF7a7490.toInt(),
                border = 0x12FFFFFF,
                borderMuted = 0x0AFFFFFF
            ),
            "purple_light" to WidgetColors(
                primary = 0xFF7c3aed.toInt(),
                primaryScale400 = 0xFFc084fc.toInt(),
                background = 0xFFf8f6ff.toInt(),
                surface = 0xFFffffff.toInt(),
                surfaceGround = 0xFFf0eef8.toInt(),
                textPrimary = 0xFF1a1625.toInt(),
                textMuted = 0xFF8a8498.toInt(),
                border = 0x14000000,
                borderMuted = 0x0A000000
            ),
            // --- Blue ---
            "blue_dark" to WidgetColors(
                primary = 0xFF3b82f6.toInt(),
                primaryScale400 = 0xFF60a5fa.toInt(),
                background = 0xFF060a10.toInt(),
                surface = 0xFF101825.toInt(),
                surfaceGround = 0xFF0a1018.toInt(),
                textPrimary = 0xFFf0eef6.toInt(),
                textMuted = 0xFF6b7d99.toInt(),
                border = 0x12FFFFFF,
                borderMuted = 0x0AFFFFFF
            ),
            "blue_light" to WidgetColors(
                primary = 0xFF2563eb.toInt(),
                primaryScale400 = 0xFF60a5fa.toInt(),
                background = 0xFFf6f8ff.toInt(),
                surface = 0xFFffffff.toInt(),
                surfaceGround = 0xFFeef2f8.toInt(),
                textPrimary = 0xFF151a25.toInt(),
                textMuted = 0xFF7d8a9e.toInt(),
                border = 0x14000000,
                borderMuted = 0x0A000000
            ),
            // --- Green ---
            "green_dark" to WidgetColors(
                primary = 0xFF22c55e.toInt(),
                primaryScale400 = 0xFF4ade80.toInt(),
                background = 0xFF060e0a.toInt(),
                surface = 0xFF101f17.toInt(),
                surfaceGround = 0xFF0a160f.toInt(),
                textPrimary = 0xFFf0eef6.toInt(),
                textMuted = 0xFF6b8d7c.toInt(),
                border = 0x12FFFFFF,
                borderMuted = 0x0AFFFFFF
            ),
            "green_light" to WidgetColors(
                primary = 0xFF16a34a.toInt(),
                primaryScale400 = 0xFF4ade80.toInt(),
                background = 0xFFf5fcf8.toInt(),
                surface = 0xFFffffff.toInt(),
                surfaceGround = 0xFFeef7f2.toInt(),
                textPrimary = 0xFF152018.toInt(),
                textMuted = 0xFF7d9a8a.toInt(),
                border = 0x14000000,
                borderMuted = 0x0A000000
            ),
            // --- Rose ---
            "rose_dark" to WidgetColors(
                primary = 0xFFf43f5e.toInt(),
                primaryScale400 = 0xFFfb7185.toInt(),
                background = 0xFF0e0608.toInt(),
                surface = 0xFF1f1014.toInt(),
                surfaceGround = 0xFF16090d.toInt(),
                textPrimary = 0xFFf0eef6.toInt(),
                textMuted = 0xFF997a88.toInt(),
                border = 0x12FFFFFF,
                borderMuted = 0x0AFFFFFF
            ),
            "rose_light" to WidgetColors(
                primary = 0xFFe11d48.toInt(),
                primaryScale400 = 0xFFfb7185.toInt(),
                background = 0xFFfef6f7.toInt(),
                surface = 0xFFffffff.toInt(),
                surfaceGround = 0xFFf8eef0.toInt(),
                textPrimary = 0xFF201518.toInt(),
                textMuted = 0xFF9a7d86.toInt(),
                border = 0x14000000,
                borderMuted = 0x0A000000
            ),
            // --- Orange ---
            "orange_dark" to WidgetColors(
                primary = 0xFFf97316.toInt(),
                primaryScale400 = 0xFFfb923c.toInt(),
                background = 0xFF0e0906.toInt(),
                surface = 0xFF1f1610.toInt(),
                surfaceGround = 0xFF160f0a.toInt(),
                textPrimary = 0xFFf0eef6.toInt(),
                textMuted = 0xFF998570.toInt(),
                border = 0x12FFFFFF,
                borderMuted = 0x0AFFFFFF
            ),
            "orange_light" to WidgetColors(
                primary = 0xFFea580c.toInt(),
                primaryScale400 = 0xFFfb923c.toInt(),
                background = 0xFFfef8f5.toInt(),
                surface = 0xFFffffff.toInt(),
                surfaceGround = 0xFFf8f0ec.toInt(),
                textPrimary = 0xFF201810.toInt(),
                textMuted = 0xFF9a8878.toInt(),
                border = 0x14000000,
                borderMuted = 0x0A000000
            ),
            // --- Cyan ---
            "cyan_dark" to WidgetColors(
                primary = 0xFF06b6d4.toInt(),
                primaryScale400 = 0xFF22d3ee.toInt(),
                background = 0xFF060c0e.toInt(),
                surface = 0xFF101e22.toInt(),
                surfaceGround = 0xFF0a1416.toInt(),
                textPrimary = 0xFFf0eef6.toInt(),
                textMuted = 0xFF6b8e99.toInt(),
                border = 0x12FFFFFF,
                borderMuted = 0x0AFFFFFF
            ),
            "cyan_light" to WidgetColors(
                primary = 0xFF0891b2.toInt(),
                primaryScale400 = 0xFF22d3ee.toInt(),
                background = 0xFFf5fbfd.toInt(),
                surface = 0xFFffffff.toInt(),
                surfaceGround = 0xFFeef6f8.toInt(),
                textPrimary = 0xFF151e20.toInt(),
                textMuted = 0xFF7d9aa2.toInt(),
                border = 0x14000000,
                borderMuted = 0x0A000000
            )
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

        fun getThemeColors(context: Context): WidgetColors {
            val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            val scheme = prefs.getString("color_scheme", "purple") ?: "purple"
            val mode = prefs.getString("theme_mode", "dark") ?: "dark"
            return THEMES["${scheme}_${mode}"] ?: THEMES["purple_dark"]!!
        }

        fun createRoundedBitmap(
            width: Int, height: Int, color: Int,
            cornerRadius: Float, strokeWidth: Float = 0f, strokeColor: Int = 0
        ): Bitmap {
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val drawable = GradientDrawable().apply {
                setColor(color)
                setCornerRadius(cornerRadius)
                if (strokeWidth > 0f) setStroke(strokeWidth.toInt(), strokeColor)
            }
            drawable.setBounds(0, 0, width, height)
            drawable.draw(canvas)
            return bitmap
        }

        fun createGradientBitmap(
            width: Int, height: Int, colors: IntArray,
            cornerRadius: Float,
            orientation: GradientDrawable.Orientation = GradientDrawable.Orientation.TOP_BOTTOM,
            strokeWidth: Float = 0f, strokeColor: Int = 0
        ): Bitmap {
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val drawable = GradientDrawable(orientation, colors).apply {
                setCornerRadius(cornerRadius)
                if (strokeWidth > 0f) setStroke(strokeWidth.toInt(), strokeColor)
            }
            drawable.setBounds(0, 0, width, height)
            drawable.draw(canvas)
            return bitmap
        }

        /** Blend RGB channels of base toward overlay by fraction, preserving base alpha */
        fun blendColor(base: Int, overlay: Int, fraction: Float): Int {
            val a = Color.alpha(base)
            val r = (Color.red(base) * (1 - fraction) + Color.red(overlay) * fraction).toInt().coerceIn(0, 255)
            val g = (Color.green(base) * (1 - fraction) + Color.green(overlay) * fraction).toInt().coerceIn(0, 255)
            val b = (Color.blue(base) * (1 - fraction) + Color.blue(overlay) * fraction).toInt().coerceIn(0, 255)
            return Color.argb(a, r, g, b)
        }

        /** Create flame icon bitmap programmatically (avoids vector drawable inflation issues) */
        fun createFlameBitmap(density: Float): Bitmap {
            val w = (14 * density).toInt().coerceAtLeast(1)
            val h = (16 * density).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val sx = w / 16f
            val sy = h / 20f
            canvas.scale(sx, sy)

            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xFFf97316.toInt()
                style = Paint.Style.FILL
            }

            // Outer flame shape
            val outer = Path().apply {
                moveTo(8f, 0f)
                cubicTo(8f, 0f, 2f, 6.5f, 2f, 12f)
                arcTo(RectF(2f, 6f, 14f, 18f), 180f, -180f, false)
                cubicTo(14f, 6.5f, 8f, 0f, 8f, 0f)
                close()
            }
            canvas.drawPath(outer, paint)

            // Inner highlight (lighter)
            val inner = Path().apply {
                moveTo(8f, 17f)
                arcTo(RectF(5f, 11f, 11f, 17f), 90f, 180f, false)
                cubicTo(5f, 12f, 8f, 8.5f, 8f, 8.5f)
                cubicTo(8f, 8.5f, 11f, 12f, 11f, 14f)
                arcTo(RectF(5f, 11f, 11f, 17f), 0f, 90f, false)
                close()
            }
            paint.color = 0xFFfbbf24.toInt()
            canvas.drawPath(inner, paint)

            return bitmap
        }
    }

    override fun onCreate() {}

    override fun onDataSetChanged() {
        // Load theme colors
        colors = getThemeColors(context)
        val token = OrbitWidgetModule.getToken(context)
        if (token == null) {
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

            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, OrbitWidgetProvider::class.java)
            )
            for (id in widgetIds) {
                val views = RemoteViews(context.packageName, R.layout.widget_layout)
                views.setViewVisibility(R.id.widget_refresh, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.widget_refresh_loading, android.view.View.GONE)
                appWidgetManager.partiallyUpdateAppWidget(id, views)
            }
            return
        }

        // Fetch profile once (language + streak)
        val profileData = fetchProfile(token)
        lang = detectLanguage(profileData)
        val streak = profileData?.currentStreak ?: 0

        val today = getDateString(0)
        val result = fetchHabits(token, today, today)
        habits = flattenHabits(result?.items ?: emptyList())

        // Switch to tomorrow if today has no habits OR all are completed
        val allDone = habits.isNotEmpty() && habits.filter { it.depth == 0 }.all { it.isCompleted }

        if (habits.isEmpty() || allDone) {
            val tomorrow = getDateString(1)
            val tomorrowResult = fetchHabits(token, tomorrow, tomorrow)
            val tomorrowHabits = flattenHabits(tomorrowResult?.items ?: emptyList())
            if (tomorrowHabits.isNotEmpty()) {
                habits = tomorrowHabits
                headerLabel = tr(lang, "tomorrow")
            } else {
                // No tomorrow habits either -- show empty "today" state
                habits = emptyList()
                headerLabel = tr(lang, "today")
            }
        } else {
            headerLabel = tr(lang, "today")
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

        // Partial update for header text only (do NOT call updateWidgetLayout here
        // as it recreates the RemoteAdapter, causing Android to reset the factory)
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, OrbitWidgetProvider::class.java)
        )
        val colors = getThemeColors(context)
        val density = context.resources.displayMetrics.density
        val streakVisible = if (streak > 0) android.view.View.VISIBLE else android.view.View.GONE
        val flameBitmap = createFlameBitmap(density)
        for (id in widgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            views.setTextViewText(R.id.widget_header, headerLabel)
            views.setTextColor(R.id.widget_header, colors.textPrimary)
            views.setTextViewText(R.id.widget_subtitle, subtitleText)
            views.setTextColor(R.id.widget_subtitle, Color.argb(0x99, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))
            views.setTextViewText(R.id.widget_streak, "$streak")
            views.setImageViewBitmap(R.id.widget_flame, flameBitmap)
            views.setViewVisibility(R.id.widget_flame, streakVisible)
            views.setViewVisibility(R.id.widget_streak, streakVisible)
            // Restore refresh button, hide loading spinner
            views.setViewVisibility(R.id.widget_refresh, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.widget_refresh_loading, android.view.View.GONE)
            appWidgetManager.partiallyUpdateAppWidget(id, views)
        }
    }

    private fun detectLanguage(profileData: ProfileData?): String {
        // Use language from profile API if available
        if (profileData?.language != null) return profileData.language

        // Fall back to cached value
        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        val cached = prefs.getString("lang", null)
        if (cached != null) return cached

        // Fall back to device locale
        val deviceLocale = Locale.getDefault().language
        return if (deviceLocale == "pt") "pt-BR" else "en"
    }

    private fun fetchProfile(token: String): ProfileData? {
        return try {
            val url = URL("$API_BASE/api/profile")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val response = reader.readText()
                reader.close()
                gson.fromJson(response, ProfileData::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    /** Matches frontend HabitCard: isDoneForRange = isCompleted || isLoggedInRange */
    private fun isDoneForRange(habit: ApiHabit): Boolean {
        return habit.isCompleted || habit.isLoggedInRange == true
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
                    checklistItems = habit.checklistItems,
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
                        checklistItems = child.checklistItems,
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

    override fun getCount(): Int = habits.size

    override fun getViewAt(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_item)
        if (position >= habits.size) return views

        val habit = habits[position]
        val isChild = habit.depth > 0
        val density = context.resources.displayMetrics.density

        // Item background (programmatic rounded rect bitmap)
        val bgWidth = (context.resources.displayMetrics.widthPixels * 0.9f).toInt()
        val bgHeight = (if (isChild) 40 else 44) * density
        val cornerRadius = 14f * density
        val strokeWidth = 1f * density

        val baseSurface = Color.argb(0xDD, Color.red(colors.surface), Color.green(colors.surface), Color.blue(colors.surface))
        val bgBitmap = when {
            isChild -> createGradientBitmap(
                bgWidth, bgHeight.toInt(),
                intArrayOf(colors.surfaceGround, blendColor(colors.surfaceGround, colors.primary, 0.04f)),
                10f * density, GradientDrawable.Orientation.LEFT_RIGHT
            )
            habit.isCompleted -> createRoundedBitmap(
                bgWidth, bgHeight.toInt(),
                Color.argb(0x55, Color.red(colors.surface), Color.green(colors.surface), Color.blue(colors.surface)),
                cornerRadius
            )
            habit.isOverdue -> createGradientBitmap(
                bgWidth, bgHeight.toInt(),
                intArrayOf(blendColor(baseSurface, 0xFFf87171.toInt(), 0.04f), baseSurface),
                cornerRadius, GradientDrawable.Orientation.LEFT_RIGHT,
                strokeWidth, COLOR_OVERDUE_BORDER
            )
            else -> createGradientBitmap(
                bgWidth, bgHeight.toInt(),
                intArrayOf(blendColor(baseSurface, colors.primary, 0.04f), baseSurface),
                cornerRadius, GradientDrawable.Orientation.LEFT_RIGHT,
                strokeWidth, colors.borderMuted
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
            views.setTextColor(R.id.item_progress_badge, colors.primaryScale400)
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
                    views.setInt(R.id.item_status_icon, "setColorFilter", 0xFFf87171.toInt())
                }
                else -> {
                    views.setImageViewResource(R.id.item_status_icon, R.drawable.widget_circle_empty)
                    views.setInt(R.id.item_status_icon, "setColorFilter", colors.textPrimary)
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
                habit.isOverdue -> views.setTextColor(R.id.item_time, COLOR_OVERDUE_RED)
                else -> views.setTextColor(R.id.item_time, Color.argb(0x80, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))
            }
        } else {
            views.setViewVisibility(R.id.item_time, android.view.View.GONE)
        }

        // Checklist badge
        val checklist = habit.checklistItems
        if (!checklist.isNullOrEmpty()) {
            val checked = checklist.count { it.isChecked }
            views.setTextViewText(R.id.item_checklist_badge, "$checked/${checklist.size}")
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

    private fun fetchHabits(token: String, dateFrom: String, dateTo: String): PaginatedResponse? {
        return try {
            val url = URL("$API_BASE/api/habits?dateFrom=$dateFrom&dateTo=$dateTo&includeOverdue=true&pageSize=50")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            conn.connectTimeout = 10000
            conn.readTimeout = 10000

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val response = reader.readText()
                reader.close()
                gson.fromJson(response, PaginatedResponse::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun getDateString(daysFromToday: Int): String {
        val calendar = Calendar.getInstance()
        calendar.add(Calendar.DAY_OF_YEAR, daysFromToday)
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        return formatter.format(calendar.time)
    }
}
