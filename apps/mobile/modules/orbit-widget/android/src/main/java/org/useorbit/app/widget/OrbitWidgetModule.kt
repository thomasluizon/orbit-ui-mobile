package org.useorbit.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import org.json.JSONObject

class OrbitWidgetModule : Module() {
  companion object {
    private const val PREFS_NAME = "orbit_widget_prefs"
    private const val KEY_TOKEN = "auth_token"
    private const val CACHE_PREFS_NAME = "orbit_widget_cache"
    const val COLOR_KEY_PREFIX = "color_"
    private val NAME_IDENTIFIER_CLAIMS = listOf(
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
      "nameid",
      "sub"
    )

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
     * A non-reversible name for the session that owns a cached payload.
     *
     * The session is the ACCOUNT, never the access token. An access token rotates on every silent
     * refresh, and `apiClient` refreshes and retries on a 401 as a matter of routine, so a key made
     * from the token bytes threw away a cache that was still correct and made the app-pushed write
     * useless on the path that needs it most. The account claim survives a refresh and changes when
     * somebody else signs in, which is exactly the boundary the cache needs.
     *
     * Every writer of `habits_json` tags the payload with this key and `OrbitWidgetService` reads a
     * payload back only when the tag matches. One derivation serves both writers and the reader, so
     * an app-pushed payload and a natively fetched one are readable by the same account.
     *
     * The token stays in encrypted preferences; only this digest reaches the plain widget cache.
     */
    fun sessionKey(token: String): String =
      MessageDigest.getInstance("SHA-256")
        .digest((accountId(token) ?: token).toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }

    /**
     * The account a JWT names, or null when it names none.
     *
     * The three claims and their precedence are copied from `getUserFromPayload` in
     * `apps/mobile/stores/auth-store.ts`, which reads these same tokens in production. A token with
     * no identity falls back to the token itself above: that account keeps the older
     * one-extra-fetch-per-rotation behaviour and still cannot read another account's payload.
     */
    private fun accountId(token: String): String? {
      val segments = token.split(".")
      if (segments.size < 2) return null

      return try {
        val normalized = segments[1].replace('-', '+').replace('_', '/')
        val json = JSONObject(
          String(
            Base64.decode(normalized, Base64.NO_PADDING or Base64.NO_WRAP),
            Charsets.UTF_8
          )
        )
        NAME_IDENTIFIER_CLAIMS.firstNotNullOfOrNull { claim ->
          json.optString(claim).takeIf { it.isNotEmpty() }
        }
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

    AsyncFunction("syncTheme") { colors: Map<String, String> ->
      val context = moduleContext()
      val editor = context.getSharedPreferences(CACHE_PREFS_NAME, Context.MODE_PRIVATE).edit()
      for ((token, value) in colors) {
        editor.putString("$COLOR_KEY_PREFIX$token", value)
      }
      editor.apply()
      refreshWidgets(context)
    }

    AsyncFunction("syncWidgetData") { json: String, token: String ->
      val context = moduleContext()
      // The payload carries the session that produced it, exactly like the native fetch does.
      // Without the tag the widget cannot read this cache back, so it discards data the app has
      // already fetched, repeats the request natively, and keeps no fallback when that request
      // fails.
      //
      // OWNERSHIP COMES FROM THE CALLER, never from whichever token is current when this bridge
      // call runs. The app fetched under `token`, and a sign-out or an account switch can land
      // while that request is in flight. Reading the current token here would label one account's
      // habits with the next account's session and put them on their home screen.
      //
      // The comparison is between ACCOUNTS, not token bytes, so the silent refresh that
      // `apiClient` performs on a 401 keeps its own response rather than discarding it.
      val session = sessionKey(token)
      if (getToken(context)?.let { sessionKey(it) } == session) {
        context.getSharedPreferences(CACHE_PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putString("habits_json", json)
          .putString("habits_session", session)
          .putLong("habits_updated_at", System.currentTimeMillis())
          .putBoolean(OrbitWidgetProvider.CACHE_REFRESHING, false)
          .putBoolean(OrbitWidgetProvider.CACHE_LOADING_SKELETON, false)
          .apply()
      }
      refreshWidgets(context)
    }

    OnActivityEntersBackground {
      appContext.reactContext?.let { refreshWidgets(it) }
    }
  }
}
