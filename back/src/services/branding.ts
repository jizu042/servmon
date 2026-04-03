import * as cheerio from "cheerio";
import { loadConfig } from "../config.js";
import { encodeAddressPath } from "./fetch.js";
import { getBrandingCache } from "./cache.js";

export type ExtraBranding = {
  backgroundUrl: string | null;
  faviconUrl: string | null;
  checksHtmlSnippet: string | null;
};

/**
 * Spike: IsMcServer JSON may omit background; HTML page is CSR-heavy — scrape is best-effort.
 */
async function fetchHtmlBranding(address: string): Promise<ExtraBranding> {
  const c = loadConfig();
  if (!c.ENABLE_ISMC_HTML_SCRAPE) {
    return { backgroundUrl: null, faviconUrl: null, checksHtmlSnippet: null };
  }
  const url = `https://ismcserver.online/${encodeAddressPath(address)}/?query`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), c.API_TIMEOUT_MS);
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return { backgroundUrl: null, faviconUrl: null, checksHtmlSnippet: null };
    const html = await res.text();
    const $ = cheerio.load(html);
    const ogImage = $('meta[property="og:image"]').attr("content") || null;
    const icon =
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      null;
    const abs = (u: string | null) => {
      if (!u) return null;
      if (u.startsWith("http")) return u;
      return new URL(u, "https://ismcserver.online/").href;
    };
    return {
      backgroundUrl: abs(ogImage),
      faviconUrl: abs(icon),
      checksHtmlSnippet: null
    };
  } catch {
    return { backgroundUrl: null, faviconUrl: null, checksHtmlSnippet: null };
  }
}

export async function getCachedBranding(address: string): Promise<ExtraBranding> {
  const cache = getBrandingCache();
  const key = `brand:${address}`;
  const hit = cache.get<ExtraBranding>(key);
  if (hit) return hit;
  const extra = await fetchHtmlBranding(address);
  cache.set(key, extra);
  return extra;
}
