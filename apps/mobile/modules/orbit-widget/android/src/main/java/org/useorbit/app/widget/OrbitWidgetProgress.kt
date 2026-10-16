package org.useorbit.app.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint

internal fun widgetProgressSweep(completed: Int, total: Int): Float =
    if (total == 0) 0f else 360f * completed / total

internal fun createWidgetProgressBitmap(
    completed: Int,
    total: Int,
    density: Float,
    colors: WidgetColors
): Bitmap {
    val size = (24 * density).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val scale = size / 24f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2 * scale
        strokeCap = Paint.Cap.ROUND
        color = colors.statusEmpty
    }
    canvas.drawCircle(12 * scale, 12 * scale, 10 * scale, paint)
    paint.color = colors.textPrimary
    canvas.drawArc(
        2 * scale, 2 * scale, 22 * scale, 22 * scale,
        -90f, widgetProgressSweep(completed, total), false, paint
    )
    return bitmap
}
