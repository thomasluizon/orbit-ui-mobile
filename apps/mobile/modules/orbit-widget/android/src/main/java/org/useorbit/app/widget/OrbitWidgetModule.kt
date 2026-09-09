package org.useorbit.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

class OrbitWidgetModule : Module() {
  companion object {
    private const val PREFS_NAME = "orbit_widget_prefs"
    private const val KEY_TOKEN = "auth_token"
    private const val CACHE_PREFS_NAME = "orbit_widget_cache"
    const val COLOR_KEY_PREFIX = "color_"

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

    /**
     * A non-reversible name for the session that owns a cached payload. The token itself lives in
     * encrypted preferences, so its digest goes into the plain widget cache rather than the token.
     *
     * Every writer of `habits_json` tags the payload with this key, and `OrbitWidgetService`
     * reads a payload back only when the tag matches the current token. One derivation serves both
     * writers, so an app-pushed payload and a natively fetched one are readable by the same session.
     */
    fun sessionKey(token: String): String =
      MessageDigest.getInstance("SHA-256")
        .digest(token.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }

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

    AsyncFunction("syncTheme") { colors: Map<String, String> ->
      val context = moduleContext()
      val editor = context.getSharedPreferences(CACHE_PREFS_NAME, Context.MODE_PRIVATE).edit()
      for ((token, value) in colors) {
        editor.putString("$COLOR_KEY_PREFIX$token", value)
      }
      editor.apply()
      refreshWidgets(context)
    }

    AsyncFunction("syncWidgetData") { json: String ->
      val context = moduleContext()
      // The payload carries the session that produced it, exactly like the native fetch does.
      // Without the tag the widget cannot read this cache back, so it discards data the app has
      // already fetched, repeats the request natively, and keeps no fallback when that request
      // fails. A payload pushed with no token belongs to no session, so it is not written at all.
      val token = getToken(context)
      if (token != null) {
        context.getSharedPreferences(CACHE_PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putString("habits_json", json)
          .putString("habits_session", sessionKey(token))
          .putLong("habits_updated_at", System.currentTimeMillis())
          .apply()
      }
      refreshWidgets(context)
    }

    OnActivityEntersBackground {
      appContext.reactContext?.let { refreshWidgets(it) }
    }
  }
}
