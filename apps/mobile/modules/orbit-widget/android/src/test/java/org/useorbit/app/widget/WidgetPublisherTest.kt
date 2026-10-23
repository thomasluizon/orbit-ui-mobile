package org.useorbit.app.widget

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
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

    @Test
    fun `enqueue returns while publication is blocked and completes each broadcast in order`() {
        withPublisher { publisher ->
            val caller = Thread.currentThread()
            val entered = CountDownLatch(1)
            val release = CountDownLatch(1)
            val events = CopyOnWriteArrayList<String>()
            val first = publisher.enqueue(onComplete = { events.add("first finished") }) {
                assertNotEquals(caller, Thread.currentThread())
                entered.countDown()
                check(release.await(2, TimeUnit.SECONDS))
                publisher.publish({ "card" }) { events.add(it) }
            }
            try {
                assertTrue(entered.await(1, TimeUnit.SECONDS))
                val second = publisher.enqueue(onComplete = { events.add("second finished") }) {
                    events.add("second update")
                }
                assertFalse(first.isDone)
                assertFalse(second.isDone)
                release.countDown()
                second.get(3, TimeUnit.SECONDS)
                first.get(3, TimeUnit.SECONDS)
                assertEquals(listOf("card", "first finished", "second update", "second finished"), events)
            } finally {
                release.countDown()
            }
        }
    }

    @Test
    fun `failed publication finishes once and leaves the queue usable`() {
        withPublisher { publisher ->
            val completions = AtomicInteger()
            val failed = publisher.enqueue(onComplete = { completions.incrementAndGet() }) {
                publisher.publish({ "card" }) { error("Manager rejected card") }
            }
            val failure = assertThrows(ExecutionException::class.java) {
                failed.get(2, TimeUnit.SECONDS)
            }
            assertEquals("Manager rejected card", failure.cause?.message)
            assertEquals(1, completions.get())
            val recovered = CompletableFuture<String>()
            publisher.enqueue {
                publisher.publish({ "replacement card" }) { recovered.complete(it) }
            }.get(2, TimeUnit.SECONDS)
            assertEquals("replacement card", recovered.get(2, TimeUnit.SECONDS))
        }
    }

    @Test
    fun `publication rejects callers outside the serial queue`() {
        withPublisher { publisher ->
            assertThrows(IllegalStateException::class.java) {
                publisher.publish({ "card" }) { error("Caller published directly") }
            }
        }
    }

    @Test
    fun `publication rejects an outer account lock even on the serial queue`() {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            val failed = publisher.enqueue {
                synchronized(accountLock) {
                    publisher.publish({ "card" }) { error("Published under outer account lock") }
                }
            }
            val failure = assertThrows(ExecutionException::class.java) {
                failed.get(2, TimeUnit.SECONDS)
            }
            assertTrue(failure.cause is IllegalStateException)
        }
    }

    @Test
    fun `factory can queue an account change render without waiting for the active publish`() {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            val conversion = Executors.newSingleThreadExecutor()
            val rendered = CompletableFuture<String?>()
            var account: String? = "A"
            var cachedHabit: String? = "A private habit"
            val accounts = WidgetAccountState(accountLock) { account }
            try {
                val initial = publisher.enqueue {
                    publisher.publish({ cachedHabit }) {
                        conversion.submit {
                            accounts.replaceAccount(
                                "B", saveToken = { account = "B" }, clearCache = { cachedHabit = null }
                            )
                            publisher.enqueue {
                                publisher.publish({ cachedHabit }) { rendered.complete(it) }
                            }
                        }.get(1, TimeUnit.SECONDS)
                    }
                }
                initial.get(3, TimeUnit.SECONDS)
                assertEquals(null, rendered.get(3, TimeUnit.SECONDS))
                assertEquals("B", account)
            } finally {
                conversion.shutdownNow()
                check(conversion.awaitTermination(2, TimeUnit.SECONDS))
            }
        }
    }

    private fun withPublisher(accountLock: Any = Any(), test: (WidgetPublisher) -> Unit) {
        val serial = Executors.newSingleThreadExecutor()
        try {
            test(WidgetPublisher(accountLock, serial))
        } finally {
            serial.shutdownNow()
            check(serial.awaitTermination(2, TimeUnit.SECONDS))
        }
    }
}
