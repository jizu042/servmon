import { loadConfig } from "../config.js";
import { prisma } from "../db.js";
import { resolveMonitorStatus } from "./status.js";

export function startPoller(): ReturnType<typeof setInterval> {
  const c = loadConfig();
  const tick = async () => {
    try {
      const snap = await resolveMonitorStatus(c.MONITOR_ADDRESS);
      await prisma.checkRecord.create({
        data: {
          online: snap.online,
          playersOnline: snap.players.online,
          playersMax: snap.players.max,
          pingMs: snap.pingMs
        }
      });
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "poll_failed",
          err: String(e && e instanceof Error ? e.message : e)
        })
      );
    }
  };
  void tick();
  return setInterval(tick, c.POLL_INTERVAL_MS);
}
