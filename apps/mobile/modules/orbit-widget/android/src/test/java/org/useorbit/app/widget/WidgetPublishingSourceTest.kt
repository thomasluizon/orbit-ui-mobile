package org.useorbit.app.widget

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetPublishingSourceTest {
    private val sourceDirectory = File("src/main/java/org/useorbit/app/widget")

    @Test
    fun `account critical sections cannot call a framework publisher or provider render`() {
        for (file in sourceDirectory.listFiles().orEmpty().filter { it.extension == "kt" }) {
            val source = file.readText()
                .replace(Regex("\"(?:\\\\.|[^\"\\\\])*\""), "\"\"")
                .replace(Regex("//[^\\n]*|/\\*[\\s\\S]*?\\*/"), "")
            for (match in Regex("synchronized\\([^)]*\\)\\s*\\{").findAll(source)) {
                val criticalSection = blockAt(source, source.indexOf('{', match.range.first))
                for (call in listOf(
                    "updateAppWidget(", "partiallyUpdateAppWidget(",
                    "notifyAppWidgetViewDataChanged(", "updateWidgetLayout(", "renderWidgets(",
                    "widgetPublisher.publish(", "publishViews(", "runAndWait("
                )) {
                    assertFalse("${file.name}: $call inside account lock", criticalSection.contains(call))
                }
            }
        }
    }

    @Test
    fun `credential callbacks serialize their transition and repaint together`() {
        val source = File(sourceDirectory, "OrbitWidgetModule.kt").readText()
        for (callback in listOf("saveToken", "clearToken")) {
            val start = source.indexOf("AsyncFunction(\"$callback\")")
            val body = blockAt(source, source.indexOf('{', start))
            assertTrue(body.contains("WidgetAccountState(accountRenderLock, widgetPublisher)"))
            assertTrue(body.contains(".replaceAccount("))
            assertTrue(body.contains("repaint = { refreshWidgetsInBackground(context) }"))
            assertFalse(body.contains("synchronized("))
            assertFalse(body.contains("refreshWidgets(context)"))
        }
    }

    @Test
    fun `receiver callbacks retain the broadcast until queued publication completes`() {
        val source = File(sourceDirectory, "OrbitWidgetProvider.kt").readText()
        for (callback in listOf("onReceive", "onUpdate", "onAppWidgetOptionsChanged")) {
            val start = source.indexOf("override fun $callback(")
            val body = blockAt(source, source.indexOf('{', start))
            assertTrue("$callback must enqueue", body.contains("enqueueUpdate(context)"))
            assertFalse(body.contains(".updateAppWidget("))
        }
        val start = source.indexOf("private fun enqueueUpdate(")
        val body = blockAt(source, source.indexOf('{', start))
        assertTrue(body.contains("goAsync()"))
        assertTrue(body.contains("onComplete = { pendingResult?.finish() }"))
    }

    @Test
    fun `factory publication is deferred and does not request another collection reload`() {
        val source = File(sourceDirectory, "OrbitWidgetService.kt").readText()
        val start = source.indexOf("private fun renderWidgets(")
        val body = blockAt(source, source.indexOf('{', start))
        assertTrue(body.contains("enqueueWidgetUpdate"))
        assertFalse(source.contains("notifyAppWidgetViewDataChanged("))
        assertTrue(source.contains("if (cardState() != previousCardState) renderWidgets()"))
    }

    @Test
    fun `framework card publication is confined to publisher callbacks`() {
        val calls = sourceDirectory.listFiles().orEmpty().filter { it.extension == "kt" }
            .flatMap { file -> file.readLines().filter { it.contains(".updateAppWidget(") } }
        assertTrue(calls.isNotEmpty())
        for (call in calls) {
            assertTrue(call.trim().startsWith("publishViews = { views -> "))
        }
        assertFalse(sourceDirectory.listFiles().orEmpty().any {
            it.extension == "kt" && it.readText().contains(".partiallyUpdateAppWidget(")
        })
    }

    private fun blockAt(source: String, openingBrace: Int): String {
        check(openingBrace >= 0)
        var depth = 0
        for (index in openingBrace until source.length) {
            if (source[index] == '{') depth++
            if (source[index] == '}' && --depth == 0) return source.substring(openingBrace, index + 1)
        }
        error("Unclosed source block")
    }
}
