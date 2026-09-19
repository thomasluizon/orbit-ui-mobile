package org.useorbit.app.widget

import java.net.URLEncoder
import java.util.Calendar
import java.util.Locale

/**
 * The destination a widget row stands for. The row shows one habit on one day, so both travel
 * with the row rather than being recomputed when the app opens: a row on the tomorrow fallback
 * would otherwise land on today, which is the wrong day entirely.
 */
internal const val WIDGET_ROW_LINK_PREFIX = "orbit://habits/"

/** The calendar date a row stands for, as the API day string every app route reads. */
internal fun widgetRowDate(dayOffset: Int, today: Calendar): String {
    val day = today.clone() as Calendar
    day.add(Calendar.DAY_OF_YEAR, dayOffset)
    return String.format(
        Locale.US,
        "%04d-%02d-%02d",
        day.get(Calendar.YEAR),
        day.get(Calendar.MONTH) + 1,
        day.get(Calendar.DAY_OF_MONTH)
    )
}

/**
 * The row's deep link, or null when the row carries no habit to open. A null sends the row to
 * the template's own destination, which is the launch destination.
 */
internal fun widgetRowLink(habitId: String, rowDate: String): String? {
    if (habitId.isBlank()) return null
    return "$WIDGET_ROW_LINK_PREFIX${encodeRowSegment(habitId)}?date=$rowDate"
}

// URLEncoder writes the form encoding, whose one difference from a path segment is the space.
private fun encodeRowSegment(value: String): String =
    URLEncoder.encode(value, "UTF-8").replace("+", "%20")
