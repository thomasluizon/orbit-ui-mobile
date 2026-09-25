package org.useorbit.app.widget

internal class PersistentReminderPresentation {
  private var cancelledAtGeneration = -1
  private var displayedGeneration: Int? = null

  @Synchronized
  fun post(generation: Int, present: () -> Unit) {
    if (generation < cancelledAtGeneration) return
    if (displayedGeneration?.let { generation < it } == true) return
    present()
    displayedGeneration = generation
  }

  @Synchronized
  fun cancel(generation: Int, dismiss: () -> Unit) {
    cancelledAtGeneration = maxOf(cancelledAtGeneration, generation)
    if (displayedGeneration?.let { it >= generation } == true) return
    dismiss()
    displayedGeneration = null
  }
}
