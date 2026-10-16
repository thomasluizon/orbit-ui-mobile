package org.useorbit.app.widget

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class OrbitWidgetDayStateTest {
    @Test
    fun `formats the profile clock while keeping the legacy widget default`() {
        assertEquals("09:05", formatWidgetTime("09:05:00", true, Locale.ENGLISH))
        assertEquals("09:05", formatWidgetTime("09:05:00", null, Locale.ENGLISH))
        assertEquals("9:05 AM", formatWidgetTime("09:05:00", false, Locale.ENGLISH))
    }

    @Test
    fun `selects empty copy from the payload reason with the completed case as fallback`() {
        assertEquals(WidgetString.ALL_CLEAR, emptyWidgetString("all-done"))
        assertEquals(WidgetString.NOTHING_SCHEDULED, emptyWidgetString("nothing-scheduled"))
        assertEquals(WidgetString.ALL_CLEAR, emptyWidgetString(null))
        assertEquals(WidgetString.ALL_CLEAR, emptyWidgetString("unrecognised"))
    }

    @Test
    fun `derives capacity for all four launcher sizes`() {
        assertEquals(1, calculateWidgetGeometry(96f, 7).visibleRowCount)
        assertEquals(3, calculateWidgetGeometry(192f, 3).visibleRowCount)
        assertEquals(5, calculateWidgetGeometry(288f, 5).visibleRowCount)
        assertEquals(2, calculateWidgetGeometry(192f, 4).visibleRowCount)
    }

    @Test
    fun `reserves one fitted row when a remainder can be stated`() {
        val fourByTwo = calculateWidgetGeometry(192f, 5)
        assertEquals(2, fourByTwo.visibleRowCount)
        assertEquals(3, fourByTwo.remainderCount)
        assertEquals(true, fourByTwo.canStateRemainder)

        val fourByThree = calculateWidgetGeometry(288f, 7)
        assertEquals(4, fourByThree.visibleRowCount)
        assertEquals(3, fourByThree.remainderCount)
        assertEquals(true, fourByThree.canStateRemainder)

        val twoByTwo = calculateWidgetGeometry(192f, 4)
        assertEquals(2, twoByTwo.visibleRowCount)
        assertEquals(2, twoByTwo.remainderCount)
        assertEquals(true, twoByTwo.canStateRemainder)
    }

    @Test
    fun `four by one never states a remainder`() {
        for (rowCount in 2..20) {
            val geometry = calculateWidgetGeometry(96f, rowCount)
            assertEquals(1, geometry.visibleRowCount)
            assertEquals(rowCount - 1, geometry.remainderCount)
            assertEquals(false, geometry.canStateRemainder)
        }
    }

    @Test
    fun `empty and single habit cards hug one body row at every supported size`() {
        for (height in listOf(96f, 192f, 288f, 192f)) {
            for (count in listOf(0, 1)) {
                val geometry = calculateWidgetGeometry(height, count)
                assertEquals(count, geometry.visibleRowCount)
                assertEquals(0, geometry.remainderCount)
                assertEquals(false, geometry.canStateRemainder)
                assertEquals(48f, geometry.contentHeightDp)
            }
        }
    }

    @Test
    fun `five habits fill only the available whole rows`() {
        for ((height, visible, remaining, contentHeight) in listOf(
            listOf(96, 1, 4, 48),
            listOf(192, 2, 3, 144),
            listOf(288, 5, 0, 240),
            listOf(192, 2, 3, 144)
        )) {
            val geometry = calculateWidgetGeometry(height.toFloat(), 5)
            assertEquals(visible, geometry.visibleRowCount)
            assertEquals(remaining, geometry.remainderCount)
            assertEquals(remaining > 0 && height > 96, geometry.canStateRemainder)
            assertEquals(contentHeight.toFloat(), geometry.contentHeightDp)
        }
    }

    @Test
    fun `intermediate heights never reserve a partial body row`() {
        for (height in 96..400) {
            val geometry = calculateWidgetGeometry(height.toFloat(), 20)
            assertEquals(0f, geometry.contentHeightDp % ROW_HEIGHT_DP)
            assertEquals(true, HEADER_HEIGHT_DP + geometry.contentHeightDp <= height)
        }
    }

    @Test
    fun `bad parent keeps its non-bad child in header progress`() {
        val child = habit(id = "child", isCompleted = true, isBadHabit = false)
        val badChild = habit(id = "bad-child", isCompleted = true, isBadHabit = true)
        val parent = habit(
            id = "parent",
            isBadHabit = true,
            children = listOf(child, badChild)
        )
        val badLeaf = habit(id = "bad-leaf", isCompleted = true, isBadHabit = true)

        val dayState = prepareWidgetDay(listOf(parent, badLeaf), dayOffset = 0)

        assertEquals(1, dayState.totalCount)
        assertEquals(1, dayState.completedCount)
    }

    @Test
    fun `incomplete good parent with only bad children counts itself in header progress`() {
        val badChild = habit(id = "bad-child", isCompleted = true, isBadHabit = true)
        val parent = habit(id = "parent", children = listOf(badChild))

        val dayState = prepareWidgetDay(listOf(parent), dayOffset = 0)

        assertEquals(1, dayState.totalCount)
        assertEquals(0, dayState.completedCount)
    }

    @Test
    fun `completed good parent with only bad children counts itself in header progress`() {
        val badChild = habit(id = "bad-child", isCompleted = true, isBadHabit = true)
        val parent = habit(id = "parent", isCompleted = true, children = listOf(badChild))

        val dayState = prepareWidgetDay(listOf(parent), dayOffset = 0)

        assertEquals(1, dayState.totalCount)
        assertEquals(1, dayState.completedCount)
    }

    @Test
    fun `flattens the complete widget row vocabulary`() {
        val greatGrandchild = habit(id = "great-grandchild")
        val grandchild = habit(id = "grandchild", children = listOf(greatGrandchild))
        val child = habit(id = "child", children = listOf(grandchild))
        val parent = habit(
            id = "parent",
            dueTime = "09:00:00",
            checklistChecked = 1,
            checklistTotal = 3,
            children = listOf(child)
        )

        val dayState = prepareWidgetDay(listOf(parent), dayOffset = 0)
        val parentRow = dayState.habits[0]
        val childRow = dayState.habits[1]

        assertEquals("09:00:00", parentRow.dueTime)
        assertEquals(1, parentRow.checklistChecked)
        assertEquals(3, parentRow.checklistTotal)
        assertEquals(true, parentRow.hasChildren)
        assertEquals(0, parentRow.childrenDone)
        assertEquals(1, parentRow.childrenTotal)
        assertEquals(1, childRow.depth)
        assertEquals(2, childRow.deeperCount)
    }

    private fun habit(
        id: String,
        isCompleted: Boolean = false,
        isBadHabit: Boolean = false,
        dueTime: String? = null,
        checklistChecked: Int? = null,
        checklistTotal: Int? = null,
        children: List<ApiHabit> = emptyList()
    ) = ApiHabit(
        id = id,
        title = id,
        isCompleted = isCompleted,
        isOverdue = false,
        dueTime = dueTime,
        checklistChecked = checklistChecked,
        checklistTotal = checklistTotal,
        isBadHabit = isBadHabit,
        children = children
    )
}
