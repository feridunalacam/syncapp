# Sync artwork

Original vector artwork created for Sync on 12 November 2026. Graphite background (#151816), lime work arc (#c7f46b), white rest arc and clock hands. No stock image, external logo, or font glyph is included. Splash lettering is custom vector geometry.

`icon.svg` and `splash.svg` are editable sources. Their rendered PNGs are `../icon.png` (1024 square, opaque RGB) and `../splash.png` (2048 square, opaque RGB). iOS applies its own icon mask. The same mark replaces the old photo in the Android/web placeholder assets; Android is outside the current release scope.

SVG was rendered using PyMuPDF at the exact PNG dimensions. Rerender directly from these SVGs when changing the artwork, and keep the splash background in app.json equal to the SVG background. No remote image or font download is required.
