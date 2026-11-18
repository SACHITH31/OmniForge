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
    assert "Name: Kasa Sachith" in new_text and "1234" not in new_text and "Invoice 482" in new_text
    old, old_font = text_layout(source, "Name: 1234")
    new, new_font = text_layout(edited, "Name: Kasa Sachith")
    for attribute in ("family", "size", "color"):
        assert old_font.get(attribute) == new_font.get(attribute), (attribute, old_font.attrib, new_font.attrib)
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


def main():
    multipage_fixture()
    adb("shell", "mkdir", "-p", "/sdcard/Download/OmniForgeQA")
    adb("shell", "am", "start", "-W", "-n", "com.omniforge.app/.MainActivity")
    wait_node("YOUR OFFLINE WORKSPACE")
    tap("PDF Studio")
    tap("Import existing PDF", scroll=True)
    choose_download("omniforge-two-pages.pdf")
    tap("Edit existing text", scroll=True)
    tap("Edit Name: 1234")
    # A replacement wider than the page must be rejected before any copy can be saved.
    tap("Replacement text")
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    adb("shell", "input", "text", "W" * 65)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap("Preview replacement", scroll=True)
    for _ in range(12):
        nodes = hierarchy()
        if any(node.get("content-desc", "").startswith("Edit unavailable.") for node in nodes):
            assert all(node.get("text") != "Save edited copy" for node in nodes)
            break
        time.sleep(0.5)
    else:
        raise AssertionError("An overflowing replacement must report an error before offering Save")
    tap("Choose another line", scroll=True)
    tap("Edit Name: 1234")
    tap("Replacement text")
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    for _ in range(4):
        adb("shell", "input", "keyevent", "KEYCODE_DEL")
    adb("shell", "input", "text", "Kasa%sSachith")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap("Preview replacement", scroll=True)
    wait_node("Edited PDF page preview", scroll=True)
    tap("Save edited copy", scroll=True)
    reset_result_scroll()
    wait_node("omniforge-two-pages-edited.pdf", scroll=True)
    wait_node("PDF preview, page 1", scroll=True)
    tap("Export a copy", scroll=True)
    tap("Download", scroll=True)
    tap("OmniForgeQA")
    tap("Use this folder")
    tap("Allow")
    wait_node("Copy saved to the selected folder.", scroll=True)
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "original.pdf"
        edited = Path(directory) / "edited.pdf"
        adb("pull", "/sdcard/Download/omniforge-two-pages.pdf", str(source))
        adb("pull", "/sdcard/Download/OmniForgeQA/omniforge-two-pages-edited.pdf", str(edited))
        compare(source, edited)


if __name__ == "__main__":
    main()
