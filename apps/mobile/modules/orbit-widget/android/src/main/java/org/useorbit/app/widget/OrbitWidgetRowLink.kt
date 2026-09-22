package org.useorbit.app.widget

import java.net.URLEncoder
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * The destination a widget row stands for. The row shows one habit on one day, so both travel
 * with the row rather than being recomputed when the app opens: a row on the tomorrow fallback
 * would otherwise land on today, which is the wrong day entirely.
 */
internal const val WIDGET_ROW_LINK_PREFIX = "orbit://habits/"

/**
 * The one clock read a row's day is built from. Locale.US states the calendar this file assumes
 * rather than inheriting the device default. On Android it changes nothing: a locale sets only
 * firstDayOfWeek and minimalDaysInFirstWeek, and neither add(DAY_OF_YEAR) nor the three fields
 * below read them.
 */
internal fun nowInDeviceDay(): Calendar = Calendar.getInstance(TimeZone.getDefault(), Locale.US)

/**
 * The day a payload's `dayOffset` counts from, which is the day the payload was FETCHED rather
 * than the day it renders. A render can replay a cached payload of any age, so anchoring on the
 * render clock walks the row's date one day forward for every day the cache is replayed.
 * A stored time of 0 is defensive only, never the first render: both writers stamp the time in
 * the same edit() as the payload, the one clear path wipes both, and a render with no payload
 * returns before this. Only a torn preferences file reaches the fallback.
 */
internal fun widgetFetchDay(fetchedAtMillis: Long, now: Calendar): Calendar {
    if (fetchedAtMillis <= 0L) return now
    val fetchedOn = now.clone() as Calendar
    fetchedOn.timeInMillis = fetchedAtMillis
    return fetchedOn
}

/** The calendar date a row stands for, as the API day string every app route reads. */
internal fun widgetRowDate(dayOffset: Int, fetchedOn: Calendar): String {
    val day = fetchedOn.clone() as Calendar
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
