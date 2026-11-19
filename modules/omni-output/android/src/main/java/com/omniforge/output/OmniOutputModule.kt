package com.omniforge.output

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import kotlin.math.roundToInt

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
      val file = savedFile(source)
      val output = Uri.parse(destination)
      require(output.scheme == "content")
      file.inputStream().use { from ->
        val stream = context.contentResolver.openOutputStream(output, "wt")
          ?: throw IOException("The selected folder could not accept the file.")
        stream.use { to -> from.copyTo(to) }
      }
      Unit
    }
    Constant("supportsPdfTextEditing") { PdfTextEditing.available() }
    AsyncFunction("inspectPdfRuns") { source: String, index: Int ->
      check(PdfTextEditing.available()) { "Text object editing requires the Android PDF extension 18." }
      openPdf(source).use { document -> document.openPage(index).use { PdfTextEditing.runs(it) } }
    }

    AsyncFunction("previewPdfEdit") { source: String, index: Int, id: Int, original: String, replacement: String ->
      check(PdfTextEditing.available()) { "This Android version cannot edit PDF text objects." }
      val cache = File(requireNotNull(appContext.reactContext).cacheDir, "pdf-edits")
      check(cache.isDirectory || cache.mkdirs())
      cache.listFiles()?.filter { it.isFile && it.lastModified() < System.currentTimeMillis() - 86_400_000L }?.forEach { it.delete() }
      val temporary = File.createTempFile("edit-", ".pdf", cache)
      try {
        val expected = openPdf(source).use { document ->
          PdfTextEditing.replace(document, index, id, original, replacement, temporary)
        }
        ParcelFileDescriptor.open(temporary, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
          PdfRenderer(descriptor).use { edited ->
            check(edited.pageCount == expected.pageCount) { "The edited PDF changed the page count." }
            edited.openPage(index).use { page ->
              val area = PdfTextEditing.verify(page, replacement, expected)
              openPdf(source).use { original ->
                original.openPage(index).use { before ->
                  withPageBitmap(before, 1200) { originalBitmap ->
                    withPageBitmap(page, 1200) { editedBitmap ->
                      PdfTextEditing.verifySurroundings(originalBitmap, editedBitmap, area, page.width, page.height)
                      encodePage(editedBitmap) + ("documentUri" to Uri.fromFile(temporary).toString())
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error: Throwable) {
        temporary.delete()
        throw error
      }
    }

    AsyncFunction("renderPdfPage") { source: String, index: Int, maxSide: Int ->
      require(maxSide in 320..1800)
      openPdf(source).use { document ->
        require(index in 0 until document.pageCount) { "This PDF has no page at that position." }
        document.openPage(index).use { page ->
          renderPage(page, maxSide) + ("pageCount" to document.pageCount)
        }
      }
    }

    AsyncFunction("savePdfPageImage") { source: String, index: Int, destination: String, format: String ->
      val encoding = when (format) {
        "jpeg" -> Bitmap.CompressFormat.JPEG
        "png" -> Bitmap.CompressFormat.PNG
        else -> throw IllegalArgumentException("Unsupported page image format.")
      }
      val output = createTemporaryOutput(source, destination)
      openPdf(source).use { document ->
        document.openPage(index).use { page ->
          withPageBitmap(page, 1800) { bitmap ->
            output.outputStream().use { stream ->
              check(bitmap.compress(encoding, 88, stream)) { "Could not encode the selected page." }
            }
          }
        }
      }
      Unit
    }

    AsyncFunction("renderPdfThumbnails") { source: String, first: Int, count: Int ->
      require(first >= 0 && count in 1..8)
      openPdf(source).use { document ->
        val end = minOf(document.pageCount.toLong(), first.toLong() + count).toInt()
        (first until end).map { index ->
          document.openPage(index).use { page ->
            renderPage(page, 240) + ("pageIndex" to index)
          }
        }
      }
    }

    AsyncFunction("searchPdfPages") { source: String, query: String, first: Int, count: Int ->
      if (Build.VERSION.SDK_INT < 35) {
        throw UnsupportedOperationException("PDF search requires Android 15 or later.")
      }
      require(query.isNotBlank() && query.length <= 120 && first >= 0 && count in 1..16)
      openPdf(source).use { document ->
        val end = minOf(document.pageCount.toLong(), first.toLong() + count).toInt()
        (first until end).mapNotNull { index ->
          val matches = document.openPage(index).use { page -> page.searchText(query).size }
          if (matches == 0) null else mapOf("pageIndex" to index, "count" to matches)
        }
      }
    }

    AsyncFunction("savePdfText") { source: String, destination: String ->
      require(Build.VERSION.SDK_INT >= 35) { "PDF text export requires Android 15 or later." }
      openPdf(source).use { document ->
        val output = createTemporaryOutput(source, destination)
        var characters = 0L
        var hasText = false
        output.bufferedWriter(Charsets.UTF_8).use { writer ->
          for (index in 0 until document.pageCount) {
            if (index > 0) writer.write("\n\u000C\n")
            document.openPage(index).use { page ->
              for (block in page.textContents) {
                characters += block.text.length + 1L
                require(characters <= 8_000_000) { "This document exceeds the text export limit." }
                hasText = hasText || block.text.isNotBlank()
                writer.write(block.text)
                writer.newLine()
              }
            }
          }
        }
        require(hasText) { "This PDF has no extractable text. Scanned pages require OCR." }
      }
      Unit
    }

    AsyncFunction("readTextPreview") { source: String ->
      val buffer = CharArray(8193)
      var count = 0
      savedFile(source).bufferedReader(Charsets.UTF_8).use { reader ->
        while (count < buffer.size) {
          val read = reader.read(buffer, count, buffer.size - count)
          if (read <= 0) break
          count += read
        }
      }
      var limit = minOf(8192, count)
      if (limit > 0 && buffer[limit - 1].isHighSurrogate()) limit--
      mapOf("text" to String(buffer, 0, limit), "truncated" to (count > limit))
    }

    AsyncFunction("readPdfText") { source: String, index: Int ->
      if (Build.VERSION.SDK_INT < 35) {
        throw UnsupportedOperationException("Reading PDF text requires Android 15 or later.")
      }
      openPdf(source).use { document ->
        require(index in 0 until document.pageCount) { "This PDF has no page at that position." }
        document.openPage(index).use { page ->
          val contents = page.textContents
          require(contents.sumOf { it.text.length } <= 250_000 && contents.sumOf { it.bounds.size } <= 25_000) {
            "This page contains too much text to display at once."
          }
          contents.map { block ->
            mapOf("text" to block.text, "bounds" to block.bounds.map { rect ->
              listOf(rect.left.toDouble(), rect.top.toDouble(), rect.right.toDouble(), rect.bottom.toDouble())
            })
          }
        }
      }
    }
  }

  private fun renderPage(page: PdfRenderer.Page, maxSide: Int): Map<String, Any> {
    return withPageBitmap(page, maxSide, ::encodePage)
  }

  private fun encodePage(bitmap: Bitmap): Map<String, Any> {
    val bytes = ByteArrayOutputStream()
    check(bitmap.compress(Bitmap.CompressFormat.JPEG, 88, bytes))
    return mapOf(
      "uri" to ("data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)),
      "width" to bitmap.width,
      "height" to bitmap.height
    )
  }

  private fun <T> withPageBitmap(page: PdfRenderer.Page, maxSide: Int, use: (Bitmap) -> T): T {
    val scale = maxSide.toDouble() / maxOf(page.width, page.height).coerceAtLeast(1)
    val width = (page.width * scale).roundToInt().coerceAtLeast(1)
    val height = (page.height * scale).roundToInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    try {
      bitmap.eraseColor(Color.WHITE)
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      return use(bitmap)
    } finally {
      bitmap.recycle()
    }
  }

  private fun openPdf(source: String): PdfRenderer {
    val descriptor = ParcelFileDescriptor.open(savedFile(source), ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      return PdfRenderer(descriptor)
    } catch (error: Exception) {
      descriptor.close()
      throw IOException("This PDF is damaged, password protected, or unsupported.", error)
    }
  }

  private fun createTemporaryOutput(source: String, destination: String): File {
    val input = savedFile(source)
    val uri = Uri.parse(destination)
    val output = File(requireNotNull(uri.path)).canonicalFile
    require(uri.scheme == "file" && output.parentFile == input.parentFile && output.name.endsWith(".part"))
    require(output.createNewFile()) { "The temporary output already exists." }
    return output
  }

  private fun savedFile(source: String): File {
    val context = requireNotNull(appContext.reactContext)
    val uri = Uri.parse(source)
    require(uri.scheme == "file")
    val root = File(context.filesDir, "omniforge").canonicalFile
    val file = File(requireNotNull(uri.path)).canonicalFile
    require(file.parentFile == root && file.isFile) { "The saved file is no longer available." }
    return file
  }
}
