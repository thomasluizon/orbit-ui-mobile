package org.useorbit.app.widget

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

private class WidgetFixture {
    val lock = Any()
    @Volatile var session: String? = "A"
    var clock = 100_000L
    var cache = WidgetCache(null, null, 0L)
    var rows = emptyList<String>()
    var rowsSession: String? = null
    val accounts = WidgetAccountState(lock) { session }

    fun save(account: String) = accounts.replaceAccount(
        account,
        saveToken = { session = account },
        clearCache = { cache = WidgetCache(null, null, 0L) }
    )

    fun logout() = synchronized(lock) {
        session = null
        cache = WidgetCache(null, null, 0L)
    }

    fun resolve(account: String, fetch: () -> String?): String? = accounts.resolve(
        session = account,
        readCache = { cache },
        fetch = fetch,
        parse = { it?.takeUnless { json -> json == "invalid" } },
        writeCache = { json, owner -> cache = WidgetCache(json, owner, clock) },
        now = { clock }
    )

    fun publish(account: String, payload: String?) = accounts.withCurrentAccount({ account }, Unit) {
        rows = listOfNotNull(payload)
        rowsSession = account
    }

    fun count(): Int = accounts.withCurrentAccount({ rowsSession }, 0) { rows.size }
    fun row(): String? = accounts.withCurrentAccount({ rowsSession }, null as String?) { rows.firstOrNull() }
}

private fun expectEqual(expected: Any?, actual: Any?) {
    check(expected == actual) { "Expected <$expected>, got <$actual>" }
}

private fun delayedFetch(changeAccount: (WidgetFixture) -> Unit): WidgetFixture {
    val fixture = WidgetFixture()
    val fetching = CountDownLatch(1)
    val resume = CountDownLatch(1)
    val failure = AtomicReference<Throwable?>()
    val worker = Thread {
        try {
            val payload = fixture.resolve("A") {
                fetching.countDown()
                check(resume.await(5, TimeUnit.SECONDS)) { "Fetch was never released" }
                "A private habit"
            }
            fixture.publish("A", payload)
        } catch (error: Throwable) {
            failure.set(error)
        }
    }
    worker.start()
    try {
        check(fetching.await(5, TimeUnit.SECONDS)) { "Fetch never started" }
        changeAccount(fixture)
    } finally {
        resume.countDown()
        worker.join(5_000L)
    }
    check(!worker.isAlive) { "Fetch never completed" }
    failure.get()?.let { throw it }
    return fixture
}

fun main() {
    val tests = linkedMapOf<String, () -> Unit>(
        "delayed A fetch after logout and B sign-in cannot enter B cached fallback" to {
            val fixture = delayedFetch { it.logout(); it.save("B") }
            fixture.clock += 15_001L
            expectEqual(null, fixture.resolve("B") { null })
            expectEqual(null, fixture.cache.json)
        },
        "delayed A fetch after logout and B sign-in cannot publish factory rows" to {
            val fixture = delayedFetch { it.logout(); it.save("B") }
            expectEqual(0, fixture.count())
            expectEqual(null, fixture.row())
            expectEqual(emptyList<String>(), fixture.rows)
        },
        "delayed A fetch after logout cannot restore cleared cache or factory rows" to {
            val fixture = delayedFetch { it.logout() }
            expectEqual(null, fixture.cache.json)
            expectEqual(0, fixture.count())
            expectEqual(null, fixture.row())
        },
        "direct credential replacement clears A fresh cache" to {
            val fixture = WidgetFixture()
            fixture.cache = WidgetCache("A private habit", "A", fixture.clock)
            fixture.save("B")
            expectEqual(null, fixture.resolve("B") { null })
            expectEqual(null, fixture.cache.json)
        },
        "factory output rejects rows retained across direct account replacement" to {
            val fixture = WidgetFixture()
            fixture.publish("A", "A private habit")
            expectEqual(1, fixture.count())
            expectEqual("A private habit", fixture.row())
            fixture.save("B")
            expectEqual(0, fixture.count())
            expectEqual(null, fixture.row())
        },
        "post-fetch publication rejects an account changed after resolution" to {
            val fixture = WidgetFixture()
            val payload = fixture.resolve("A") { "A private habit" }
            fixture.save("B")
            fixture.publish("A", payload)
            expectEqual(emptyList<String>(), fixture.rows)
        },
        "fresh foreign and unlabelled caches are rejected even without a successful fetch" to {
            for (owner in listOf("A", null)) {
                val fixture = WidgetFixture()
                fixture.session = "B"
                fixture.cache = WidgetCache("A private habit", owner, fixture.clock)
                expectEqual(null, fixture.resolve("B") { null })
            }
        },
        "native fetch labels its cache and publishes current account rows" to {
            val fixture = WidgetFixture()
            fixture.publish("A", fixture.resolve("A") { "A private habit" })
            expectEqual("A", fixture.cache.session)
            expectEqual(1, fixture.count())
            expectEqual("A private habit", fixture.row())
            expectEqual("A private habit", fixture.resolve("A") { error("Fresh cache must win") })
        },
        "same-account token rotation preserves fresh cache and factory output" to {
            val fixture = WidgetFixture()
            fixture.cache = WidgetCache("A private habit", "A", fixture.clock)
            fixture.publish("A", "A private habit")
            fixture.save("A")
            expectEqual("A private habit", fixture.resolve("A") { error("Fresh cache must win") })
            expectEqual(1, fixture.count())
            expectEqual("A private habit", fixture.row())
        },
        "same-account stale cache survives network and parse failures" to {
            val fixture = WidgetFixture()
            fixture.cache = WidgetCache("A private habit", "A", fixture.clock - 15_001L)
            expectEqual("A private habit", fixture.resolve("A") { null })
            expectEqual("A private habit", fixture.resolve("A") { "invalid" })
        },
        "new account can fetch cache and render its own rows after replacement" to {
            val fixture = WidgetFixture()
            fixture.cache = WidgetCache("A private habit", "A", fixture.clock)
            fixture.save("B")
            fixture.publish("B", fixture.resolve("B") { "B private habit" })
            expectEqual("B", fixture.cache.session)
            expectEqual(1, fixture.count())
            expectEqual("B private habit", fixture.row())
        },
        "signed-out factory output is empty even when the owner is absent" to {
            val fixture = WidgetFixture()
            fixture.logout()
            expectEqual(0, fixture.accounts.withCurrentAccount({ null }, 0) { 1 })
        }
    )
    var failures = 0
    for ((name, test) in tests) {
        try {
            test()
            println("PASS: $name")
        } catch (error: Throwable) {
            failures++
            System.err.println("FAIL: $name: ${error.message}")
        }
    }
    check(failures == 0) { "$failures of ${tests.size} widget ownership tests failed" }
}
