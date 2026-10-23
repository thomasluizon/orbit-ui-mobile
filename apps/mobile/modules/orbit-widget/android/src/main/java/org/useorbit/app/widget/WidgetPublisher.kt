package org.useorbit.app.widget

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future

internal class WidgetPublisher(
    private val accountLock: Any,
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
) {
    private val publishing = ThreadLocal<Boolean>()

    fun enqueue(onComplete: () -> Unit = {}, action: () -> Unit): Future<*> =
        executor.submit {
            publishing.set(true)
            try {
                action()
            } finally {
                publishing.remove()
                onComplete()
            }
        }

    fun <Views> publish(build: () -> Views, publishViews: (Views) -> Unit) {
        check(publishing.get() == true)
        check(!Thread.holdsLock(accountLock))
        val views = synchronized(accountLock) { build() }
        // WHY: #1656 adapter conversion waits for factory callbacks that take the account lock.
        publishViews(views)
    }
}
