package org.useorbit.app.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class OrbitWidgetDayStateTest {
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
