package org.useorbit.app.widget
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

        return Result.success()
    }
}
