import { QUOTE_ASSETS, selectRandomQuote, type QuoteAsset } from "./quote-content.js";

export interface QuoteRenderTarget {
  readonly image: HTMLElement;
  readonly fallback: HTMLElement;
}

export interface QuoteRenderOptions {
  readonly previousQuoteId: string | null;
  readonly onQuoteSelected?: (quote: QuoteAsset) => Promise<void> | void;
  readonly quotes?: readonly QuoteAsset[];
  readonly fallbackMessage: string;
}

export async function renderRandomQuote(
  target: QuoteRenderTarget,
  options: QuoteRenderOptions,
): Promise<QuoteAsset | null> {
  const quotes = options.quotes ?? QUOTE_ASSETS;
  const selected = selectRandomQuote(quotes, options.previousQuoteId);
  const attempts =
    selected === null ? [] : [selected, ...quotes.filter((quote) => quote.id !== selected.id)];
  target.fallback.hidden = false;

  if (attempts.length === 0) {
    showQuoteFallback(target, options.fallbackMessage);
    target.image.hidden = true;
    clearRenderedQuote(target.image);
    return null;
  }

  for (const quote of attempts) {
    try {
      const src = await loadQuoteAssetUrl(quote.path);
      applyRenderedQuote(target.image, src);
      target.image.hidden = false;
      target.fallback.hidden = true;
      try {
        await options.onQuoteSelected?.(quote);
      } catch {
        // Persisting quote metadata must never block rendering the quote itself.
      }
      return quote;
    } catch {
      target.image.hidden = true;
      clearRenderedQuote(target.image);
      continue;
    }
  }

  showQuoteFallback(target, options.fallbackMessage);
  target.image.hidden = true;
  clearRenderedQuote(target.image);
  return null;
}

function showQuoteFallback(target: QuoteRenderTarget, message: string): void {
  target.fallback.hidden = false;
  target.fallback.textContent = message;
}

async function loadQuoteAssetUrl(path: string): Promise<string> {
  const runtimeUrl = chrome.runtime.getURL(path);
  const response = await fetch(runtimeUrl, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${runtimeUrl}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function applyRenderedQuote(surface: HTMLElement, src: string): void {
  releaseObjectUrl(surface);
  surface.dataset.quoteObjectUrl = src;
  surface.style.backgroundImage = `url("${src}")`;
}

function clearRenderedQuote(surface: HTMLElement): void {
  releaseObjectUrl(surface);
  surface.style.removeProperty("background-image");
}

function releaseObjectUrl(surface: HTMLElement): void {
  const previous = surface.dataset.quoteObjectUrl;
  if (typeof previous === "string" && previous.length > 0) {
    URL.revokeObjectURL(previous);
  }

  delete surface.dataset.quoteObjectUrl;
}
