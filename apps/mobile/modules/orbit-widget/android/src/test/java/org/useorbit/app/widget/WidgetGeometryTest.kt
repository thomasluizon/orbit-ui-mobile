package org.useorbit.app.widget

fun main() {
    for ((height, expectedRows) in listOf(96f to 1, 192f to 3, 288f to 5)) {
        for (count in listOf(0, 1, expectedRows, expectedRows + 1, 20)) {
            val geometry = calculateWidgetGeometry(height, count)
            val hasRemainder = count > expectedRows && expectedRows >= 2
            val visible = if (hasRemainder) expectedRows - 1 else minOf(expectedRows, count)
            check(geometry.visibleRowCount == visible)
            check(geometry.remainderCount == count - visible)
            check(geometry.canStateRemainder == hasRemainder)
            check(geometry.contentHeightDp == height - 48f)
            check(geometry.cardHeightDp == height)
            check((visible + if (hasRemainder) 1 else 0) * 48f <= geometry.contentHeightDp)
        }
    }
    check(calculateWidgetGeometry(110f, 5).visibleRowCount == 1)
    println("PASS: drawing geometry, first-load body, row capacity and remainder")
}
