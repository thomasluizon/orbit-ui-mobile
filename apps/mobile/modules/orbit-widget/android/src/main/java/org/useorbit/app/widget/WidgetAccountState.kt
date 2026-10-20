package org.useorbit.app.widget

internal class WidgetAccountState(
    private val lock: Any,
    private val currentSession: () -> String?
) {
    fun replaceAccount(session: String, saveToken: () -> Unit, clearCache: () -> Unit) {
        synchronized(lock) {
            if (currentSession() != session) clearCache()
            saveToken()
        }
    }

}
