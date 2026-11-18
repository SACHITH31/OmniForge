"""Exercise real Android picker, conversion, and result screens on a clean AVD."""

import binascii
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


def wait_node(label, *, scroll=False):
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
            if target in (node.get("text", "").casefold(), description, node.get("resource-id", "").casefold()):
                return node
            # DocumentsUI grid tiles append file size and date to the accessible name.
            if description.startswith(target + ", "):
                return node
        if scroll and attempt in (1, 3):
            swipe_up()
        time.sleep(0.5)
    raise AssertionError(f"Missing {label!r}. Visible labels: " + repr([
        (node.get("text"), node.get("content-desc")) for node in last
        if node.get("text") or node.get("content-desc")
    ]))


def tap(label, *, scroll=False):
    node = wait_node(label, scroll=scroll)
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


def choose_image():
    tap("Show roots")
    tap("Downloads")
    tap("omniforge-fixture.png")


fixture()
tap("Convert")
tap("Choose image & convert", scroll=True)
choose_image()
wait_node("omniforge-fixture-converted.jpg")
wait_node("Preview of omniforge-fixture-converted.jpg", scroll=True)
tap("Export a copy", scroll=True)
tap("Show roots")
tap("Downloads")
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

tap("PDF Studio")
tap("Choose image & create PDF", scroll=True)
choose_image()
wait_node("omniforge-fixture.pdf")
wait_node("PDF preview, page 1", scroll=True)
wait_node("Page 1 of 1", scroll=True)
print("Converted PNG to PDF and rendered its first page.", flush=True)
