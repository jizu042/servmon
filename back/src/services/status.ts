import { loadConfig } from "../config.js";
import { fetchJsonWithTimeout, encodeAddressPath } from "./fetch.js";
import { realtimeTcpOnline } from "./tcp.js";
import { normalizePlayersOnline, normalizePlayersMax } from "./players.js";
import { updatePresence } from "./presence.js";

export type UpstreamSnapshot = {
  online: boolean;
  onlineReason: string;
  players: { online: number | null; max: number | null; list: string[] };
  pingMs: number;
  version: string | null;
  motd: string;
  iconDataUrl: string | null;
  upstream: { mcstatus: unknown; ismc: unknown };
  upstreamErrors: { mcstatus: string | null; ismc: string | null };
  realtime: { tcpOnline: boolean | null };
  onlineSinceMs: number | null;
  uptimeMs: number | null;
};

function extractPlayerNames(mcstatus: Record<string, unknown> | null, ismc: Record<string, unknown> | null): string[] {
  const ism = ismc?.players as { list?: Array<{ name?: string; name_clean?: string }> } | undefined;
  if (Array.isArray(ism?.list)) {
    return ism.list.map((p) => p?.name || p?.name_clean).filter(Boolean) as string[];
  }
  const mc = mcstatus?.players as { list?: Array<{ name_clean?: string; name_raw?: string; name?: string }> } | undefined;
  if (Array.isArray(mc?.list)) {
    return mc.list.map((p) => p?.name_clean || p?.name_raw || p?.name).filter(Boolean) as string[];
  }
  return [];
}

function extractIcon(mcstatus: Record<string, unknown> | null): string | null {
  const icon = mcstatus?.icon;
  if (typeof icon === "string" && icon.startsWith("data:image")) return icon;
  return null;
}

/**
 * Strict online resolution (BUG1): invalid/missing player online count => offline.
 */
export function computeOnline(args: {
  tcp: boolean | null;
  upstreamOnline: boolean | null;
  playersOnline: number | null;
}): { online: boolean; reason: string } {
  const { tcp, upstreamOnline, playersOnline } = args;
  const validPlayers = playersOnline !== null;

  if (tcp === false) {
    return { online: false, reason: "tcp_unreachable" };
  }
  if (!validPlayers) {
    return { online: false, reason: "players_missing_or_invalid" };
  }
  if (upstreamOnline === false) {
    return { online: false, reason: "upstream_offline" };
  }
  if (tcp === true && validPlayers) {
    return { online: true, reason: "tcp_ok" };
  }
  if (upstreamOnline === true && validPlayers && tcp !== false) {
    return { online: true, reason: "upstream_ok" };
  }
  return { online: false, reason: "insufficient_signals" };
}

export async function resolveMonitorStatus(address: string): Promise<UpstreamSnapshot> {
  const c = loadConfig();
  const mcstatusUrl = `${c.MCSTATUS_API_BASE}/status/java/${encodeAddressPath(address)}?query=true&timeout=5`;

  let mcstatus: Record<string, unknown> | null = null;
  let mcstatusError: string | null = null;
  let ismc: Record<string, unknown> | null = null;
  let ismcError: string | null = null;
  const startedAt = Date.now();

  try {
    const out = await fetchJsonWithTimeout(mcstatusUrl);
    if (out.status >= 200 && out.status < 300 && out.body && typeof out.body === "object") {
      mcstatus = out.body as Record<string, unknown>;
    } else {
      mcstatusError = `HTTP ${out.status}`;
    }
  } catch (e) {
    mcstatusError = String(e && e instanceof Error ? e.message : e);
  }

  let realtimeOnline: boolean | null = null;
  try {
    realtimeOnline = await realtimeTcpOnline(address);
  } catch {
    realtimeOnline = null;
  }

  const token = c.ISMCSERVER_TOKEN.trim();
  if (token) {
    const ismcUrl = `${c.ISMCSERVER_API_BASE}/${encodeAddressPath(address)}`;
    try {
      let out = await fetchJsonWithTimeout(ismcUrl, { Authorization: token });
      if (out.status === 404) {
        out = await fetchJsonWithTimeout(`${c.ISMCSERVER_API_BASE}/${address}`, { Authorization: token });
      }
      if (out.status >= 200 && out.status < 300 && out.body && typeof out.body === "object") {
        ismc = out.body as Record<string, unknown>;
      } else {
        ismcError = `HTTP ${out.status}`;
      }
    } catch (e) {
      ismcError = String(e && e instanceof Error ? e.message : e);
    }
  }

  const latencyMs = Date.now() - startedAt;

  const rawOnline =
    typeof mcstatus?.online === "boolean"
      ? mcstatus.online
      : typeof ismc?.online === "boolean"
        ? ismc.online
        : null;

  const pOnRaw =
    (ismc?.players as { online?: unknown } | undefined)?.online ??
    (mcstatus?.players as { online?: unknown } | undefined)?.online;
  const pMaxRaw =
    (ismc?.players as { max?: unknown } | undefined)?.max ??
    (mcstatus?.players as { max?: unknown } | undefined)?.max;

  const playersOnline = normalizePlayersOnline(pOnRaw);
  const playersMax = normalizePlayersMax(pMaxRaw);
  const list = extractPlayerNames(mcstatus, ismc);

  const { online, reason } = computeOnline({
    tcp: realtimeOnline,
    upstreamOnline: rawOnline,
    playersOnline
  });

  const motd =
    String(
      (mcstatus?.motd as { clean?: string } | undefined)?.clean ||
        (ismc?.motd as { clean?: string } | undefined)?.clean ||
        (mcstatus?.motd as { raw?: string } | undefined)?.raw ||
        (ismc?.motd as { raw?: string } | undefined)?.raw ||
        ""
    ) || "";

  const version =
    String(
      (mcstatus?.version as { name_clean?: string; name_raw?: string } | undefined)?.name_clean ||
        (mcstatus?.version as { name_clean?: string; name_raw?: string } | undefined)?.name_raw ||
        (ismc?.version as { string?: string } | undefined)?.string ||
        ""
    ) || null;

  const iconDataUrl = extractIcon(mcstatus);
  const now = Date.now();
  const { onlineSinceMs, uptimeMs } = updatePresence(online, now);

  return {
    online,
    onlineReason: reason,
    players: { online: playersOnline, max: playersMax, list },
    pingMs: latencyMs,
    version,
    motd,
    iconDataUrl,
    upstream: { mcstatus, ismc },
    upstreamErrors: { mcstatus: mcstatusError, ismc: ismcError },
    realtime: { tcpOnline: realtimeOnline },
    onlineSinceMs,
    uptimeMs
  };
}
