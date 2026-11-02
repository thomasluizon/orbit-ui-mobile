package org.useorbit.app.update

import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.InstallException
import com.google.android.play.core.install.model.InstallErrorCode
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
          val serviceUnavailable = (error is InstallException && (
            error.errorCode == InstallErrorCode.ERROR_API_NOT_AVAILABLE ||
              error.errorCode == InstallErrorCode.ERROR_PLAY_STORE_NOT_FOUND
            )) || error.message == "Failed to bind to the service."
          val code = if (serviceUnavailable) "ERR_APP_UPDATE_SERVICE_UNAVAILABLE" else "ERR_APP_UPDATE_CHECK"
          promise.reject(code, error.message, error)
        }
    }
  }
}
