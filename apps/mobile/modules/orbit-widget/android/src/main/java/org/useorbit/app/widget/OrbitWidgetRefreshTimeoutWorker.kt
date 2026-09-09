package org.useorbit.app.widget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.view.View
import android.widget.RemoteViews
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

        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            // A timeout must not resurrect a control the signed-out card does not have.
            if (isSignedOut) {
                OrbitWidgetProvider.hideRefresh(views)
            } else {
                OrbitWidgetProvider.showRefresh(views)
            }
            views.setViewVisibility(
                R.id.widget_loading,
                if (showSkeleton) View.VISIBLE else View.GONE
            )
            appWidgetManager.partiallyUpdateAppWidget(id, views)
        }

        return Result.success()
    }
}
