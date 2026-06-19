package org.useorbit.app.widget
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
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
            val colors = OrbitWidgetFactory.getThemeColors(context)
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
            val bgBitmap = OrbitWidgetFactory.createRoundedBitmap(
                bgWidth, bgHeight,
                colors.background,
                24f * density, 1f * density, colors.border
            )
            views.setImageViewBitmap(R.id.widget_bg, bgBitmap)

            // Read cached header from SharedPreferences
            val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            val headerLabel = prefs.getString("header_label", "Today") ?: "Today"
            val habitCount = prefs.getInt("habit_count", 0)
            val completedCount = prefs.getInt("completed_count", 0)
            val streak = prefs.getInt("user_streak", 0)
            val isSignedOut = OrbitWidgetModule.getToken(context) == null
            val lang = prefs.getString("lang", "en") ?: "en"
            val syncedOnce = prefs.getLong("habits_updated_at", 0L) > 0L

            // Apply dynamic text colors
            views.setTextColor(R.id.widget_header, colors.textPrimary)
            views.setTextColor(R.id.widget_subtitle, Color.argb(0x99, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))
            views.setTextColor(R.id.widget_empty_text, Color.argb(0x99, Color.red(colors.textMuted), Color.green(colors.textMuted), Color.blue(colors.textMuted)))

            // Header dot color
            views.setInt(R.id.widget_header_dot, "setColorFilter", colors.primary)

            // Refresh icon tint
            views.setInt(R.id.widget_refresh, "setColorFilter", colors.primary)

            // Flame bitmap (programmatic, avoids vector inflation issues)
            val flameBitmap = OrbitWidgetFactory.createFlameBitmap(density, colors.streak)
            views.setTextColor(R.id.widget_streak, colors.textPrimary)

            if (isSignedOut) {
                views.setTextViewText(R.id.widget_header, "Orbit")
                views.setTextViewText(R.id.widget_subtitle, OrbitWidgetFactory.tr(lang, "signIn"))
                views.setViewVisibility(R.id.widget_flame, View.GONE)
                views.setViewVisibility(R.id.widget_streak, View.GONE)
                views.setTextViewText(R.id.widget_empty_text, OrbitWidgetFactory.tr(lang, "signIn"))
            } else {
                views.setTextViewText(R.id.widget_header, headerLabel)
                val subtitleText = if (syncedOnce) {
                    "$completedCount ${OrbitWidgetFactory.tr(lang, "of")} $habitCount ${OrbitWidgetFactory.tr(lang, "completed")}"
                } else {
                    ""
                }
                views.setTextViewText(R.id.widget_subtitle, subtitleText)
                val streakVisible = if (streak > 0) View.VISIBLE else View.GONE
                views.setImageViewBitmap(R.id.widget_flame, flameBitmap)
                views.setTextViewText(R.id.widget_streak, "$streak")
                views.setViewVisibility(R.id.widget_flame, streakVisible)
                views.setViewVisibility(R.id.widget_streak, streakVisible)
                views.setTextViewText(R.id.widget_empty_text, OrbitWidgetFactory.tr(lang, "allClear"))
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
