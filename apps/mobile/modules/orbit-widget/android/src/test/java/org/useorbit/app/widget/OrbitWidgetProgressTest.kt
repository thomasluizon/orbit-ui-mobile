package org.useorbit.app.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class OrbitWidgetProgressTest {
    @Test
    fun `a day with no habits has an empty ring`() {
        assertEquals(0f, widgetProgressSweep(0, 0))
    }

    @Test
    fun `one habit fills the ring only when done`() {
        assertEquals(0f, widgetProgressSweep(0, 1))
        assertEquals(360f, widgetProgressSweep(1, 1))
    }

    @Test
    fun `five habits advance the ring by one fifth each`() {
        for (completed in 0..5) {
            assertEquals(72f * completed, widgetProgressSweep(completed, 5))
        }
    }
}
