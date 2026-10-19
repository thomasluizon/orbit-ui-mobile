package org.useorbit.app.widget

import kotlin.math.floor

internal data class WidgetGeometry(
    val visibleRowCount: Int,
    val remainderCount: Int,
    val canStateRemainder: Boolean,
    val contentHeightDp: Float,
    val cardHeightDp: Float
)

internal fun calculateWidgetGeometry(
    heightDp: Float,
    totalRows: Int,
    rowHeightDp: Float = 48f,
    headerHeightDp: Float = 48f
): WidgetGeometry {
    val contentHeight = maxOf(rowHeightDp, heightDp - headerHeightDp)
    val fit = maxOf(1, floor(contentHeight / rowHeightDp).toInt())
    val canStateRemainder = totalRows > fit && fit >= 2
    val visibleRowCount = if (canStateRemainder) fit - 1 else minOf(fit, totalRows)
    return WidgetGeometry(
        visibleRowCount, totalRows - visibleRowCount, canStateRemainder,
        contentHeight, headerHeightDp + contentHeight
    )
}
