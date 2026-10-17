package org.useorbit.app.update

import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.InstallStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OrbitAppUpdateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OrbitAppUpdate")

    AsyncFunction("isUpdateDownloaded") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      AppUpdateManagerFactory.create(context).appUpdateInfo
        .addOnSuccessListener { update ->
          promise.resolve(update.installStatus() == InstallStatus.DOWNLOADED)
        }
        .addOnFailureListener { error ->
          promise.reject("ERR_APP_UPDATE_CHECK", error.message, error)
        }
    }
  }
}
