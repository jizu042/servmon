import { loadConfig } from "../config.js";

export function encodeAddressPath(address: string): string {
  return encodeURI(address);
}

export async function fetchJsonWithTimeout(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  const c = loadConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), c.API_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _raw: text.slice(0, 1000) };
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timeout);
  }
}
