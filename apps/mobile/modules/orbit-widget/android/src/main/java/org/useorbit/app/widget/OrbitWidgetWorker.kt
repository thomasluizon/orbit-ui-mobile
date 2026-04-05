package org.useorbit.app.widget
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.work.Worker
import androidx.work.WorkerParameters

class OrbitWidgetWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : Worker(context, workerParams) {

    override fun doWork(): Result {
        // Broadcast refresh to the widget provider
        val intent = Intent(context, OrbitWidgetProvider::class.java).apply {
            action = OrbitWidgetProvider.ACTION_REFRESH
        }
        context.sendBroadcast(intent)

        // Also directly notify data changed so the factory re-fetches
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, OrbitWidgetProvider::class.java)
        )
        if (widgetIds.isNotEmpty()) {
            appWidgetManager.notifyAppWidgetViewDataChanged(widgetIds, R.id.widget_list)
        }

        return Result.success()
    }
}
