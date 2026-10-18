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
      // WHY #1419: Expo captures startup headers before its public setter can reset them.
      // The installed UpdatesConfigurationOverride source and a compatibility test pin these keys.
      context.getSharedPreferences("dev.expo.updates.prefs", Context.MODE_PRIVATE)
        .edit()
        .remove("updatesConfigOverride")
        .apply()
      UpdatesController.initialize(context, false)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("OrbitDesignBundle")

    Function("claimLaunch") {
      launchClaimed.compareAndSet(false, true)
    }
  }
}
