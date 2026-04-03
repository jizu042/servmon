import net from "node:net";
import { loadConfig } from "../config.js";

export function parseHostPort(address: string): { host: string; port: number } | null {
  const raw = String(address || "").trim();
  if (!raw) return null;
  const [host, portRaw] = raw.split(":");
  if (!host) return null;
  const port = portRaw ? Number(portRaw) : 25565;
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

export function realtimeTcpOnline(address: string): Promise<boolean | null> {
  const hp = parseHostPort(address);
  if (!hp) return Promise.resolve(null);
  const c = loadConfig();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (val: boolean) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(val);
    };
    socket.setTimeout(c.REALTIME_CHECK_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(hp.port, hp.host);
  });
}
