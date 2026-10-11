export interface QuoteAsset {
  readonly id: string;
  readonly path: string;
}

export const QUOTE_ASSET_DIRECTORY = "quotes";

/**
 * Stable IDs let pages avoid immediately repeating a supplied quote image.
 * Build tooling packages the source images from src/shared/quotes at /quotes.
 */
export const QUOTE_ASSETS: readonly QuoteAsset[] = [
  { id: "quotefancy-1722861", path: "quotes/Quotefancy-1722861-3840x2160.jpg" },
  { id: "quotefancy-4675155", path: "quotes/Quotefancy-4675155-3840x2160.jpg" },
  { id: "quotefancy-4703214", path: "quotes/Quotefancy-4703214-3840x2160.jpg" },
  { id: "quotefancy-4876", path: "quotes/Quotefancy-4876-3840x2160.jpg" },
  { id: "quotefancy-558245", path: "quotes/Quotefancy-558245-3840x2160.jpg" },
  { id: "quotefancy-7360073", path: "quotes/Quotefancy-7360073-3840x2160.jpg" },
  { id: "quotefancy-7846740", path: "quotes/Quotefancy-7846740-3840x2160.jpg" },
  { id: "quotefancy-8017822", path: "quotes/Quotefancy-8017822-3840x2160.jpg" },
];

/** Selects a supplied quote image, avoiding the prior one when possible. */
export function selectRandomQuote(
  quotes: readonly QuoteAsset[],
  previousQuoteId: string | null,
  random: () => number = Math.random,
): QuoteAsset | null {
  if (quotes.length === 0) {
    return null;
  }

  const candidates =
    quotes.length > 1 && previousQuoteId !== null
      ? quotes.filter((quote) => quote.id !== previousQuoteId)
      : quotes;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));

  return candidates[index] ?? null;
}
