package org.useorbit.app.chatimage

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.sharedobjects.SharedRef
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

class OrbitChatImageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OrbitChatImage")

    AsyncFunction("saveJpeg") { image: SharedRef<Bitmap>, backgroundColor: String, quality: Double ->
      val bitmap = Bitmap.createBitmap(image.ref.width, image.ref.height, Bitmap.Config.ARGB_8888)
      try {
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.parseColor(backgroundColor))
        canvas.drawBitmap(image.ref, null, Rect(0, 0, bitmap.width, bitmap.height), null)
        val directory = File(appContext.cacheDirectory, "ChatImages")
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException("Image cache unavailable")
        val output = File(directory, "${UUID.randomUUID()}.jpg")
        try {
          FileOutputStream(output).use { stream ->
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, (quality * 100).toInt(), stream)) {
              throw IOException("JPEG encoding failed")
            }
          }
        } catch (error: Exception) {
          output.delete()
          throw error
        }
        mapOf("uri" to Uri.fromFile(output).toString(), "width" to bitmap.width, "height" to bitmap.height)
      } finally {
        bitmap.recycle()
      }
    }
  }
}
