package com.omniforge.output

import android.graphics.Paint
import android.graphics.Typeface
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

  data class ExpectedEdit(
    val pageCount: Int, val original: String, val before: RectF, val neighbors: List<RectF>,
    val family: Int, val bold: Boolean, val italic: Boolean, val size: Float, val color: Int,
    val strokeColor: Int, val renderMode: Int, val transform: FloatArray
  )

  fun replace(document: PdfRenderer, index: Int, id: Int, original: String, replacement: String, target: File): ExpectedEdit {
    require(replacement.isNotBlank() && replacement != original && replacement.length <= 256 &&
      replacement.all { it.code in 32..126 }) { "Enter a different single line of Latin text." }
    require(document.pdfFormType == PdfRenderer.PDF_FORM_TYPE_NONE) { "Forms and signature fields are unsupported for text editing." }
    val expected = document.openPage(index).use { page ->
      require(page.pageObjects.size <= 500)
      val run = page.pageObjects.firstOrNull { it.first == id }?.second as? PdfPageTextObject
      require(run != null && run.text == original && family(run) != null) { "The selected text object is unavailable." }
      val originalBounds = bounds(page, original)
      // Search bounds can stop at the page edge after PDFium clips a long line.
      // Measure before mutation, calibrated against the actual source run.
      val sourceTypeface = when (family(run)) {
        "Courier" -> Typeface.MONOSPACE
        "Times" -> Typeface.SERIF
        else -> Typeface.SANS_SERIF
      }
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = run.fontSize
        val style = (if (run.font.isBold) Typeface.BOLD else 0) or
          (if (run.font.isItalic) Typeface.ITALIC else 0)
        this.typeface = Typeface.create(sourceTypeface, style)
      }
      val sourceWidth = paint.measureText(original)
      require(sourceWidth > 0 && originalBounds.left + originalBounds.width() *
        paint.measureText(replacement) / sourceWidth <= page.width) {
        "The replacement is too wide for the available page width."
      }
      val blocks = page.textContents
      val selected = blocks.singleOrNull { it.text.trim() == original.trim() }
      require(selected != null) { "Choose an isolated text line. This line shares its layout with other text." }
      val neighbors = blocks.filterNot { it === selected }.flatMap { it.bounds }
      require(neighbors.size <= 5000) { "This page is too dense for text editing." }
      val expected = ExpectedEdit(document.pageCount, original, originalBounds, neighbors, run.font.fontFamily,
        run.font.isBold, run.font.isItalic, run.fontSize, run.fillColor, run.strokeColor, run.renderMode, run.matrix)
      run.text = replacement
      check(page.updatePageObject(id, run)) { "Android could not replace this text object." }
      expected
    }
    ParcelFileDescriptor.open(target, ParcelFileDescriptor.MODE_READ_WRITE or ParcelFileDescriptor.MODE_TRUNCATE).use {
      document.write(it, false)
    }
    return expected
  }

  fun verify(page: PdfRenderer.Page, replacement: String, expected: ExpectedEdit) {
    val runs = page.pageObjects.mapNotNull { it.second as? PdfPageTextObject }
    val updated = runs.singleOrNull { it.text == replacement }
    check(updated != null && runs.none { it.text == expected.original }) { "The saved PDF did not preserve the replacement." }
    check(updated.font.fontFamily == expected.family && updated.font.isBold == expected.bold &&
      updated.font.isItalic == expected.italic && abs(updated.fontSize - expected.size) < 0.01 &&
      updated.fillColor == expected.color && updated.strokeColor == expected.strokeColor &&
      updated.renderMode == expected.renderMode &&
      updated.matrix.size == expected.transform.size &&
      updated.matrix.indices.all { abs(updated.matrix[it] - expected.transform[it]) < 0.01 }) {
      "Android could not retain the original text style and placement."
    }
    val changed = bounds(page, replacement)
    require(changed.left >= 0 && changed.top >= 0 && changed.right <= page.width && changed.bottom <= page.height &&
      abs(changed.left - expected.before.left) <= 2 && abs(changed.bottom - expected.before.bottom) <= 3 &&
      expected.neighbors.none { RectF.intersects(it, changed) }) {
      "The replacement would leave the page, shift its baseline, or overlap other text."
    }
  }
}
