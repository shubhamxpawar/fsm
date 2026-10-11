# Supplied quote images

Place the quote images shown on the blocked page in this folder.

- Supported formats: `.jpg`, `.jpeg`, `.png`, and `.webp`.
- Use a lowercase file extension and a unique, descriptive filename. Avoid spaces.
- Recommended: landscape images at least 1920×1080, with the quote readable at normal browser size. Keep each file at or below 5 MB.
- Each image is a complete quote asset: it contains its own quote/background composition. There is no separate quote-text or background pairing.
- Add every supported image to `src/shared/quote-content.ts` using a stable ID and its exact filename. The build copies this folder to the packaged extension's `/quotes/` directory.
- Keep all assets local. Do not add remote URLs, downloaded-at-runtime assets, or executable content.

If no valid asset is available, the extension shows its built-in text-only fallback rather than failing to render a page.
