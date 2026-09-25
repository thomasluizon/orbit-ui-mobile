package org.useorbit.app.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class PersistentReminderPresentationTest {
  @Test
  fun latePresentationCannotRestoreReminderAfterCancellation() {
    val presentation = PersistentReminderPresentation()
    val displayed = mutableSetOf("orbit-persistent-reminder")

    displayed.clear()
    presentation.cancel(1) { displayed.clear() }
    presentation.post(0) { displayed.add("orbit-persistent-reminder") }

    assertEquals(emptySet<String>(), displayed)
  }

  @Test
  fun cancellationDismissesAnEarlierPost() {
    val presentation = PersistentReminderPresentation()
    val displayed = mutableSetOf<String>()

    presentation.post(0) { displayed.add("orbit-persistent-reminder") }
    presentation.cancel(1) { displayed.clear() }

    assertEquals(emptySet<String>(), displayed)
  }

  @Test
  fun lateCancellationKeepsANewerReminder() {
    val presentation = PersistentReminderPresentation()
    val displayed = mutableSetOf<String>()

    presentation.post(1) { displayed.add("orbit-persistent-reminder") }
    presentation.cancel(1) { displayed.clear() }

    assertEquals(setOf("orbit-persistent-reminder"), displayed)
  }
}
