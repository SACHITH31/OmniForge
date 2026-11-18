package com.omniforge.output

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import java.io.File
import java.io.IOException

class OmniOutputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OmniOutput")

    AsyncFunction("open") { value: String, mimeType: String ->
      val activity = appContext.currentActivity ?: throw IllegalStateException("The app is not in the foreground.")
      val uri = Uri.parse(value)
      require(uri.scheme == "content" && uri.authority == "${activity.packageName}.FileSystemFileProvider")
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      try {
        activity.startActivity(intent)
      } catch (_: ActivityNotFoundException) {
        throw IllegalStateException("No installed app can open this file type.")
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("copyToDocument") { source: String, destination: String ->
      val context = requireNotNull(appContext.reactContext)
      val input = Uri.parse(source)
      require(input.scheme == "file")
      val root = File(context.filesDir, "omniforge").canonicalFile
      val file = File(requireNotNull(input.path)).canonicalFile
      require(file.parentFile == root && file.isFile) { "The saved file is no longer available." }
      val output = Uri.parse(destination)
      require(output.scheme == "content")
      file.inputStream().use { from ->
        val stream = context.contentResolver.openOutputStream(output, "wt")
          ?: throw IOException("The selected folder could not accept the file.")
        stream.use { to -> from.copyTo(to) }
      }
      Unit
    }
  }
}
