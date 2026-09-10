package org.useorbit.app.widget
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.Locale
import java.util.concurrent.TimeUnit

class OrbitWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_REFRESH = "org.useorbit.app.widget.ACTION_REFRESH"
        private const val WORK_NAME = "orbit_widget_sync"
        private const val REFRESH_TIMEOUT_WORK_NAME = "orbit_widget_refresh_timeout"
        private const val WIDGET_REFRESH_TIMEOUT_MS = 12_000L
        private const val STREAK_UNIT_BREAKPOINT_DP = 200f
        internal const val CACHE_REFRESHING = "refresh_loading"
        internal const val CACHE_LOADING_SKELETON = "loading_skeleton"
        // Every region that opens the app. The whole card is one tap target, per the drawing's
        // touch note, and only the refresh is its own.
        private val OPEN_APP_TARGETS = intArrayOf(
            R.id.widget_root,
            R.id.widget_header_container,
            R.id.widget_header,
            R.id.widget_empty,
            R.id.widget_loading
        )

        fun updateWidgetLayout(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            try {
                renderWidget(context, appWidgetManager, appWidgetId)
            } catch (_: Exception) {
                runCatching {
                    val fallback = RemoteViews(context.packageName, R.layout.widget_layout)
                    applyOpenAppActions(context, fallback)
                    if (isSignedOut(context)) {
                        applySignedOutCard(context, fallback)
                    } else {
                        showRefresh(fallback)
                    }
                    appWidgetManager.updateAppWidget(appWidgetId, fallback)
                }
            }
        }

        /** Signed out: no refresh and no spinner. Every signed-out path goes through here. */
        fun hideRefresh(views: RemoteViews) {
            views.setViewVisibility(R.id.widget_refresh, View.GONE)
            views.setViewVisibility(R.id.widget_refresh_loading, View.GONE)
        }

        /** Signed in and idle: the refresh returns and its spinner goes. */
        fun showRefresh(views: RemoteViews) {
            views.setViewVisibility(R.id.widget_refresh, View.VISIBLE)
            views.setViewVisibility(R.id.widget_refresh_loading, View.GONE)
        }

        fun isSignedOut(context: Context): Boolean = OrbitWidgetModule.getToken(context) == null

        // The WHOLE signed-out card. A fresh RemoteViews starts on the layout's own defaults, which
        // are the signed-in widget_today and widget_all_clear strings, so a render that fails after
        // sign-out would otherwise paint a control-free card that still reads as signed in.
        // updateAppWidget submits a COMPLETE representation and the host may inflate it rather than
        // reapply it over the last one, so a card that only mutates text inherits no actions and no
        // empty view. Every full submission goes through here.
        // https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/appwidget/AppWidgetManager.java
        fun applyOpenAppActions(context: Context, views: RemoteViews) {
            val openAppIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://app.useorbit.org"))
            val openApp = PendingIntent.getActivity(
                context, 0, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setEmptyView(R.id.widget_list, R.id.widget_empty)
            views.setPendingIntentTemplate(R.id.widget_list, openApp)
            for (target in OPEN_APP_TARGETS) views.setOnClickPendingIntent(target, openApp)
        }

        fun applySignedOutCard(context: Context, views: RemoteViews) {
            val lang = cachedLanguage(context)
            views.setTextViewText(R.id.widget_header, "Orbit")
            views.setTextViewText(
                R.id.widget_subtitle,
                OrbitWidgetFactory.tr(context, lang, WidgetString.SIGN_IN)
            )
            views.setTextViewText(
                R.id.widget_empty_text,
                OrbitWidgetFactory.tr(context, lang, WidgetString.SIGN_IN)
            )
            views.setViewVisibility(R.id.widget_streak_group, View.GONE)
            views.setViewVisibility(R.id.widget_loading, View.GONE)
            // The list is empty when signed out, so the empty view is what the card actually shows.
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            hideRefresh(views)
        }

        fun cachedLanguage(context: Context): String {
            val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            return prefs.getString("lang", null)
                ?: if (Locale.getDefault().language == "pt") "pt-BR" else "en"
        }

        private fun renderWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val density = context.resources.displayMetrics.density
            val displayMetrics = context.resources.displayMetrics
            val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
            val maxWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0)
            val maxHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
            val bgWidth = (if (maxWidthDp > 0) (maxWidthDp * density).toInt() else displayMetrics.widthPixels)
                .coerceIn(1, displayMetrics.widthPixels)
            val bgHeight = (if (maxHeightDp > 0) (maxHeightDp * density).toInt() else displayMetrics.heightPixels / 2)
                .coerceIn(1, displayMetrics.heightPixels / 2)

            val views = buildWidgetRemoteViews(
                context,
                appWidgetId,
                bgWidth,
                bgHeight,
                isSignedOut(context)
            )
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        /**
         * API 31 lets the host choose a RemoteViews child for the size it is rendering. The 1dp
         * height makes width the only meaningful threshold: at 200dp only the compact key fits,
         * while any wider host also fits the 201dp key and selects that closer variant. Older hosts
         * receive the existing single layout and deliberately keep the localized unit visible.
         */
        internal fun buildWidgetRemoteViews(
            context: Context,
            appWidgetId: Int,
            bgWidth: Int,
            bgHeight: Int,
            signedOut: Boolean
        ): RemoteViews {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                return buildWidgetViews(
                    context,
                    appWidgetId,
                    bgWidth,
                    bgHeight,
                    signedOut,
                    View.VISIBLE
                )
            }

            val compactViews = buildWidgetViews(
                context,
                appWidgetId,
                bgWidth,
                bgHeight,
                signedOut,
                View.GONE
            )
            val expandedViews = buildWidgetViews(
                context,
                appWidgetId,
                bgWidth,
                bgHeight,
                signedOut,
                View.VISIBLE
            )
            return RemoteViews(
                mapOf(
                    SizeF(STREAK_UNIT_BREAKPOINT_DP, 1f) to compactViews,
                    SizeF(STREAK_UNIT_BREAKPOINT_DP + 1f, 1f) to expandedViews
                )
            )
        }

        private fun buildWidgetViews(
            context: Context,
            appWidgetId: Int,
            bgWidth: Int,
            bgHeight: Int,
            signedOut: Boolean,
            streakUnitVisibility: Int
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            val colorModes = OrbitWidgetFactory.getThemeColorModes(context)
            val density = context.resources.displayMetrics.density

            // Widget background: flat surface with a hairline border (lift, not gradient).
            val lightBackground = OrbitWidgetFactory.createRoundedBitmap(
                bgWidth, bgHeight, colorModes.light.background,
                24f * density, 1f * density, colorModes.light.border
            )
            val darkBackground = OrbitWidgetFactory.createRoundedBitmap(
                bgWidth, bgHeight, colorModes.dark.background,
                24f * density, 1f * density, colorModes.dark.border
            )
            views.setModeAwareBitmap(R.id.widget_bg, lightBackground, darkBackground)

            // Read cached header from SharedPreferences
            val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            val lang = cachedLanguage(context)
            val headerLabel = prefs.getString("header_label", null)
                ?: OrbitWidgetFactory.tr(context, lang, WidgetString.TODAY)
            val habitCount = prefs.getInt("habit_count", 0)
            val completedCount = prefs.getInt("completed_count", 0)
            val streak = prefs.getInt("user_streak", 0)
            val syncedOnce = prefs.getLong("habits_updated_at", 0L) > 0L
            val refreshing = prefs.getBoolean(CACHE_REFRESHING, false)
            val showSkeleton = prefs.getBoolean(CACHE_LOADING_SKELETON, !syncedOnce)

            // Apply dynamic text colors
            // The drawing renders the day label in fg-3 and the subtitle below it in fg-4. fg-4
            // measures 2.83 dark and 3.48 light as 11sp text against a 4.5 floor, so the subtitle
            // stays on fg-3: the drawn step survives as size and weight, which is how this system
            // separates a label from its value on a raised surface.
            views.setModeAwareColor(R.id.widget_header, "setTextColor", colorModes) { it.textMuted }
            views.setModeAwareColor(R.id.widget_subtitle, "setTextColor", colorModes) { it.textMuted }
            views.setModeAwareColor(R.id.widget_empty_text, "setTextColor", colorModes) { it.textPrimary }
            views.setModeAwareColor(R.id.widget_streak_unit, "setTextColor", colorModes) { it.textMuted }
            views.setViewVisibility(R.id.widget_streak_unit, streakUnitVisibility)

            // Refresh icon tint
            views.setModeAwareColor(R.id.widget_refresh, "setColorFilter", colorModes) { it.textMuted }
            val refreshDescription = OrbitWidgetFactory.tr(
                context,
                lang,
                WidgetString.REFRESH
            )
            views.setContentDescription(R.id.widget_refresh, refreshDescription)
            views.setContentDescription(
                R.id.widget_refresh_loading,
                OrbitWidgetFactory.tr(context, lang, WidgetString.REFRESHING)
            )

            views.setModeAwareColor(R.id.widget_streak, "setTextColor", colorModes) { it.streak }
            if (signedOut) {
                // The drawn signed-out card carries no control at all: its one action is the whole
                // card, and a refresh that cannot sign anyone in is a control that does not work.
                applySignedOutCard(context, views)
            } else {
                views.setTextViewText(R.id.widget_header, headerLabel)
                val subtitleText = if (syncedOnce) {
                    "$completedCount ${OrbitWidgetFactory.tr(context, lang, WidgetString.OF)} " +
                        "$habitCount ${OrbitWidgetFactory.tr(context, lang, WidgetString.COMPLETED)}"
                } else {
                    ""
                }
                views.setTextViewText(R.id.widget_subtitle, subtitleText)
                val streakVisible = if (streak > 0) View.VISIBLE else View.GONE
                views.setTextViewText(R.id.widget_streak, "$streak")
                views.setTextViewText(
                    R.id.widget_streak_unit,
                    OrbitWidgetFactory.tr(context, lang, WidgetString.STREAK_UNIT)
                )
                views.setViewVisibility(R.id.widget_streak_group, streakVisible)
                views.setTextViewText(
                    R.id.widget_empty_text,
                    OrbitWidgetFactory.tr(context, lang, WidgetString.ALL_CLEAR)
                )
                if (refreshing) {
                    views.setViewVisibility(R.id.widget_refresh, View.GONE)
                    views.setViewVisibility(R.id.widget_refresh_loading, View.VISIBLE)
                } else {
                    showRefresh(views)
                }
            }

            views.setViewVisibility(
                R.id.widget_loading,
                if (!signedOut && showSkeleton) View.VISIBLE else View.GONE
            )

            // Set up the RemoteViews adapter for the list
            val serviceIntent = Intent(context, OrbitWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.widget_list, serviceIntent)

            // The empty-view relation and every open-app target, shared with the render fallback.
            applyOpenAppActions(context, views)

            // Refresh button triggers data reload
            val refreshIntent = Intent(context, OrbitWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 1, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)
            return views
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidgetLayout(context, appWidgetManager, appWidgetId)
        }
        // Trigger data refresh (not just layout rebuild) on periodic updates
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        if (intent.action == ACTION_REFRESH) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(
                android.content.ComponentName(context, OrbitWidgetProvider::class.java)
            )
            // Show loading spinner immediately, unless there is nothing to refresh
            if (isSignedOut(context)) {
                for (id in appWidgetIds) updateWidgetLayout(context, appWidgetManager, id)
                return
            }
            context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
                .edit()
                .putBoolean(CACHE_REFRESHING, true)
                .apply()
            // This intermediate state is visible while the network load runs. A full render keeps
            // both size-keyed children current and also reapplies the complete mode-aware palette.
            for (id in appWidgetIds) updateWidgetLayout(context, appWidgetManager, id)
            // Trigger data reload (factory restores refresh button when done)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list)
            scheduleRefreshTimeout(context)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        // A resize changes the background bitmap's pixel dimensions, and nothing else re-renders
        // on resize, so the card would keep a bitmap cut for the old size.
        updateWidgetLayout(context, appWidgetManager, appWidgetId)
    }

    override fun onEnabled(context: Context) {
        schedulePeriodicSync(context)
    }

    override fun onDisabled(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        WorkManager.getInstance(context).cancelUniqueWork(REFRESH_TIMEOUT_WORK_NAME)
    }

    private fun scheduleRefreshTimeout(context: Context) {
        val workRequest = OneTimeWorkRequestBuilder<OrbitWidgetRefreshTimeoutWorker>()
            .setInitialDelay(WIDGET_REFRESH_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            REFRESH_TIMEOUT_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            workRequest
        )
    }

    private fun schedulePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val workRequest = PeriodicWorkRequestBuilder<OrbitWidgetWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }
}
