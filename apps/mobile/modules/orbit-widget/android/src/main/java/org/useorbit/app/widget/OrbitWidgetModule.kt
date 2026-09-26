package org.useorbit.app.widget

import android.appwidget.AppWidgetManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import org.json.JSONObject

class OrbitWidgetModule : Module() {
  companion object {
    private val reminderPresentation = PersistentReminderPresentation()
    private const val REMINDER_TAG = "orbit-persistent-reminder"
    private const val REMINDER_CHANNEL = "persistent-reminder"
    private const val PREFS_NAME = "orbit_widget_prefs"
    private const val KEY_TOKEN = "auth_token"
    private const val CACHE_PREFS_NAME = "orbit_widget_cache"
    internal val accountRenderLock = Any()
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
     * A non-reversible name for the session that owns a cached payload. The session is the
     * ACCOUNT, never the access token.
     */
    fun sessionKey(token: String): String =
      MessageDigest.getInstance("SHA-256")
        .digest((accountId(token) ?: token).toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }

    /**
     * The account a JWT names, or null when it names none. The three claims and their precedence
     * are copied from `getUserFromPayload` in `apps/mobile/stores/auth-store.ts`, which reads
     * these same tokens in production.
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
      synchronized(accountRenderLock) {
        getEncryptedPrefs(context).edit().putString(KEY_TOKEN, token).apply()
      }
      refreshWidgets(context)
    }

    AsyncFunction("clearToken") {
      val context = moduleContext()
      synchronized(accountRenderLock) {
        getEncryptedPrefs(context).edit().remove(KEY_TOKEN).apply()
        clearWidgetCache(context)
      }
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
      // Label the payload with the caller's account, since sign-out can occur during the fetch.
      // Compare accounts so a token refresh keeps the same account's cache.
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

    AsyncFunction("postPersistentReminder") {
      generation: Int, title: String, body: String, color: String ->
      val context = moduleContext()
      reminderPresentation.post(generation) {
        val openToday = Intent(Intent.ACTION_VIEW, Uri.parse("orbit:///"))
          .setPackage(context.packageName)
        val openTodayIntent = PendingIntent.getActivity(
          context, 500, openToday,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val icon = context.resources.getIdentifier(
          "notification_icon", "drawable", context.packageName
        ).takeIf { it != 0 } ?: context.applicationInfo.icon
        val notification = NotificationCompat.Builder(context, REMINDER_CHANNEL)
          .setSmallIcon(icon)
          .setContentTitle(title)
          .setContentText(body)
          .setStyle(NotificationCompat.BigTextStyle().bigText(body))
          .setColor(Color.parseColor(color))
          .setContentIntent(openTodayIntent)
          .setOngoing(true)
          .setAutoCancel(false)
          .setOnlyAlertOnce(true)
          .setPriority(NotificationCompat.PRIORITY_LOW)
          .build()
        NotificationManagerCompat.from(context).notify(REMINDER_TAG, 0, notification)
      }
    }

    AsyncFunction("cancelPersistentReminder") { generation: Int ->
      val context = moduleContext()
      reminderPresentation.cancel(generation) {
        NotificationManagerCompat.from(context).cancel(REMINDER_TAG, 0)
      }
    }

    OnActivityEntersBackground {
      appContext.reactContext?.let { refreshWidgets(it) }
    }
  }
}
