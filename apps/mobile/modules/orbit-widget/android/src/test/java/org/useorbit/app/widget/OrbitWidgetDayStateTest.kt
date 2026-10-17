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
    fun `legacy widget body is bounded before runtime height setters are available`() {
        val source = java.io.File("src/main/res/layout/widget_layout.xml").readText()
        val content = Regex("""android:id="@\+id/widget_content"[\s\S]*?android:layout_height="([^"]+)"""")
            .find(source)?.groupValues?.get(1)
        assertEquals("@dimen/widget_row_height", content)
        val expanded = java.io.File("src/main/res/layout/widget_layout_expanded.xml").readText()
        assertEquals("@dimen/widget_content_expanded_height",
            Regex("""android:id="@\+id/widget_content"[\s\S]*?android:layout_height="([^"]+)"""")
                .find(expanded)?.groupValues?.get(1))
    }

    @Test
    fun `initial layout leaves room for the smallest widget before the provider renders`() {
        val provider = java.io.File("src/main/res/xml/orbit_widget_info.xml").readText()
        val layout = Regex("""android:initialLayout="@layout/(\w+)"""").find(provider)!!.groupValues[1]
        val source = java.io.File("src/main/res/layout/$layout.xml").readText()
        val content = Regex("""<FrameLayout\b[^>]*android:id="@\+id/widget_content"[^>]*>""")
            .find(source)!!.value
        assertEquals(true, content.contains("""android:visibility="gone""""))
        val header = Regex("""<LinearLayout\b[^>]*android:id="@\+id/widget_header_left"[^>]*>""")
            .find(source)!!.value
        assertEquals(false, header.contains("android:layout_marginStart"))
    }

    @Test
    fun `compact and narrow headers reserve the refresh slot before sizing their text`() {
        for (layout in listOf("widget_layout_compact", "widget_layout_narrow")) {
            val document = javax.xml.parsers.DocumentBuilderFactory.newInstance()
                .newDocumentBuilder().parse(java.io.File("src/main/res/layout/$layout.xml"))
            val elements = document.getElementsByTagName("*")
            val views = (0 until elements.length).map { elements.item(it) as org.w3c.dom.Element }
                .associateBy { it.getAttribute("android:id") }
            val actions = views.getValue("@+id/widget_header_right")
            for (dimension in listOf("android:layout_width", "android:layout_height")) {
                assertEquals(layout, "@dimen/widget_touch_target", actions.getAttribute(dimension))
            }
            assertEquals(layout, "true", actions.getAttribute("android:layout_alignParentEnd"))
            val summary = views.getValue("@+id/widget_header_left")
            assertEquals(layout, "@id/widget_header_right", summary.getAttribute("android:layout_toStartOf"))
            for (control in listOf("widget_refresh", "widget_refresh_loading")) {
                assertEquals(layout, actions, views.getValue("@+id/$control").parentNode)
            }
        }
    }

    private val cardSpacing = WidgetSpacing(24f, 48f, 68f, 8f, 16f, 96f)
    private val narrowSpacing = cardSpacing.copy(insetDp = 12f, headerHeightDp = 72f)

    @Test
    fun `reserves card insets and whole padded rows at every declared size`() {
        val fourByOne = calculateWidgetGeometry(96f, 7, cardSpacing)
        assertEquals(true, fourByOne.compact)
        assertEquals(0, fourByOne.visibleRowCount)
        assertEquals(0f, fourByOne.contentHeightDp)
        assertEquals(96f, fourByOne.cardHeightDp)

        val fourByTwo = calculateWidgetGeometry(192f, 7, cardSpacing)
        assertEquals(1, fourByTwo.visibleRowCount)
        assertEquals(68f, fourByTwo.contentHeightDp)
        assertEquals(180f, fourByTwo.cardHeightDp)

        val fourByThree = calculateWidgetGeometry(288f, 7, cardSpacing)
        assertEquals(1, fourByThree.visibleRowCount)
        assertEquals(6, fourByThree.remainderCount)
        assertEquals(true, fourByThree.canStateRemainder)
        assertEquals(144f, fourByThree.contentHeightDp)
        assertEquals(256f, fourByThree.cardHeightDp)

        val twoByTwo = calculateWidgetGeometry(192f, 4, narrowSpacing)
        assertEquals(1, twoByTwo.visibleRowCount)
        assertEquals(180f, twoByTwo.cardHeightDp)
    }

    @Test
    fun `empty and single habit cards keep padded body space in the tall variants`() {
        for (height in listOf(192f, 288f)) {
            for (count in listOf(0, 1)) {
                val geometry = calculateWidgetGeometry(height, count, cardSpacing)
                assertEquals(count, geometry.visibleRowCount)
                assertEquals(0, geometry.remainderCount)
                assertEquals(false, geometry.canStateRemainder)
                assertEquals(68f, geometry.contentHeightDp)
                assertEquals(180f, geometry.cardHeightDp)
            }
        }
    }

    @Test
    fun `intermediate heights fit every inset and gap without partial rows`() {
        for (spacing in listOf(cardSpacing, narrowSpacing)) {
            for (height in 96..400) {
                val geometry = calculateWidgetGeometry(height.toFloat(), 20, spacing)
                if (!geometry.compact) {
                    assertEquals(0f, (geometry.contentHeightDp + spacing.rowGapDp) %
                        (spacing.rowHeightDp + spacing.rowGapDp))
                }
                assertEquals(true, geometry.cardHeightDp <= height)
            }
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
