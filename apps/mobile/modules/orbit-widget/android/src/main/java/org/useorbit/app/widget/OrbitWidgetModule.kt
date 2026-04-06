package org.useorbit.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OrbitWidgetModule : Module() {
  companion object {
    private const val PREFS_NAME = "orbit_widget_prefs"
    private const val KEY_TOKEN = "auth_token"
    private const val CACHE_PREFS_NAME = "orbit_widget_cache"

    fun getEncryptedPrefs(context: Context): SharedPreferences {
      return try {
        createEncryptedPrefs(context)
      } catch (_: Exception) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
        val prefsFile = java.io.File(context.filesDir.parent, "shared_prefs/$PREFS_NAME.xml")
        prefsFile.delete()
        createEncryptedPrefs(context)
      }
    }

    private fun createEncryptedPrefs(context: Context): SharedPreferences {
      val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

      return EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )
    }

    fun getToken(context: Context): String? {
      return try {
        getEncryptedPrefs(context).getString(KEY_TOKEN, null)
      } catch (_: Exception) {
        null
      }
    }

    fun clearWidgetCache(context: Context) {
      context.getSharedPreferences(CACHE_PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .clear()
        .apply()
    }

    fun refreshWidgets(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val widgetIds = appWidgetManager.getAppWidgetIds(
        ComponentName(context, OrbitWidgetProvider::class.java)
      )

      if (widgetIds.isEmpty()) {
        return
      }

      for (id in widgetIds) {
        OrbitWidgetProvider.updateWidgetLayout(context, appWidgetManager, id)
      }

      appWidgetManager.notifyAppWidgetViewDataChanged(widgetIds, R.id.widget_list)
    }
  }

  private fun moduleContext(): Context {
    return appContext.reactContext ?: appContext.throwingActivity.applicationContext
  }

  override fun definition() = ModuleDefinition {
    Name("OrbitWidget")

    AsyncFunction("saveToken") { token: String ->
      val context = moduleContext()
      getEncryptedPrefs(context).edit().putString(KEY_TOKEN, token).apply()
      refreshWidgets(context)
    }

    AsyncFunction("clearToken") {
      val context = moduleContext()
      getEncryptedPrefs(context).edit().remove(KEY_TOKEN).apply()
      clearWidgetCache(context)
      refreshWidgets(context)
    }

    AsyncFunction("syncTheme") { colorScheme: String, themeMode: String ->
      val context = moduleContext()
      context.getSharedPreferences(CACHE_PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString("color_scheme", colorScheme)
        .putString("theme_mode", themeMode)
        .apply()
      refreshWidgets(context)
    }

    AsyncFunction("refresh") {
      refreshWidgets(moduleContext())
    }

    OnActivityEntersBackground {
      appContext.reactContext?.let { refreshWidgets(it) }
    }
  }
}
