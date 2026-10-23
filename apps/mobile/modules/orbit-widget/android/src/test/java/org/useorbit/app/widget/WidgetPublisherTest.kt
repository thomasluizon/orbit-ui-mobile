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
    fun `account replacement cannot complete before an earlier card is delivered`() {
        assertTransitionOrdersDeliveries("B")
    }

    @Test
    fun `sign out cannot complete before an earlier card is delivered`() {
        assertTransitionOrdersDeliveries(null)
    }

    private fun assertTransitionOrdersDeliveries(nextAccount: String?) {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            var account: String? = "A"
            var cachedHeader: String? = "A private progress and streak"
            val accounts = WidgetAccountState(accountLock, publisher) { account }
            val built = CountDownLatch(1)
            val release = CountDownLatch(1)
            val transitionStarted = CountDownLatch(1)
            val transitionCompleted = CountDownLatch(1)
            val events = CopyOnWriteArrayList<String>()
            val deliveries = CopyOnWriteArrayList<Pair<String?, String?>>()
            val initial = publisher.enqueue {
                publisher.publish({ cachedHeader }) { card ->
                    built.countDown()
                    check(release.await(3, TimeUnit.SECONDS))
                    deliveries.add(account to card)
                    events.add("delivered A")
                }
            }
            val moduleThread = Executors.newSingleThreadExecutor()
            try {
                assertTrue(built.await(1, TimeUnit.SECONDS))
                val transition = moduleThread.submit {
                    transitionStarted.countDown()
                    accounts.replaceAccount(
                        nextAccount,
                        saveToken = { account = nextAccount },
                        clearCache = { cachedHeader = null },
                        repaint = {
                            publisher.publish({ cachedHeader }) { card ->
                                deliveries.add(account to card)
                                events.add("delivered replacement")
                            }
                        }
                    )
                    events.add("transition completed")
                    transitionCompleted.countDown()
                }
                assertTrue(transitionStarted.await(1, TimeUnit.SECONDS))
                transitionCompleted.await(200, TimeUnit.MILLISECONDS)
                release.countDown()
                initial.get(3, TimeUnit.SECONDS)
                transition.get(3, TimeUnit.SECONDS)
                assertEquals(
                    listOf("A" to "A private progress and streak", nextAccount to null), deliveries
                )
                assertEquals(
                    listOf("delivered A", "delivered replacement", "transition completed"), events
                )
            } finally {
                release.countDown()
                moduleThread.shutdownNow()
                check(moduleThread.awaitTermination(2, TimeUnit.SECONDS))
            }
        }
    }

    @Test
    fun `factory can queue a render without waiting for the active publish`() {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            val conversion = Executors.newSingleThreadExecutor()
            val rendered = CompletableFuture<String?>()
            var cachedHabit: String? = "A private habit"
            try {
                val initial = publisher.enqueue {
                    publisher.publish({ cachedHabit }) {
                        conversion.submit {
                            synchronized(accountLock) { cachedHabit = null }
                            publisher.enqueue {
                                publisher.publish({ cachedHabit }) { rendered.complete(it) }
                            }
                        }.get(1, TimeUnit.SECONDS)
                    }
                }
                initial.get(3, TimeUnit.SECONDS)
                assertEquals(null, rendered.get(3, TimeUnit.SECONDS))
            } finally {
                conversion.shutdownNow()
                check(conversion.awaitTermination(2, TimeUnit.SECONDS))
            }
        }
    }

    @Test
    fun `account transition rejects waiting under the account lock or on the publisher`() {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            val accounts = WidgetAccountState(accountLock, publisher) { "A" }
            fun replace() = accounts.replaceAccount("B", {}, {}, {})
            synchronized(accountLock) {
                assertThrows(IllegalStateException::class.java) { replace() }
            }
            val failed = publisher.enqueue { replace() }
            val failure = assertThrows(ExecutionException::class.java) {
                failed.get(2, TimeUnit.SECONDS)
            }
            assertTrue(failure.cause is IllegalStateException)
        }
    }

    @Test
    fun `token rotation keeps the cache and repaints before the transition returns`() {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            var token = "old token"
            val events = CopyOnWriteArrayList<String>()
            val accounts = WidgetAccountState(accountLock, publisher) { "A" }
            accounts.replaceAccount(
                "A",
                saveToken = {
                    assertTrue(Thread.holdsLock(accountLock))
                    token = "new token"
                    events.add("token replaced")
                },
                clearCache = { error("Token rotation cleared the cache") },
                repaint = {
                    publisher.publish({ token }) {
                        assertFalse(Thread.holdsLock(accountLock))
                        events.add(it)
                    }
                }
            )
            assertEquals(listOf("token replaced", "new token"), events)
        }
    }

    @Test
    fun `account transition reports failure and leaves the publisher usable`() {
        val accountLock = Any()
        withPublisher(accountLock) { publisher ->
            val accounts = WidgetAccountState(accountLock, publisher) { "A" }
            val failure = assertThrows(ExecutionException::class.java) {
                accounts.replaceAccount("B", { error("Credential storage failed") }, {}, {})
            }
            assertEquals("Credential storage failed", failure.cause?.message)
            accounts.replaceAccount("B", {}, {}, { publisher.publish({ "B card" }) {} })
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
