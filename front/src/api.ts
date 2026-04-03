const base = () => "";

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
  const res = await fetch(`${base()}/api/v1/status`);
  const json = (await res.json()) as { success: boolean; data?: StatusResponse; error?: { message?: string } };
  if (!res.ok || !json.success || !json.data) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json.data;
}

export async function fetchMeta(): Promise<{ displayName: string; addressMasked: string }> {
  const res = await fetch(`${base()}/api/v1/meta`);
  const json = (await res.json()) as {
    success: boolean;
    data?: { displayName: string; addressMasked: string };
  };
  if (!res.ok || !json.success || !json.data) throw new Error("meta");
  return json.data;
}

export async function fetchHistory(page: number) {
  const res = await fetch(`${base()}/api/v1/history/checks?page=${page}&limit=20`);
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
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  const res = await fetch(`${base()}/api/v1/chat/messages${q}`);
  const json = (await res.json()) as { success: boolean; data?: ChatRow[] };
  if (!res.ok || !json.success || !json.data) throw new Error("chat");
  return json.data;
}

export async function postChat(username: string, message: string) {
  const res = await fetch(`${base()}/api/v1/chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, message })
  });
  const json = (await res.json()) as { success: boolean };
  if (!res.ok || !json.success) throw new Error("post chat");
}

export function skinUrl(username: string) {
  return `${base()}/api/v1/skin/${encodeURIComponent(username)}`;
}
