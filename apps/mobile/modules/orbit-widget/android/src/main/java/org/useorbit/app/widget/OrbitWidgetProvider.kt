package org.useorbit.app.widget
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
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
                    fallback.setViewVisibility(R.id.widget_refresh, View.VISIBLE)
                    fallback.setViewVisibility(R.id.widget_refresh_loading, View.GONE)
                    appWidgetManager.updateAppWidget(appWidgetId, fallback)
                }
            }
        }

        private fun renderWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            val colorModes = OrbitWidgetFactory.getThemeColorModes(context)
            val density = context.resources.displayMetrics.density

            // Widget background: flat surface with a hairline border (lift, not gradient).
            val displayMetrics = context.resources.displayMetrics
            val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
            val maxWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0)
            val maxHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
            val bgWidth = (if (maxWidthDp > 0) (maxWidthDp * density).toInt() else displayMetrics.widthPixels)
                .coerceIn(1, displayMetrics.widthPixels)
            val bgHeight = (if (maxHeightDp > 0) (maxHeightDp * density).toInt() else displayMetrics.heightPixels / 2)
                .coerceIn(1, displayMetrics.heightPixels / 2)
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
            val lang = prefs.getString("lang", null) ?: if (Locale.getDefault().language == "pt") {
                "pt-BR"
            } else {
                "en"
            }
            val headerLabel = prefs.getString("header_label", null)
                ?: OrbitWidgetFactory.tr(context, lang, WidgetString.TODAY)
            val habitCount = prefs.getInt("habit_count", 0)
            val completedCount = prefs.getInt("completed_count", 0)
            val streak = prefs.getInt("user_streak", 0)
            val isSignedOut = OrbitWidgetModule.getToken(context) == null
            val syncedOnce = prefs.getLong("habits_updated_at", 0L) > 0L

            // Apply dynamic text colors
            views.setModeAwareColor(R.id.widget_header, "setTextColor", colorModes) { it.textPrimary }
            views.setModeAwareColor(R.id.widget_subtitle, "setTextColor", colorModes) { it.textMuted }
            views.setModeAwareColor(R.id.widget_empty_text, "setTextColor", colorModes) { it.textPrimary }
            views.setModeAwareColor(R.id.widget_streak_unit, "setTextColor", colorModes) { it.textMuted }

            // Refresh icon tint
            views.setModeAwareColor(R.id.widget_refresh, "setColorFilter", colorModes) { it.textMuted }
            val refreshDescription = OrbitWidgetFactory.tr(
                context,
                lang,
                WidgetString.REFRESH
            )
            views.setContentDescription(R.id.widget_refresh, refreshDescription)

            views.setModeAwareColor(R.id.widget_streak, "setTextColor", colorModes) { it.streak }

            if (isSignedOut) {
                views.setTextViewText(R.id.widget_header, "Orbit")
                views.setTextViewText(
                    R.id.widget_subtitle,
                    OrbitWidgetFactory.tr(context, lang, WidgetString.SIGN_IN)
                )
                views.setViewVisibility(R.id.widget_streak_group, View.GONE)
                views.setTextViewText(
                    R.id.widget_empty_text,
                    OrbitWidgetFactory.tr(context, lang, WidgetString.SIGN_IN)
                )
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
            }

            // Show the loading skeleton until habits have synced at least once, so a
            // freshly added widget never paints as a blank card. The factory hides it
            // once its own load resolves (covers the case where no app push re-renders).
            val showSkeleton = !isSignedOut && !syncedOnce
            views.setViewVisibility(R.id.widget_loading, if (showSkeleton) View.VISIBLE else View.GONE)

            // Set up the RemoteViews adapter for the list
            val serviceIntent = Intent(context, OrbitWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.widget_list, serviceIntent)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty)

            // Tap on any item opens the app
            val openAppIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://app.useorbit.org"))
            val openAppPendingIntent = PendingIntent.getActivity(
                context, 0, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setPendingIntentTemplate(R.id.widget_list, openAppPendingIntent)

            // Refresh button triggers data reload
            val refreshIntent = Intent(context, OrbitWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context, 1, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)

            // Tap anywhere else also opens app
            views.setOnClickPendingIntent(R.id.widget_root, openAppPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_header_container, openAppPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_header, openAppPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_empty, openAppPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_loading, openAppPendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
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
            // Show loading spinner immediately
            for (id in appWidgetIds) {
                val loadingViews = RemoteViews(context.packageName, R.layout.widget_layout)
                loadingViews.setViewVisibility(R.id.widget_refresh, View.GONE)
                loadingViews.setViewVisibility(R.id.widget_refresh_loading, View.VISIBLE)
                appWidgetManager.partiallyUpdateAppWidget(id, loadingViews)
            }
            // Trigger data reload (factory restores refresh button when done)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list)
            scheduleRefreshTimeout(context)
        }
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
