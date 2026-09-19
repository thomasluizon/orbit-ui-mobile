package org.useorbit.app.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class OrbitWidgetRowLinkTest {
    @Test
    fun `a row on the tomorrow fallback carries tomorrow, not today`() {
        val today = dayOf(2026, Calendar.SEPTEMBER, 19)

        assertEquals("2026-09-19", widgetRowDate(0, today))
        assertEquals("2026-09-20", widgetRowDate(1, today))
    }

    @Test
    fun `the represented day rolls over its month and its year`() {
        assertEquals("2026-10-01", widgetRowDate(1, dayOf(2026, Calendar.SEPTEMBER, 30)))
        assertEquals("2027-01-01", widgetRowDate(1, dayOf(2026, Calendar.DECEMBER, 31)))
    }

    @Test
    fun `reading the day never mutates the calendar it was given`() {
        val today = dayOf(2026, Calendar.SEPTEMBER, 19)

        widgetRowDate(1, today)

        assertEquals("2026-09-19", widgetRowDate(0, today))
    }

    @Test
    fun `a row link names the habit it shows and the day it shows`() {
        assertEquals(
            "orbit://habits/a12b34cd-1234-4567-89ab-123456789abc?date=2026-09-20",
            widgetRowLink("a12b34cd-1234-4567-89ab-123456789abc", "2026-09-20")
        )
    }

    @Test
    fun `an unusable habit id opens the launch destination instead of a habit`() {
        assertNull(widgetRowLink("", "2026-09-20"))
        assertNull(widgetRowLink("   ", "2026-09-20"))
    }

    @Test
    fun `an id that would break the path is encoded into one segment`() {
        assertEquals(
            "orbit://habits/one%2Ftwo%20three?date=2026-09-20",
            widgetRowLink("one/two three", "2026-09-20")
        )
    }

    private fun dayOf(year: Int, month: Int, day: Int): Calendar =
        Calendar.getInstance(TimeZone.getTimeZone("America/Sao_Paulo"), Locale.US).apply {
            set(year, month, day, 13, 30, 0)
        }
}
