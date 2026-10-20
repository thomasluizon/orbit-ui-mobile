package org.useorbit.app.widget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class OrbitWidgetRefreshTimeoutWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : Worker(context, workerParams) {

    override fun doWork(): Result {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, OrbitWidgetProvider::class.java)
        )

        val prefs = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        val isSignedOut = OrbitWidgetProvider.isSignedOut(context)
        val showSkeleton = !isSignedOut && prefs.getLong("habits_updated_at", 0L) <= 0L
        prefs.edit()
            .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
            .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, showSkeleton)
            .apply()

        for (id in appWidgetIds) {
            // A full provider render keeps both size variants current and preserves signed-out UI.
            OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)
        }

        return Result.success()
    }
}
