package com.omniforge.output

import android.graphics.RectF
import android.graphics.pdf.PdfRenderer
import android.graphics.pdf.component.PdfPageTextObject
import android.graphics.pdf.component.PdfPageTextObjectFont
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.ext.SdkExtensions
import java.io.File
import kotlin.math.abs

internal object PdfTextEditing {
  fun available(): Boolean = Build.VERSION.SDK_INT >= 35 &&
    (Build.VERSION.SDK_INT > 36 || SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) >= 18)

  private fun family(run: PdfPageTextObject) = when (run.font.fontFamily) {
    PdfPageTextObjectFont.FONT_FAMILY_HELVETICA -> "Helvetica"
    PdfPageTextObjectFont.FONT_FAMILY_TIMES_NEW_ROMAN -> "Times"
    PdfPageTextObjectFont.FONT_FAMILY_COURIER -> "Courier"
    else -> null
  }

  fun runs(page: PdfRenderer.Page): List<Map<String, Any>> {
    val objects = page.pageObjects
    require(objects.size <= 500) { "This page has too many objects for text editing." }
    return objects.mapNotNull { pair ->
      val run = pair.second as? PdfPageTextObject ?: return@mapNotNull null
      val name = family(run) ?: return@mapNotNull null
      if (run.text.isBlank() || run.text.length > 256 || run.text.any { it.code !in 32..126 }) return@mapNotNull null
      mapOf("id" to pair.first, "text" to run.text, "family" to name, "size" to run.fontSize.toDouble(),
        "bold" to run.font.isBold, "italic" to run.font.isItalic)
    }
  }

  private fun bounds(page: PdfRenderer.Page, text: String): RectF {
    val match = page.searchText(text).singleOrNull()
    return match?.bounds?.singleOrNull() ?: throw IllegalArgumentException(
      "Editing requires a unique, searchable, single-line text run on this page.")
  }

  fun replace(document: PdfRenderer, index: Int, id: Int, original: String, replacement: String, target: File) {
    require(replacement.isNotBlank() && replacement != original && replacement.length <= 256 &&
      replacement.all { it.code in 32..126 }) { "Enter a different single line of Latin text." }
    require(document.pdfFormType == PdfRenderer.PDF_FORM_TYPE_NONE) { "Forms and signature fields are unsupported for text editing." }
    document.openPage(index).use { page ->
      require(page.pageObjects.size <= 500)
      val run = page.pageObjects.firstOrNull { it.first == id }?.second as? PdfPageTextObject
      require(run != null && run.text == original && family(run) != null) { "The selected text object is unavailable." }
      val originalBounds = bounds(page, original)
      val otherBounds = page.textContents.flatMap { it.bounds }.filterNot { originalBounds.contains(it) }
      run.text = replacement
      check(page.updatePageObject(id, run)) { "Android could not replace this text object." }
      val changed = bounds(page, replacement)
      require(changed.left >= 0 && changed.top >= 0 && changed.right <= page.width && changed.bottom <= page.height &&
        abs(changed.left - originalBounds.left) <= 2 && abs(changed.bottom - originalBounds.bottom) <= 3 &&
        otherBounds.none { RectF.intersects(it, changed) && !RectF.intersects(it, originalBounds) }) {
        "The replacement would leave the page, shift its baseline, or overlap other text."
      }
    }
    ParcelFileDescriptor.open(target, ParcelFileDescriptor.MODE_READ_WRITE or ParcelFileDescriptor.MODE_TRUNCATE).use {
      document.write(it, false)
    }
  }

  fun verify(page: PdfRenderer.Page, replacement: String) {
    check(page.pageObjects.any { (it.second as? PdfPageTextObject)?.text == replacement }) {
      "The saved PDF did not preserve the edited text object."
    }
    bounds(page, replacement)
  }
}
