package org.useorbit.app.widget

internal class WidgetAccountState(
    private val lock: Any,
    private val publisher: WidgetPublisher,
    private val currentSession: () -> String?
) {
    fun replaceAccount(
        session: String?,
        saveToken: () -> Unit,
        clearCache: () -> Unit,
        repaint: () -> Unit
    ) {
        // WHY: #1656 credential completion must follow older cards and include the replacement repaint.
        publisher.runAndWait {
            synchronized(lock) {
                if (session == null || currentSession() != session) clearCache()
                saveToken()
            }
            repaint()
        }
    }
}
