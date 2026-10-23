package org.useorbit.app.widget

import java.util.concurrent.Executors
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class WidgetPublisherTest {
    @Test
    fun `adapter conversion can reenter the account lock while publication waits`() {
        val accountLock = Any()
        val serial = Executors.newSingleThreadExecutor()
        val publisher = WidgetPublisher(accountLock, serial)
        val conversion = Executors.newSingleThreadExecutor()
        val completed = CompletableFuture<Unit>()
        try {
            publisher.enqueue {
                try {
                    publisher.publish(
                        build = {
                            check(Thread.holdsLock(accountLock))
                            "signed-out card"
                        },
                        publishViews = { card ->
                            val converted = conversion.submit<String> {
                                synchronized(accountLock) { card }
                            }
                            assertEquals(card, converted.get(1, TimeUnit.SECONDS))
                            assertFalse(Thread.holdsLock(accountLock))
                        }
                    )
                    completed.complete(Unit)
                } catch (exception: Throwable) {
                    completed.completeExceptionally(exception)
                }
            }
            completed.get(3, TimeUnit.SECONDS)
        } finally {
            serial.shutdownNow()
            conversion.shutdownNow()
            check(serial.awaitTermination(2, TimeUnit.SECONDS))
            check(conversion.awaitTermination(2, TimeUnit.SECONDS))
        }
    }
}
