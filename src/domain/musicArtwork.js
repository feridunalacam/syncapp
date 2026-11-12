// MusicKit resolves the size tokens, but can leave the format token URL-encoded.
// Also repair artwork stored by older builds before handing it to native Image.
export function musicArtworkUrls(item, size = 300) {
  const pixels = Number.isFinite(size) ? Math.max(1, Math.min(1200, Math.ceil(size))) : 300;
  const values =
    typeof item === 'string'
      ? [item]
      : [
          item?.coverUrl,
          item?.image,
          item?.artwork?.url,
          item?.album?.images?.[0]?.url,
          item?.images?.[0]?.url,
        ];
  return [
    ...new Set(
      values
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) =>
          value
            .trim()
            .replace(/\{w\}|%7Bw%7D/gi, String(pixels))
            .replace(/\{h\}|%7Bh%7D/gi, String(pixels))
            .replace(/\{f\}|%7Bf%7D/gi, 'jpg'),
        ),
    ),
  ];
}
