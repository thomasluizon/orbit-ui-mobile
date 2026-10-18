package org.useorbit.app.bundle

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.updates.UpdatesController
import java.util.concurrent.atomic.AtomicBoolean

class OrbitDesignBundleModule : Module() {
  companion object {
    private val launchClaimed = AtomicBoolean(false)

    fun prepareEmbeddedLaunch(context: Context) {
      UpdatesController.initializeWithoutStarting(context, false)
      UpdatesController.instance.setUpdateRequestHeadersOverride(
        mapOf("expo-channel-name" to "legacy", "orbit-design-launch" to "embedded")
      )
      UpdatesController.instance.start()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OrbitDesignBundle")

    Function("claimLaunch") {
      launchClaimed.compareAndSet(false, true)
    }
  }
}
