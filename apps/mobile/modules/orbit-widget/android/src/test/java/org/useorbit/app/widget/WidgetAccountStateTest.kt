package org.useorbit.app.widget

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

fun main() {
    val lock = Any()
    var session: String? = "A"
    var cachedHabit: String? = "A private habit"
    val accounts = WidgetAccountState(lock) { session }
    fun save(account: String) = accounts.replaceAccount(
        account,
        saveToken = { session = account },
        clearCache = { cachedHabit = null }
    )

    save("A")
    check(cachedHabit == "A private habit") { "Token rotation cleared the same account's cache" }
    save("B")
    check(session == "B" && cachedHabit == null) { "Account replacement retained private cache" }
    cachedHabit = "B private habit"
    session = null
    save("B")
    check(cachedHabit == null) { "Signing back in retained a signed-out cache" }

    val attempted = CountDownLatch(1)
    val replaced = CountDownLatch(1)
    val worker = Thread {
        attempted.countDown()
        save("C")
        replaced.countDown()
    }
    synchronized(lock) {
        worker.start()
        check(attempted.await(5, TimeUnit.SECONDS)) { "Replacement did not start" }
        check(!replaced.await(100, TimeUnit.MILLISECONDS)) { "Replacement raced provider publication" }
        check(session == "B") { "The account changed while the provider held its render lock" }
    }
    worker.join(5_000L)
    check(!worker.isAlive && replaced.count == 0L && session == "C") { "Replacement never completed" }
    println("PASS: cache ownership, token rotation and serialized account replacement")
}
