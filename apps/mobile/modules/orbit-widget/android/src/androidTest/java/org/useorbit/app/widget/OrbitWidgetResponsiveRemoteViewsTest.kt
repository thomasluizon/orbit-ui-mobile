package org.useorbit.app.widget

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.TextView
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
@SdkSuppress(minSdkVersion = 31)
class OrbitWidgetResponsiveRemoteViewsTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val appWidgetHost = AppWidgetHost(context, HOST_ID)
    private lateinit var hostView: AppWidgetHostView
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    @Before
    fun setUp() {
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

        context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            .edit()
            .putString("header_label", "Today")
            .putInt("habit_count", 7)
            .putInt("completed_count", 3)
            .putInt("user_streak", 12)
            .putString("lang", "en")
            .putLong("habits_updated_at", 1L)
            .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
            .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, false)
            .commit()
    }

    @After
    fun tearDown() {
        InstrumentationRegistry.getInstrumentation().uiAutomation.dropShellPermissionIdentity()
        context.getSharedPreferences("orbit_widget_cache", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        appWidgetHost.stopListening()
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            appWidgetHost.deleteAppWidgetId(appWidgetId)
        }
    }

    /**
     * The host reads its own width as laid out pixels divided by the display density, so the only
     * widths that can occur are pixel derived. The transition is sampled at the last pixel that
     * still measures at or below the breakpoint and at the first pixel above it, because
     * RemoteViews.findBestFitLayout takes the nearest fitting key rather than the largest one.
     */
    @Test
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
            assertEquals("3 of 7 completed", text(R.id.widget_subtitle))
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
        private const val HOST_ID = 490
        private const val COMPACT_WIDTH_DP = 160f
        private const val EXPANDED_WIDTH_DP = 250f
        private const val WIDE_WIDTH_DP = 336f
        private const val SHORT_HEIGHT_DP = 96f
        private const val DEFAULT_HEIGHT_DP = 192f
        private const val TALL_HEIGHT_DP = 288f
    }
}
