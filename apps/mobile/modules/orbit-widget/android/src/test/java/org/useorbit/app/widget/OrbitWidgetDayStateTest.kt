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

    private fun habit(
        id: String,
        isCompleted: Boolean = false,
        isBadHabit: Boolean = false,
        children: List<ApiHabit> = emptyList()
    ) = ApiHabit(
        id = id,
        title = id,
        isCompleted = isCompleted,
        isOverdue = false,
        dueTime = null,
        checklistChecked = null,
        checklistTotal = null,
        isBadHabit = isBadHabit,
        children = children,
        hasSubHabits = children.isNotEmpty()
    )
}
