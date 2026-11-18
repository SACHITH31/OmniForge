"""Exercise real Android picker, conversion, and result screens on a clean AVD."""

import binascii
import hashlib
import re
import struct
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path


def adb(*args):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT)


def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/omni-test.xml")
    return list(ET.fromstring(adb("shell", "cat", "/sdcard/omni-test.xml")).iter("node"))


def wait_node(label, *, scroll=False, prefer_text=False):
    last = []
    for attempt in range(8):
        try:
            last = hierarchy()
        except (subprocess.CalledProcessError, ET.ParseError):
            time.sleep(1)
            continue
        for node in last:
            description = node.get("content-desc", "").casefold()
            target = label.casefold()
            if target == node.get("text", "").casefold():
                return node
            if prefer_text:
                continue
            if target in (description, node.get("resource-id", "").casefold()):
                return node
            # DocumentsUI grid tiles append file size and date to the accessible name.
            if description.startswith(target + ", "):
                return node
        if scroll and attempt in (1, 3):
            swipe_up()
        time.sleep(0.5)
    crash_log = adb("logcat", "-d", "-t", "120", "AndroidRuntime:E", "ReactNativeJS:E", "*:S")
    print(crash_log.decode(errors="replace"), flush=True)
    raise AssertionError(f"Missing {label!r}. Visible labels: " + repr([
        (node.get("text"), node.get("content-desc")) for node in last
        if node.get("text") or node.get("content-desc")
    ]))


def tap(label, *, scroll=False, prefer_text=False):
    node = wait_node(label, scroll=scroll, prefer_text=prefer_text)
    left, top, right, bottom = map(int, re.findall(r"\d+", node.get("bounds", "")))
    adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))


def swipe_up():
    size = adb("shell", "wm", "size").decode().splitlines()[-1]
    width, height = map(int, re.search(r"(\d+)x(\d+)", size).groups())
    adb("shell", "input", "swipe", str(width // 2), str(height * 3 // 5),
        str(width // 2), str(height // 4), "400")


def fixture():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data))

    width, height = 48, 32
    pixels = b"".join(b"\0" + bytes([33, 120, 180]) * width for _ in range(height))
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))
    adb("shell", "mkdir", "-p", "/sdcard/Download/OmniForgeQA")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "omniforge-fixture.png"
        path.write_bytes(png)
        adb("push", str(path), "/sdcard/Download/omniforge-fixture.png")


def choose_download(name):
    tap("Show roots")
    tap("Downloads")
    if any(node.get("content-desc") == "List view" for node in hierarchy()):
        tap("List view")
    tap(name, prefer_text=True)


def choose_image():
    choose_download("omniforge-fixture.png")

def multipage_fixture():
    # Each page has a different size and filled rectangle to expose page mixups.
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 6 0 R >>",
    ]
    for commands in [b"0 0 1 rg 10 10 100 100 re f 0 g BT /F1 12 Tf 30 340 Td (Name: 1234) Tj ET", b"1 0 0 rg 20 20 100 100 re f"]:
        objects.append(b"<< /Length %d >>\nstream\n" % len(commands) + commands + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(b"%d 0 obj\n" % index + obj + b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for offset in offsets:
        pdf.extend(b"%010d 00000 n \n" % offset)
    pdf.extend(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref))
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "omniforge-two-pages.pdf"
        path.write_bytes(pdf)
        adb("push", str(path), "/sdcard/Download/omniforge-two-pages.pdf")


fixture()
multipage_fixture()
tap("Convert")
tap("Choose image & convert", scroll=True)
choose_image()
wait_node("omniforge-fixture-converted.jpg")
wait_node("Preview of omniforge-fixture-converted.jpg", scroll=True)
print("Converted PNG to JPEG and loaded its saved image preview.", flush=True)
# Scroll the action fully into view. Accessibility bounds can include clipped
# children near the navigation bar on the small emulator display.
swipe_up()
swipe_up()
tap("Export a copy", scroll=True)
# ACTION_OPEN_DOCUMENT_TREE opens internal storage directly on this AVD.
tap("Download", scroll=True)
tap("OmniForgeQA")
tap("Use this folder")
tap("Allow")
wait_node("Copy saved to the selected folder.", scroll=True)
with tempfile.TemporaryDirectory() as directory:
    exported = Path(directory) / "converted.jpg"
    adb("pull", "/sdcard/Download/OmniForgeQA/omniforge-fixture-converted.jpg", str(exported))
    jpeg = exported.read_bytes()
    assert jpeg[:3] == b"\xff\xd8\xff" and jpeg[-2:] == b"\xff\xd9", "Export is not a complete JPEG"
print("Converted PNG to JPEG, rendered the saved output, and exported JPEG bytes.", flush=True)

def verify_receiver(action, checksum):
    expected = f"QA received {action} {checksum}"
    for _ in range(8):
        nodes = hierarchy()
        if any(node.get("text") == expected for node in nodes):
            return
        if any("QA receiver error" in node.get("text", "") for node in nodes):
            raise AssertionError("Receiving application could not read the granted JPEG URI")
        if any(node.get("text") == "OmniForge QA Receiver" for node in nodes):
            tap("OmniForge QA Receiver")
        if any(node.get("text", "").casefold() == "just once" for node in nodes):
            tap("Just once")
        time.sleep(0.5)
    wait_node(expected)

checksum = hashlib.sha256(jpeg).hexdigest()
tap("Share file", scroll=True)
verify_receiver("Share", checksum)
adb("shell", "input", "keyevent", "KEYCODE_BACK")
tap("Open with another app", scroll=True)
verify_receiver("Open", checksum)
adb("shell", "input", "keyevent", "KEYCODE_BACK")
print("Share and Open delivered the exact exported JPEG bytes to an independent Android app.", flush=True)


tap("PDF Studio")
tap("Choose image & create PDF", scroll=True)
choose_image()
wait_node("omniforge-fixture.pdf")
wait_node("PDF preview, page 1", scroll=True)
wait_node("Page 1 of 1", scroll=True)
print("Converted PNG to PDF and rendered its first page.", flush=True)

tap("PDF Studio")
tap("Import existing PDF", scroll=True)
choose_download("omniforge-two-pages.pdf")
wait_node("omniforge-two-pages.pdf")
wait_node("PDF preview, page 1", scroll=True)
wait_node("Page 1 of 2", scroll=True)
swipe_up()
swipe_up()
tap("Next page", scroll=True)
wait_node("Page 2 of 2", scroll=True)
wait_node("PDF preview, page 2")
swipe_up()
swipe_up()
tap("Zoom in", scroll=True)
wait_node("Fit to width", scroll=True)
tap("Fit to width", scroll=True)
wait_node("Zoom in", scroll=True)
tap("Previous page", scroll=True)
wait_node("Page 1 of 2", scroll=True)
print("Opened a two-page PDF, navigated both pages, and changed zoom.", flush=True)
swipe_up()
swipe_up()
tap("Read page text", scroll=True)
wait_node("Name: 1234", scroll=True)
print("Read the original text layer from the PDF fixture.", flush=True)
