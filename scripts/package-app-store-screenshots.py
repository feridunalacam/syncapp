#!/usr/bin/env python3
"""Validate native screenshots and export lossless opaque App Store PNGs.

Usage: python3 scripts/package-app-store-screenshots.py [--root PATH]
Requires Pillow, already available in the authoring environment. Sources stay
untouched. No crop, resize, fabricated UI, or color conversion is performed on
upload images; only a fully opaque alpha channel may be removed. The contact
sheet is a separate, clearly labelled QA preview and must not be uploaded.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile
import zlib

from PIL import Image, ImageDraw, PngImagePlugin


REPOSITORY = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = REPOSITORY / "artifacts/app-store/2026-11-12"
SPECIFICATION = "https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications"
# Portrait dimensions; landscape reverses the same native dimensions.
SLOTS = {
    "iphone": {
        (1179, 2556): "Dynamic Island medium",
        (1206, 2622): "Dynamic Island medium",
        (1260, 2736): "Dynamic Island large",
        (1290, 2796): "Dynamic Island large",
        (1320, 2868): "Dynamic Island large",
        (1284, 2778): "Face ID large",
        (1242, 2688): "Face ID large",
    },
    "ipad": {
        (2064, 2752): "13-inch iPad",
        (2048, 2732): "13-inch iPad",
    },
}
COLOR_CHUNKS = {b"cHRM", b"gAMA", b"sRGB", b"sBIT"}
PACKAGE_FILES = (
    "captions.json", "metadata-en-US.json", "content-en-US.txt",
    "guide-tr.txt", "upload-guide-tr.txt", "upload-guide-tr.md",
    "capture-provenance.json", "upload-receipt.json", "packaging-validation.json",
)


def checked_path(root, path):
    """Keep paths inside the canonical root without following child symlinks."""
    try:
        relative = path.relative_to(root)
        path.resolve().relative_to(root)
    except ValueError as error:
        raise ValueError(f"Path escapes screenshot root: {path}") from error
    if ".." in relative.parts:
        raise ValueError(f"Path traverses screenshot root: {path}")
    current = root
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            raise ValueError(f"Symlink is not allowed inside screenshot root: {current}")
    return path


def preflight_paths(root, locale):
    # The chosen root may itself be a canonicalized /tmp path or a symlink.
    # Everything read or written below it must remain an ordinary child path.
    for family in SLOTS:
        raw = checked_path(root, root / locale / family / "raw")
        if raw.exists() and not raw.is_dir():
            raise ValueError(f"Raw screenshot path is not a directory: {raw}")
    output = checked_path(root, root / "upload")
    if output.exists():
        if not output.is_dir():
            raise ValueError(f"Generated upload path is not a directory: {output}")
        for item in output.rglob("*"):
            checked_path(root, item)
    for name in (*PACKAGE_FILES, "screenshot-manifest.json", "contact-sheet.jpg", "sync-dark-app-store-en-US.zip"):
        item = checked_path(root, root / name)
        if item.exists() and not item.is_file():
            raise ValueError(f"Package path is not a regular file: {item}")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def png_chunks(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Not a PNG")
    cursor = 8
    chunks = []
    while cursor < len(data):
        if cursor + 12 > len(data):
            raise ValueError("Truncated PNG chunk")
        size = struct.unpack(">I", data[cursor:cursor + 4])[0]
        tag = data[cursor + 4:cursor + 8]
        payload = data[cursor + 8:cursor + 8 + size]
        end = cursor + 12 + size
        if end > len(data):
            raise ValueError("Truncated PNG payload")
        crc = struct.unpack(">I", data[end - 4:end])[0]
        if zlib.crc32(tag + payload) & 0xffffffff != crc:
            raise ValueError(f"PNG CRC failed: {tag!r}")
        chunks.append((tag, payload))
        cursor = end
    if not chunks or chunks[-1][0] != b"IEND":
        raise ValueError("PNG has no final IEND")
    return chunks


def native_image(source, family):
    data = source.read_bytes()
    chunks = png_chunks(data)
    header = next(payload for tag, payload in chunks if tag == b"IHDR")
    width, height, depth, color, _, _, _ = struct.unpack(">IIBBBBB", header)
    if depth != 8 or color not in (2, 6):
        raise ValueError(f"{source.name}: expected 8-bit RGB/RGBA native PNG")
    dimensions = tuple(sorted((width, height)))
    slot = SLOTS[family].get(dimensions)
    if not slot:
        raise ValueError(f"{source.name}: unsupported {family} size {width}×{height}; recapture at a supported native resolution")
    if any(tag == b"acTL" for tag, _ in chunks):
        raise ValueError(f"{source.name}: animated PNG is not a screenshot")
    with Image.open(source) as original:
        original.load()
        if original.mode not in ("RGB", "RGBA"):
            raise ValueError(f"{source.name}: unexpected decoded mode {original.mode}")
        alpha = original.getchannel("A").getextrema() if original.mode == "RGBA" else None
        if alpha is not None and alpha != (255, 255):
            raise ValueError(f"{source.name}: source contains transparency; retain and recapture, do not flatten")
        rgb = original.convert("RGB")
        icc = original.info.get("icc_profile")
        metadata = PngImagePlugin.PngInfo()
        for tag, payload in chunks:
            if tag in COLOR_CHUNKS:
                # RGB has no alpha significant-bit entry.
                metadata.add(tag, payload[:3] if tag == b"sBIT" else payload)
        options = {"pnginfo": metadata, "compress_level": 9}
        if icc is not None:
            options["icc_profile"] = icc
        return rgb, options, {
            "width": width,
            "height": height,
            "orientation": "portrait" if height >= width else "landscape",
            "app_store_slot": slot,
            "source_sha256": sha256(data),
            "source_png_color_type": color,
            "source_alpha_extrema": list(alpha) if alpha else None,
            "source_icc_sha256": sha256(icc) if icc else None,
        }


def export_image(source, destination, family):
    rgb, options, record = native_image(source, family)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if record["source_png_color_type"] == 2:
        shutil.copyfile(source, destination)
    else:
        rgb.save(destination, format="PNG", **options)
    with Image.open(destination) as exported:
        exported.load()
        if exported.mode != "RGB" or exported.size != rgb.size or exported.tobytes() != rgb.tobytes():
            raise ValueError(f"{source.name}: RGB sample preservation failed")
        output_icc = exported.info.get("icc_profile")
        if (sha256(output_icc) if output_icc else None) != record["source_icc_sha256"]:
            raise ValueError(f"{source.name}: ICC profile preservation failed")
    out_data = destination.read_bytes()
    out_chunks = png_chunks(out_data)
    out_header = next(payload for tag, payload in out_chunks if tag == b"IHDR")
    if out_header[9] != 2 or any(tag == b"tRNS" for tag, _ in out_chunks):
        raise ValueError(f"{source.name}: output has alpha/transparency")
    record.update({
        "output_sha256": sha256(out_data),
        "output_bytes": len(out_data),
        "output_png_color_type": 2,
        "output_alpha_channel": False,
        "encoded_rgb_samples_equal": True,
        "icc_profile_equal": True,
        "transformation": "none" if record["source_png_color_type"] == 2 else "removed fully opaque alpha; RGB samples unchanged",
    })
    rgb.close()
    return record


def preview(root, records):
    columns = min(4, len(records))
    tile_w, tile_h = 280, 660
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_w, 70 + rows * tile_h), "#151816")
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 15), "SYNC / DARK MODE / QA CONTACT SHEET", fill="#c7f46b")
    draw.text((20, 35), "Preview only. Upload the individual PNG files from upload/.", fill="white")
    for index, record in enumerate(records):
        x, y = (index % columns) * tile_w, 70 + (index // columns) * tile_h
        with Image.open(root / record["output"]) as shot:
            thumb = shot.copy()
            thumb.thumbnail((tile_w - 24, tile_h - 80), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (x + (tile_w - thumb.width) // 2, y + 10))
        draw.text((x + 10, y + tile_h - 65), record["device_family"].upper() + " / " + record["filename"][:30], fill="white")
        draw.text((x + 10, y + tile_h - 45), f'{record["width"]} x {record["height"]} / RGB', fill="#c7f46b")
    sheet.save(root / "contact-sheet.jpg", quality=90)


def workspace_revision():
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPOSITORY, text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=REPOSITORY, text=True).strip())
        return {"commit": commit, "dirty_at_packaging": dirty, "scope": "packaging workspace only; does not establish captured binary source"}
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--locale", default="en-US")
    parser.add_argument("--allow-partial", action="store_true", help="allow one missing device family; manifest reports the gap")
    args = parser.parse_args()
    if len(args.locale) > 64 or not re.fullmatch(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*", args.locale) or args.locale.casefold() == "upload":
        raise ValueError("Locale must be one safe locale path component, such as en-US, and cannot be upload")
    root = args.root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    preflight_paths(root, args.locale)
    inputs = []
    missing = []
    for family in SLOTS:
        sources = sorted((root / args.locale / family / "raw").glob("*.png"))
        if not sources:
            missing.append(family)
        if len(sources) > 10:
            raise ValueError(f"{family}: App Store accepts at most ten screenshots per slot")
        for source in sources:
            checked_path(root, source)
            if not source.is_file():
                raise ValueError(f"Raw screenshot is not a regular file: {source}")
            if not re.fullmatch(rf"{re.escape(args.locale)}_{family}_\d{{2}}-[a-z0-9-]+\.png", source.name):
                raise ValueError(f"Use an ordered screenshot filename: {args.locale}_{family}_01-timer-ready.png (got {source.name})")
            inputs.append((family, source))
    if not inputs or (missing and not args.allow_partial):
        raise ValueError("Missing raw screenshots: " + ", ".join(missing) + ". Supply both device families or explicitly use --allow-partial.")
    capture_provenance = root / "capture-provenance.json"
    provenance = json.loads(capture_provenance.read_text()) if capture_provenance.exists() else None
    records = []
    with tempfile.TemporaryDirectory(prefix=".screenshots-", dir=root) as staging:
        staged_root = Path(staging)
        for family, source in inputs:
            relative_output = Path("upload") / args.locale / family / source.name
            destination = checked_path(staged_root, staged_root / relative_output)
            record = export_image(source, destination, family)
            record.update({"filename": source.name, "device_family": family,
                           "source": str(source.relative_to(root)), "output": str(relative_output)})
            records.append(record)
        # Replace only the generated upload directory after every input passed.
        output = root / "upload"
        if output.exists():
            shutil.rmtree(output)
        shutil.move(str(staged_root / "upload"), output)
    manifest = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "locale": args.locale,
        "appearance": "dark; appearance requires visual QA of each native capture",
        "specification_url": SPECIFICATION,
        "specification_checked_date": "2026-11-12",
        "workspace_at_packaging": workspace_revision(),
        "capture_provenance": provenance,
        "missing_device_families": missing,
        "counts": {family: sum(r["device_family"] == family for r in records) for family in SLOTS},
        "pixel_policy": "No crop, resize, composite, fabricated UI, or color conversion. Original RGB samples and ICC profile preserved. Raw PNG files untouched.",
        "release_scope": "Technical screenshot format validation; final binary equivalence and App Store upload status are separate.",
        "screenshots": records,
    }
    manifest_file = root / "screenshot-manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    preview(root, records)
    archive = root / "sync-dark-app-store-en-US.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
        for record in records:
            zipped.write(root / record["output"], record["output"])
        zipped.write(manifest_file, manifest_file.name)
        for name in PACKAGE_FILES:
            item = root / name
            if item.is_file():
                zipped.write(item, item.name)
    print(json.dumps({"images": len(records), "counts": manifest["counts"], "missing_device_families": missing,
                      "archive": str(archive), "manifest": str(manifest_file),
                      "contact_sheet": str(root / "contact-sheet.jpg")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(f"Screenshot packaging failed: {error}") from error
