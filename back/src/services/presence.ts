/** Single monitored server: last online transition time (ms). */
let onlineSinceMs: number | null = null;
let lastOnline: boolean | null = null;

export function updatePresence(online: boolean, now: number): { onlineSinceMs: number | null; uptimeMs: number | null } {
  if (online) {
    if (lastOnline !== true) {
      onlineSinceMs = now;
    }
  } else {
    onlineSinceMs = null;
  }
  lastOnline = online;
  const uptimeMs = online && onlineSinceMs ? now - onlineSinceMs : null;
  return { onlineSinceMs: online ? onlineSinceMs : null, uptimeMs };
}
