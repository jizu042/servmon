const SETTINGS_KEY = "mc-monitor.settings.v1";

export type ClientApiSettings = {
  apiBaseUrl: string;
  monitorAddress: string;
};

const defaultSettings: ClientApiSettings = {
  apiBaseUrl: "",
  monitorAddress: ""
};

function normalizeBaseUrl(v: string): string {
  return v.trim().replace(/\/+$/, "");
}

function loadSettings(): ClientApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<ClientApiSettings>;
    return {
      apiBaseUrl: normalizeBaseUrl(String(parsed.apiBaseUrl ?? "")),
      monitorAddress: String(parsed.monitorAddress ?? "").trim()
    };
  } catch {
    return { ...defaultSettings };
  }
}

let settings: ClientApiSettings = loadSettings();

export function getApiSettings(): ClientApiSettings {
  return { ...settings };
}

export function updateApiSettings(next: Partial<ClientApiSettings>) {
  settings = {
    apiBaseUrl:
      typeof next.apiBaseUrl === "string" ? normalizeBaseUrl(next.apiBaseUrl) : settings.apiBaseUrl,
    monitorAddress:
      typeof next.monitorAddress === "string" ? next.monitorAddress.trim() : settings.monitorAddress
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function apiBase() {
  return settings.apiBaseUrl;
}

function withParams(path: string, params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v.trim()) q.set(k, v.trim());
  }
  const query = q.toString();
  const prefix = apiBase();
  const url = `${prefix}${path}`;
  return query ? `${url}?${query}` : url;
}

export type StatusResponse = {
  online: boolean;
  onlineReason: string;
  players: { online: number | null; max: number | null; list: string[] };
  pingMs: number | null;
  version: string | null;
  motd: string;
  branding: {
    iconDataUrl: string | null;
    backgroundUrl: string | null;
    faviconUrl: string | null;
  };
  uptimeMs: number | null;
  onlineSinceMs: number | null;
};

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch(withParams("/api/v1/status", { address: settings.monitorAddress }));
  const json = (await res.json()) as { success: boolean; data?: StatusResponse; error?: { message?: string } };
  if (!res.ok || !json.success || !json.data) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json.data;
}

export async function fetchMeta(): Promise<{ displayName: string; addressMasked: string }> {
  const res = await fetch(withParams("/api/v1/meta", { address: settings.monitorAddress }));
  const json = (await res.json()) as {
    success: boolean;
    data?: { displayName: string; addressMasked: string };
  };
  if (!res.ok || !json.success || !json.data) throw new Error("meta");
  return json.data;
}

export async function fetchHistory(page: number) {
  const res = await fetch(withParams("/api/v1/history/checks", { page: String(page), limit: "20" }));
  const json = (await res.json()) as { success: boolean; data?: unknown };
  if (!res.ok || !json.success) throw new Error("history");
  return json.data as {
    items: Array<{
      id: string;
      createdAt: string;
      online: boolean;
      playersOnline: number | null;
      playersMax: number | null;
      pingMs: number | null;
    }>;
    page: number;
    totalPages: number;
    total: number;
  };
}

export type ChatRow = { id: string; createdAt: string; username: string; message: string };

export async function fetchChat(since?: string): Promise<ChatRow[]> {
  const res = await fetch(withParams("/api/v1/chat/messages", { since }));
  const json = (await res.json()) as { success: boolean; data?: ChatRow[] };
  if (!res.ok || !json.success || !json.data) throw new Error("chat");
  return json.data;
}

export async function postChat(username: string, message: string) {
  const res = await fetch(withParams("/api/v1/chat/messages"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, message })
  });
  const json = (await res.json()) as { success: boolean };
  if (!res.ok || !json.success) throw new Error("post chat");
}

export function skinUrl(username: string) {
  return `${apiBase()}/api/v1/skin/${encodeURIComponent(username)}`;
}
