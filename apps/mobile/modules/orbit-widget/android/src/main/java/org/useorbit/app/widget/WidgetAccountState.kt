package org.useorbit.app.widget

internal data class WidgetCache(val json: String?, val session: String?, val updatedAt: Long)

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

    fun <T> withCurrentAccount(session: () -> String?, fallback: T, action: () -> T): T =
        synchronized(lock) {
            val owner = session()
            if (owner != null && currentSession() == owner) action() else fallback
        }

    fun <T : Any> resolve(
        session: String,
        readCache: () -> WidgetCache,
        fetch: () -> String?,
        parse: (String?) -> T?,
        writeCache: (String, String) -> Unit,
        now: () -> Long = System::currentTimeMillis
    ): T? {
        val cached = withCurrentAccount<WidgetCache?>({ session }, null) {
            readCache().takeIf { it.session == session }
        }
        val cachedPayload = parse(cached?.json)
        val cacheAge = now() - (cached?.updatedAt ?: 0L)
        if (cachedPayload != null && cacheAge in 0L..15_000L) return cachedPayload

        val freshJson = fetch()
        val freshPayload = parse(freshJson)
        return withCurrentAccount<T?>({ session }, null) {
            if (freshPayload != null && freshJson != null) {
                writeCache(freshJson, session)
                freshPayload
            } else {
                cachedPayload
            }
        }
    }
}
