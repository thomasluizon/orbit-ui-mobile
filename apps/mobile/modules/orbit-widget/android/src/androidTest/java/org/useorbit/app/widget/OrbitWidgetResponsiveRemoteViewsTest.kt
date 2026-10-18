package org.useorbit.app.widget

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Rect
import android.util.SizeF
import android.view.ViewGroup
import android.view.LayoutInflater
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.TextView
import com.google.gson.Gson
import kotlin.math.floor
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OrbitWidgetResponsiveRemoteViewsTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val appWidgetHost = AppWidgetHost(context, HOST_ID)
    private val widgetService = ComponentName(context, OrbitWidgetService::class.java)
    private var previousServiceState: Int? = null
    private lateinit var hostView: AppWidgetHostView
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    @Before
    fun setUp() {
        // Header-only tests must not let the list factory fetch or replace fixture ownership (#1392).
        previousServiceState = context.packageManager.getComponentEnabledSetting(widgetService)
        context.packageManager.setComponentEnabledSetting(
            widgetService,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            context.packageManager.getComponentEnabledSetting(widgetService)
        )
        val appWidgetManager = AppWidgetManager.getInstance(context)
        // The instrumentation APK declares this provider too, and it is the one to bind. Binding the
        // installed app's provider makes the host inflate app-package resources while the test builds
        // RemoteViews from its own package, and the host silently falls back to its error view.
        val providerInfo = appWidgetManager
            .installedProviders
            .first {
                it.provider.className == OrbitWidgetProvider::class.java.name &&
                    it.provider.packageName == context.packageName
            }
        appWidgetId = appWidgetHost.allocateAppWidgetId()

        // updateAppWidgetSize reaches the system service, which has no options Bundle for an
        // unbound id and throws. Binding needs BIND_APPWIDGET, which is signature level and only
        // the shell identity carries here.
        val uiAutomation = InstrumentationRegistry.getInstrumentation().uiAutomation
        uiAutomation.adoptShellPermissionIdentity()
        val bound = appWidgetManager.bindAppWidgetIdIfAllowed(appWidgetId, providerInfo.provider)
        assertTrue("could not bind an app widget id under the shell identity", bound)

        appWidgetHost.startListening()
        hostView = appWidgetHost.createView(context, appWidgetId, providerInfo)

        assertTrue(
            OrbitWidgetModule.getEncryptedPrefs(context).edit()
                .putString(AUTH_TOKEN_KEY, SIGNED_IN_TOKEN)
                .commit()
        )
        assertEquals(SIGNED_IN_TOKEN, OrbitWidgetModule.getToken(context))
        val session = OrbitWidgetModule.sessionKey(SIGNED_IN_TOKEN)
        val cacheEditor = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .putString("header_label", "Today")
            .putInt("habit_count", 7)
            .putInt("completed_count", 3)
            .putInt("user_streak", 12)
            .putInt("row_count", 5)
            .putString("lang", "en")
            .putLong("habits_updated_at", 1L)
            .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
            .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, false)
        for (heightDp in setOf(
            OrbitWidgetProvider.FOUR_BY_ONE_HEIGHT_DP,
            OrbitWidgetProvider.FOUR_BY_TWO_HEIGHT_DP,
            OrbitWidgetProvider.FOUR_BY_THREE_HEIGHT_DP,
            OrbitWidgetProvider.TWO_BY_TWO_HEIGHT_DP
        )) {
            cacheEditor.putString(OrbitWidgetProvider.renderSessionKey(appWidgetId, heightDp), session)
        }
        assertTrue(cacheEditor.commit())
    }

    @After
    fun tearDown() {
        try {
            InstrumentationRegistry.getInstrumentation().uiAutomation.dropShellPermissionIdentity()
            OrbitWidgetModule.getEncryptedPrefs(context).edit()
                .remove(AUTH_TOKEN_KEY)
                .commit()
            context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
                .edit()
                .clear()
                .commit()
            appWidgetHost.stopListening()
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                appWidgetHost.deleteAppWidgetId(appWidgetId)
            }
        } finally {
            previousServiceState?.let { state ->
                context.packageManager.setComponentEnabledSetting(
                    widgetService, state, PackageManager.DONT_KILL_APP
                )
                assertEquals(state, context.packageManager.getComponentEnabledSetting(widgetService))
            }
        }
    }

    /**
     * The host reads its own width as laid out pixels divided by the display density, so the only
     * widths that can occur are pixel derived. The transition is sampled at the last pixel that
     * still measures at or below the breakpoint and at the first pixel above it, because
     * RemoteViews.findBestFitLayout takes the nearest fitting key rather than the largest one.
     */
    @Test
    @SdkSuppress(minSdkVersion = 31)
    fun hostSelectsCompactAndExpandedHeaderVariants() {
        val density = context.resources.displayMetrics.density
        val views = OrbitWidgetProvider.buildWidgetRemoteViews(
            context,
            appWidgetId,
            (WIDE_WIDTH_DP * density).toInt(),
            (TALL_HEIGHT_DP * density).toInt(),
            signedOut = false
        )
        val breakpointPx = floor(OrbitWidgetProvider.STREAK_UNIT_BREAKPOINT_DP * density).toInt()

        assertHeaderAtContentSize(views, WIDE_WIDTH_DP, SHORT_HEIGHT_DP, View.VISIBLE)
        assertHeaderAtContentSize(views, WIDE_WIDTH_DP, DEFAULT_HEIGHT_DP, View.VISIBLE)
        assertHeaderAtContentSize(views, WIDE_WIDTH_DP, TALL_HEIGHT_DP, View.VISIBLE)
        assertHeaderAtContentSize(views, COMPACT_WIDTH_DP, DEFAULT_HEIGHT_DP, View.GONE)
        assertHeaderAtContentSize(views, EXPANDED_WIDTH_DP, DEFAULT_HEIGHT_DP, View.VISIBLE)
        assertHeaderAtContentSize(views, breakpointPx / density, DEFAULT_HEIGHT_DP, View.GONE)
        assertHeaderAtContentSize(views, (breakpointPx + 1) / density, DEFAULT_HEIGHT_DP, View.VISIBLE)
    }

    @Test
    fun signedOutReapplicationReplacesThePreviousProgressDescription() {
        val preferences = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        for (language in listOf("en", "pt-BR")) {
            preferences.edit().putString("lang", language).commit()
            val signInInstruction = OrbitWidgetFactory.tr(context, language, WidgetString.SIGN_IN)
            for (fallback in listOf(false, true)) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync {
                    val density = context.resources.displayMetrics.density
                    val widthPx = (WIDE_WIDTH_DP * density).toInt()
                    val heightPx = (DEFAULT_HEIGHT_DP * density).toInt()
                    val signedIn = OrbitWidgetProvider.buildWidgetRemoteViews(
                        context, appWidgetId, widthPx, heightPx, signedOut = false
                    )
                    val viewTree = signedIn.apply(context, hostView)
                    val subtitle = viewTree.findViewById<TextView>(R.id.widget_subtitle)
                    val progressDescription = "3 ${OrbitWidgetFactory.tr(context, language, WidgetString.OF)} " +
                        "7 ${OrbitWidgetFactory.tr(context, language, WidgetString.COMPLETED)}"
                    assertEquals(progressDescription, subtitle.contentDescription.toString())

                    val signedOut = if (fallback) {
                        RemoteViews(context.packageName, R.layout.widget_layout).also {
                            OrbitWidgetProvider.applySignedOutCard(context, it)
                        }
                    } else {
                        OrbitWidgetProvider.buildWidgetRemoteViews(
                            context, appWidgetId, widthPx, heightPx, signedOut = true
                        )
                    }
                    signedOut.reapply(context, viewTree)

                    assertTrue(subtitle === viewTree.findViewById<TextView>(R.id.widget_subtitle))
                    assertEquals(signInInstruction, subtitle.text.toString())
                    assertEquals(signInInstruction, subtitle.contentDescription.toString())
                    val freshSubtitle = signedOut.apply(context, hostView)
                        .findViewById<TextView>(R.id.widget_subtitle)
                    assertEquals(signInInstruction, freshSubtitle.contentDescription.toString())
                    assertEquals(View.GONE, viewTree.findViewById<View>(R.id.widget_header_right).visibility)
                    val signedInAgain = if (fallback) {
                        signedOut.also { OrbitWidgetProvider.showRefresh(it) }
                    } else {
                        OrbitWidgetProvider.buildWidgetRemoteViews(
                            context, appWidgetId, widthPx, heightPx, signedOut = false
                        )
                    }
                    signedInAgain.reapply(context, viewTree)
                    assertEquals(View.VISIBLE, viewTree.findViewById<View>(R.id.widget_header_right).visibility)
                    assertEquals(View.VISIBLE, viewTree.findViewById<View>(R.id.widget_refresh).visibility)
                }
            }
        }
    }

    @Test
    fun fourByOneKeepsCardInsetAndRefreshTarget() = assertSpacing(336f, 96f, 24f)

    @Test
    fun fourByTwoKeepsCardInsetAndRefreshTarget() = assertSpacing(336f, 192f, 24f)

    @Test
    fun fourByThreeKeepsCardInsetAndRefreshTarget() = assertSpacing(336f, 288f, 24f)

    @Test
    fun twoByTwoStepsInsetAndKeepsRefreshTarget() = assertSpacing(160f, 192f, 12f)

    @Test
    fun shortWidthsKeepTheCompleteDayCountAndStreak() {
        assertSpacing(200f, 96f, 12f)
        assertSpacing(201f, 96f, 24f)
        assertSpacing(250f, 96f, 24f)
    }

    @Test
    @SdkSuppress(maxSdkVersion = 30)
    fun legacyTallResizesExposeEveryAllocatedRowIncludingTheRemainder() {
        val preferences = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        for ((widthDp, heightDp, habitCount) in listOf(Triple(160f, 288f, 3), Triple(336f, 384f, 5))) {
            val habits = (1..habitCount).map {
                ApiHabit("habit-$it", "Habit $it", false, false, null, null, null, false, null)
            }
            val response = HabitWidgetResponse(0, "en", true, 12, habits)
            assertTrue(preferences.edit()
                .putString("habits_json", Gson().toJson(response))
                .putString("habits_session", OrbitWidgetModule.sessionKey(SIGNED_IN_TOKEN))
                .putLong("habits_updated_at", System.currentTimeMillis()).commit())
            val factory = OrbitWidgetFactory(context, appWidgetId, heightDp, widthDp)
            factory.onDataSetChanged()
            val geometry = calculateWidgetGeometry(heightDp, prepareWidgetDay(habits, 0).habits.size,
                WidgetSpacing.read(context, widthDp, heightDp))
            assertTrue(geometry.canStateRemainder)
            assertEquals(geometry.visibleRowCount + 1, factory.count)
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val density = context.resources.displayMetrics.density
                val views = OrbitWidgetProvider.buildWidgetRemoteViews(context, appWidgetId,
                    (widthDp * density).toInt(), (heightDp * density).toInt(), false)
                val tree = views.apply(context, hostView) as ViewGroup
                val list = tree.findViewById<ListView>(R.id.widget_list)
                list.adapter = object : BaseAdapter() {
                    override fun getCount() = factory.count
                    override fun getItem(position: Int) = position
                    override fun getItemId(position: Int) = position.toLong()
                    override fun getView(position: Int, convertView: View?, parent: ViewGroup): View =
                        factory.getViewAt(position).apply(context, parent)
                }
                tree.measure(View.MeasureSpec.makeMeasureSpec((widthDp * density).toInt(), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec((heightDp * density).toInt(), View.MeasureSpec.AT_MOST))
                tree.layout(0, 0, tree.measuredWidth, tree.measuredHeight)
                val content = tree.findViewById<View>(R.id.widget_content)
                assertEquals((geometry.contentHeightDp * density).toInt(), content.height)
                assertEquals(content.height, list.height)
                assertEquals(factory.count, list.childCount)
                val remainder = list.getChildAt(list.childCount - 1)
                assertEquals(R.id.widget_remainder, remainder.id)
                val visible = Rect()
                assertTrue(remainder.getLocalVisibleRect(visible))
                assertEquals(remainder.height, visible.height())
                assertEquals(OrbitWidgetFactory.tr(context, "en", WidgetString.MORE, geometry.remainderCount),
                    remainder.findViewById<TextView>(R.id.widget_remainder_text).text.toString())
                assertTrue(tree.height <= heightDp * density)
            }
            factory.onDestroy()
        }
    }

    @Test
    fun compactHabitNameAppearsOnlyWhenItsWholeLineFits() {
        val preferences = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        for (title in listOf("Ler", "Um nome de hábito que ocupa mais espaço do que a linha do widget permite")) {
            val habit = ApiHabit("habit", title, false, false, "21:00", null, null, false, null)
            val nextTitle = prepareWidgetDay(listOf(habit), 0).habits.first().title
            preferences.edit().putString("next_habit_title", nextTitle)
                .putString("header_label", "Hoje").putString("lang", "pt-BR").putInt("user_streak", 1).commit()
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val density = context.resources.displayMetrics.density
                val views = OrbitWidgetProvider.buildWidgetRemoteViews(
                    context, appWidgetId, (336 * density).toInt(), (96 * density).toInt(), false,
                    listOf(SizeF(336f, 96f))
                )
                hostView.updateAppWidgetSize(Bundle(), 336, 96, 336, 96)
                layoutHost((336 * density).toInt(), (96 * density).toInt())
                hostView.updateAppWidget(views)
                layoutHost((336 * density).toInt(), (96 * density).toInt())
                val nextHabit = hostView.findViewById<TextView>(R.id.widget_next_habit)
                assertEquals(if (title == "Ler") View.VISIBLE else View.GONE, nextHabit.visibility)
                if (nextHabit.visibility == View.VISIBLE) {
                    assertEquals(title, nextHabit.text.toString())
                    val root = hostView.findViewById<ViewGroup>(R.id.widget_root)
                    val titleBounds = Rect(0, 0, nextHabit.width, nextHabit.height)
                    root.offsetDescendantRectToMyCoords(nextHabit, titleBounds)
                    val refresh = root.findViewById<View>(R.id.widget_refresh)
                    val refreshBounds = Rect(0, 0, refresh.width, refresh.height)
                    root.offsetDescendantRectToMyCoords(refresh, refreshBounds)
                    assertTrue(titleBounds.right + (8 * density).toInt() <= refreshBounds.left)
                }
            }
        }
    }

    private fun assertSpacing(widthDp: Float, heightDp: Float, insetDp: Float) {
        val preferences = context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
        for (nightMode in listOf(Configuration.UI_MODE_NIGHT_NO, Configuration.UI_MODE_NIGHT_YES)) {
            val configuration = Configuration(context.resources.configuration).apply {
                uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or nightMode
            }
            val themedContext = context.createConfigurationContext(configuration)
            for ((language, units) in listOf("en" to listOf("day", "days"), "pt-BR" to listOf("dia", "dias"))) {
                for (streak in listOf(1, 2, 365)) {
                    InstrumentationRegistry.getInstrumentation().runOnMainSync {
                        // The periodic worker can change refresh state before this render (#1404).
                        preferences.edit().putString("lang", language).putInt("user_streak", streak)
                            .putString("header_label", if (language == "en") "Tomorrow" else "Amanhã")
                            .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false).commit()
                        val manager = AppWidgetManager.getInstance(themedContext)
                        val provider = manager.getAppWidgetInfo(appWidgetId)
                        hostView = appWidgetHost.createView(themedContext, appWidgetId, provider)
                        val density = themedContext.resources.displayMetrics.density
                        val views = OrbitWidgetProvider.buildWidgetRemoteViews(
                            themedContext, appWidgetId, (widthDp * density).toInt(),
                            (heightDp * density).toInt(), false, listOf(SizeF(widthDp, heightDp))
                        )
                        hostView.updateAppWidgetSize(Bundle(), widthDp.toInt(), heightDp.toInt(),
                            widthDp.toInt(), heightDp.toInt())
                        layoutHost((widthDp * density).toInt(), (heightDp * density).toInt())
                        hostView.updateAppWidget(views)
                        layoutHost((widthDp * density).toInt(), (heightDp * density).toInt())
                        val root = hostView.findViewById<ViewGroup>(R.id.widget_root)
                        val insetResource = if (insetDp == 24f) R.dimen.widget_inset_card else R.dimen.widget_inset_compact
                        val insetPx = themedContext.resources.getDimensionPixelSize(insetResource)
                        val touchTargetPx = themedContext.resources.getDimensionPixelSize(R.dimen.widget_touch_target)
                        assertEquals(listOf(insetPx, insetPx, insetPx, insetPx),
                            listOf(root.paddingLeft, root.paddingTop, root.paddingRight, root.paddingBottom))
                        val refresh = hostView.findViewById<View>(R.id.widget_refresh)
                        assertEquals(View.VISIBLE, refresh.visibility)
                        assertEquals(touchTargetPx, refresh.width)
                        assertEquals(touchTargetPx, refresh.height)
                        val refreshBounds = Rect(0, 0, refresh.width, refresh.height)
                        root.offsetDescendantRectToMyCoords(refresh, refreshBounds)
                        assertTrue(refreshBounds.left >= insetPx)
                        assertTrue(refreshBounds.top >= insetPx)
                        assertTrue(refreshBounds.right <= root.width - insetPx)
                        assertTrue(refreshBounds.bottom <= root.height - insetPx)
                        assertEquals(units[if (streak == 1) 0 else 1], text(R.id.widget_streak_unit))
                        for (viewId in listOf(R.id.widget_subtitle, R.id.widget_streak)) {
                            val figure = root.findViewById<TextView>(viewId)
                            assertEquals(1, figure.layout.lineCount)
                            assertEquals(0, figure.layout.getEllipsisCount(0))
                            assertTrue(figure.layout.getLineWidth(0) <= figure.width + 1f)
                        }
                        val dayLabel = root.findViewById<TextView>(R.id.widget_header)
                        assertEquals(0, dayLabel.layout.getEllipsisCount(0))
                        for (viewId in listOf(R.id.widget_header, R.id.widget_subtitle, R.id.widget_streak, R.id.widget_streak_unit)) {
                            val label = root.findViewById<TextView>(viewId)
                            if (label.visibility != View.VISIBLE) continue
                            assertTrue(label.paint.measureText(label.text.toString()) <= label.width + 1f)
                            val bounds = Rect(0, 0, label.width, label.height)
                            root.offsetDescendantRectToMyCoords(label, bounds)
                            assertTrue(bounds.left >= insetPx)
                            assertTrue(bounds.right <= refreshBounds.left)
                            assertTrue(bounds.top >= insetPx)
                            assertTrue(bounds.bottom <= root.height - insetPx)
                        }
                        val content = root.findViewById<View>(R.id.widget_content)
                        assertEquals(if (heightDp == 96f) View.GONE else View.VISIBLE, content.visibility)
                        if (heightDp > 96f) {
                            val header = root.findViewById<View>(R.id.widget_header_container)
                            assertEquals(themedContext.resources.getDimensionPixelSize(R.dimen.widget_header_list_gap), content.top - header.bottom)
                            val row = LayoutInflater.from(themedContext).inflate(R.layout.widget_item, root, false)
                            row.measure(View.MeasureSpec.makeMeasureSpec(root.width - 2 * insetPx, View.MeasureSpec.EXACTLY),
                                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
                            val rowContent = row.findViewById<View>(R.id.widget_item_content)
                            assertEquals(themedContext.resources.getDimensionPixelSize(R.dimen.widget_row_height), row.measuredHeight)
                            assertEquals(themedContext.resources.getDimensionPixelSize(R.dimen.widget_row_inset_inline), rowContent.paddingLeft)
                            assertEquals(themedContext.resources.getDimensionPixelSize(R.dimen.widget_row_inset_block), rowContent.paddingTop)
                        }
                    }
                }
            }
        }
    }

    private fun assertHeaderAtContentSize(
        views: android.widget.RemoteViews,
        widthDp: Float,
        heightDp: Float,
        expectedUnitVisibility: Int
    ) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val density = context.resources.displayMetrics.density
            val contentWidthPx = (widthDp * density).toInt()
            val contentHeightPx = (heightDp * density).toInt()

            hostView.updateAppWidgetSize(
                Bundle(),
                widthDp.toInt(),
                heightDp.toInt(),
                widthDp.toInt(),
                heightDp.toInt()
            )
            layoutHost(contentWidthPx, contentHeightPx)
            hostView.updateAppWidget(views)
            layoutHost(contentWidthPx, contentHeightPx)

            assertEquals(
                "streak unit visibility at ${contentWidthPx}px, ${contentWidthPx / density}dp",
                expectedUnitVisibility,
                hostView.findViewById<View>(R.id.widget_streak_unit).visibility
            )
            assertEquals("Today", text(R.id.widget_header))
            assertEquals("3/7", text(R.id.widget_subtitle))
            assertEquals("3 of 7 completed", contentDescription(R.id.widget_subtitle))
            assertEquals("12", text(R.id.widget_streak))
            assertEquals("Refresh", contentDescription(R.id.widget_refresh))
            assertEquals("Refreshing", contentDescription(R.id.widget_refresh_loading))
        }
    }

    /** Pads the span so that the host's own width, which excludes its padding, is the one asked for. */
    private fun layoutHost(contentWidthPx: Int, contentHeightPx: Int) {
        val widthPx = contentWidthPx + hostView.paddingLeft + hostView.paddingRight
        val heightPx = contentHeightPx + hostView.paddingTop + hostView.paddingBottom
        hostView.measure(
            View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(heightPx, View.MeasureSpec.EXACTLY)
        )
        hostView.layout(0, 0, widthPx, heightPx)
    }

    private fun text(viewId: Int): String {
        return hostView.findViewById<TextView>(viewId).text.toString()
    }

    private fun contentDescription(viewId: Int): String {
        return hostView.findViewById<View>(viewId).contentDescription.toString()
    }

    companion object {
        private const val AUTH_TOKEN_KEY = "auth_token"
        private const val SIGNED_IN_TOKEN = "widget-instrumentation-session"
        private const val HOST_ID = 490
        private const val COMPACT_WIDTH_DP = 160f
        private const val EXPANDED_WIDTH_DP = 250f
        private const val WIDE_WIDTH_DP = 336f
        private const val SHORT_HEIGHT_DP = 96f
        private const val DEFAULT_HEIGHT_DP = 192f
        private const val TALL_HEIGHT_DP = 288f
    }
}
