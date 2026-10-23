package org.useorbit.app.widget

import java.util.concurrent.Executor
import java.util.concurrent.Executors

internal class WidgetPublisher(
    private val accountLock: Any,
    private val executor: Executor = Executors.newSingleThreadExecutor()
) {
    private val publishing = ThreadLocal<Boolean>()

    fun enqueue(onComplete: () -> Unit = {}, action: () -> Unit) {
        executor.execute {
            publishing.set(true)
            try {
                action()
            } finally {
                publishing.remove()
                onComplete()
            }
        }
    }

    fun <Views> publish(build: () -> Views, publishViews: (Views) -> Unit) {
        check(publishing.get() == true)
        val views = synchronized(accountLock) { build() }
        // WHY: #1656 adapter conversion waits for factory callbacks that take the account lock.
        publishViews(views)
    }
}
