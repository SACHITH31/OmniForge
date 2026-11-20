"""Exercise an actual text-object replacement and compare the exported PDFs with Poppler."""

import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from test_android_results import adb, choose_download, hierarchy, multipage_fixture, reset_result_scroll, tap, wait_node
import time


def text_layout(path, expected):
    xml = subprocess.check_output(["pdftohtml", "-xml", "-i", "-stdout", str(path)])
    page = ET.fromstring(xml).find("page")
    run = next(t for t in page.findall("text") if "".join(t.itertext()).strip() == expected)
    font = next(f for f in page.findall("fontspec") if f.get("id") == run.get("font"))
    return run, font


def raster(path, page):
    return subprocess.check_output(["pdftoppm", "-r", "72", "-singlefile", "-f", str(page), "-l", str(page), str(path)])


def compare(source, edited):
    old_text = subprocess.check_output(["pdftotext", str(source), "-"]).decode()
    new_text = subprocess.check_output(["pdftotext", str(edited), "-"]).decode()
    assert "Name: 1234" in old_text and "Kasa Sachith" not in old_text
    assert "Name: Kasa Sachith" in new_text and "1234" not in new_text and "Invoice 482" in new_text, repr(new_text)
    old, old_font = text_layout(source, "Name: 1234")
    new, new_font = text_layout(edited, "Name: Kasa Sachith")
    for attribute in ("family", "size"):
        assert old_font.get(attribute) == new_font.get(attribute), (attribute, old_font.attrib, new_font.attrib)
    # The Android page object stores packed 8-bit ARGB. PDF DeviceRGB
    # coordinates can round differently when Poppler reads the source.
    old_rgb = bytes.fromhex(old_font.get("color").lstrip("#"))
    new_rgb = bytes.fromhex(new_font.get("color").lstrip("#"))
    assert len(old_rgb) == len(new_rgb) == 3, (old_rgb, new_rgb)
    assert all(abs(a - b) <= 1 for a, b in zip(old_rgb, new_rgb)), (old_rgb, new_rgb)
    for attribute in ("top", "left", "height"):
        assert abs(int(old.get(attribute)) - int(new.get(attribute))) <= 1, (old.attrib, new.attrib)
    assert int(new.get("width")) > int(old.get("width"))
    assert raster(source, 2) == raster(edited, 2), "Unedited page changed visually"
    pixels = []
    for path in (source, edited):
        header, size, maximum, data = raster(path, 1).split(b"\n", 3)
        assert (header, size, maximum, len(data)) == (b"P6", b"300 400", b"255", 360000)
        pixels.append(data)
    changed = [i // 3 for i, (a, b) in enumerate(zip(*pixels)) if a != b]
    assert changed and all(28 <= p % 300 <= 190 and 44 <= p // 300 <= 65 for p in changed)
    print("Poppler verified replacement, font, size, color, position, and identical pixels outside the edited line.", flush=True)


def enter_replacement(value):
    tap("Replacement text")
    adb("shell", "input", "keycombination", "KEYCODE_CTRL_LEFT", "KEYCODE_A")
    adb("shell", "input", "text", value.replace(" ", "%s"))
    field = next(n for n in hierarchy() if n.get("class") == "android.widget.EditText")
    assert field.get("text") == value, (field.get("text"), value)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")


def expect_rejected(value):
    enter_replacement(value)
    tap("Preview replacement", scroll=True)
    for _ in range(12):
        nodes = hierarchy()
        if any(node.get("content-desc", "").startswith("Edit unavailable.") for node in nodes):
            assert all(node.get("text") != "Save edited copy" for node in nodes)
            break
        time.sleep(0.5)
    else:
        raise AssertionError([(n.get("text"), n.get("content-desc")) for n in nodes])

def exercise(name, font, near_text=False):
    multipage_fixture(name + ".pdf", font, near_text)
    adb("shell", "mkdir", "-p", "/sdcard/Download/OmniForgeQA")
    adb("shell", "am", "force-stop", "com.omniforge.app")
    adb("shell", "am", "start", "-W", "-n", "com.omniforge.app/.MainActivity")
    wait_node("YOUR OFFLINE WORKSPACE")
    tap("PDF Studio")
    tap("Import existing PDF", scroll=True)
    choose_download(name + ".pdf")
    tap("Edit existing text", scroll=True)
    tap("Edit Name: 1234")
    if near_text:
        # This fits on the page but reaches the adjacent column.
        expect_rejected("Name: " + "W" * 23)
    else:
        expect_rejected("W" * 65)
    tap("Choose another line", scroll=True)
    tap("Edit Name: 1234")
    enter_replacement("Name: Kasa Sachith")
    tap("Preview replacement", scroll=True)
    wait_node("Edited PDF page preview", scroll=True)
    tap("Original", scroll=True)
    wait_node("Original PDF page preview", scroll=True)
    tap("Edited", scroll=True)
    wait_node("Edited PDF page preview", scroll=True)
    tap("Save edited copy", scroll=True)
    reset_result_scroll()
    wait_node(name + "-edited.pdf", scroll=True)
    wait_node("PDF preview, page 1", scroll=True)
    tap("Export a copy", scroll=True)
    if not any(n.get("text") == "OmniForgeQA" for n in hierarchy()):
        tap("Download", scroll=True)
    tap("OmniForgeQA")
    tap("Use this folder")
    tap("Allow")
    wait_node("Copy saved to the selected folder.", scroll=True)
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "original.pdf"
        edited = Path(directory) / "edited.pdf"
        adb("pull", f"/sdcard/Download/{name}.pdf", str(source))
        adb("pull", f"/sdcard/Download/OmniForgeQA/{name}-edited.pdf", str(edited))
        compare(source, edited)


if __name__ == "__main__":
    exercise("omniforge-two-pages", "Helvetica-Bold")
    exercise("omniforge-courier", "Courier-Oblique", near_text=True)
