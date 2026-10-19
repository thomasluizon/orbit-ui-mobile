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
    fun `all sizes share a header with progress below the day and streak beside it`() {
        val document = javax.xml.parsers.DocumentBuilderFactory.newInstance()
            .newDocumentBuilder().parse(java.io.File("src/main/res/layout/widget_layout.xml"))
        val elements = document.getElementsByTagName("*")
        val views = (0 until elements.length).map { elements.item(it) as org.w3c.dom.Element }
            .associateBy { it.getAttribute("android:id") }
        val day = views.getValue("@+id/widget_header")
        val count = views.getValue("@+id/widget_subtitle")
        val streak = views.getValue("@+id/widget_streak_group")
        assertEquals(day.parentNode, count.parentNode)
        assertEquals(views.getValue("@+id/widget_header_right"), streak.parentNode)
        for (child in listOf("widget_list", "widget_empty", "widget_loading")) {
            for (edge in listOf("android:layout_alignTop", "android:layout_alignBottom")) {
                assertEquals("@id/widget_content_height", views.getValue("@+id/$child").getAttribute(edge))
            }
        }
        assertEquals("visible", views.getValue("@+id/widget_content").getAttribute("android:visibility"))
        assertEquals("visible", views.getValue("@+id/widget_loading").getAttribute("android:visibility"))
    }

    @Test
    fun `every supported height fits complete rows and keeps a body before sync`() {
        for ((height, fit) in listOf(96f to 1, 192f to 3, 288f to 5)) {
            for (count in listOf(0, 1, fit, fit + 1, 20)) {
                val geometry = calculateWidgetGeometry(height, count)
                val remainder = count > fit && fit >= 2
                assertEquals(if (remainder) fit - 1 else minOf(fit, count), geometry.visibleRowCount)
                assertEquals(count - geometry.visibleRowCount, geometry.remainderCount)
                assertEquals(remainder, geometry.canStateRemainder)
                assertEquals(height - 48f, geometry.contentHeightDp)
                assertEquals(height, geometry.cardHeightDp)
            }
        }
        for (height in 96..400) {
            val geometry = calculateWidgetGeometry(height.toFloat(), 20)
            val rows = geometry.visibleRowCount + if (geometry.canStateRemainder) 1 else 0
            assertEquals(true, rows * 48f <= geometry.contentHeightDp)
            assertEquals(true, geometry.contentHeightDp >= 48f)
            assertEquals(height.toFloat(), geometry.cardHeightDp)
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
