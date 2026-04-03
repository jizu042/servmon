import { Router } from "express";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { sendOk, sendErr } from "../lib/apiEnvelope.js";
import { maskAddress } from "../lib/mask.js";
import { prisma } from "../db.js";
import { resolveMonitorStatus } from "../services/status.js";
import { getCachedBranding } from "../services/branding.js";
import { getStatusCache } from "../services/cache.js";

const router = Router();

router.get("/health", (_req, res) => {
  const c = loadConfig();
  sendOk(res, 200, {
    status: "ok",
    env: c.NODE_ENV,
    uptimeSec: Math.round(process.uptime())
  });
});

router.get("/meta", (_req, res) => {
  const c = loadConfig();
  sendOk(res, 200, {
    displayName: c.SERVER_DISPLAY_NAME,
    addressMasked: maskAddress(c.MONITOR_ADDRESS)
  });
});

router.get("/meta/reveal", (req, res) => {
  const c = loadConfig();
  const secret = String(req.query.secret || "");
  if (!c.REVEAL_SECRET || secret !== c.REVEAL_SECRET) {
    return sendErr(res, 403, "FORBIDDEN", "Invalid or missing secret");
  }
  sendOk(res, 200, { address: c.MONITOR_ADDRESS });
});

router.get("/status", async (_req, res) => {
  const c = loadConfig();
  const cache = getStatusCache();
  const key = "status:v2";
  const hit = cache.get<unknown>(key);
  if (hit) {
    return sendOk(res, 200, hit as Record<string, unknown>);
  }
  try {
    const snap = await resolveMonitorStatus(c.MONITOR_ADDRESS);
    const brand = await getCachedBranding(c.MONITOR_ADDRESS);
    const icon = snap.iconDataUrl || brand.faviconUrl || null;
    const payload = {
      online: snap.online,
      onlineReason: snap.onlineReason,
      players: snap.players,
      pingMs: snap.pingMs,
      version: snap.version,
      motd: snap.motd,
      branding: {
        iconDataUrl: icon,
        backgroundUrl: brand.backgroundUrl,
        faviconUrl: brand.faviconUrl
      },
      uptimeMs: snap.uptimeMs,
      onlineSinceMs: snap.onlineSinceMs,
      upstreamErrors: snap.upstreamErrors,
      realtime: snap.realtime
    };
    cache.set(key, payload);
    sendOk(res, 200, payload);
  } catch (e) {
    sendErr(res, 500, "STATUS_FAILED", String(e && e instanceof Error ? e.message : e));
  }
});

const historyQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(30)
});

router.get("/history/checks", async (req, res) => {
  const q = historyQuery.safeParse(req.query);
  if (!q.success) {
    return sendErr(res, 400, "BAD_QUERY", "Invalid query", q.error.flatten());
  }
  const { page, limit } = q.data;
  const skip = (page - 1) * limit;
  try {
    const [rows, total] = await Promise.all([
      prisma.checkRecord.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.checkRecord.count()
    ]);
    sendOk(res, 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        online: r.online,
        playersOnline: r.playersOnline,
        playersMax: r.playersMax,
        pingMs: r.pingMs
      }))
    });
  } catch (e) {
    sendErr(res, 500, "DB_ERROR", String(e && e instanceof Error ? e.message : e));
  }
});

const chatPost = z.object({
  username: z.string().trim().min(1).max(32),
  message: z.string().trim().min(1).max(2000)
});

router.post("/chat/messages", async (req, res) => {
  const parsed = chatPost.safeParse(req.body);
  if (!parsed.success) {
    return sendErr(res, 400, "BAD_BODY", "Invalid body", parsed.error.flatten());
  }
  try {
    const row = await prisma.chatMessage.create({
      data: {
        username: parsed.data.username,
        message: parsed.data.message
      }
    });
    sendOk(res, 201, {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      username: row.username,
      message: row.message
    });
  } catch (e) {
    sendErr(res, 500, "DB_ERROR", String(e && e instanceof Error ? e.message : e));
  }
});

router.get("/chat/messages", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  let sinceDate: Date | undefined;
  if (typeof req.query.since === "string" && req.query.since) {
    const d = new Date(req.query.since);
    if (!Number.isNaN(d.getTime())) sinceDate = d;
  }
  try {
    const rows = await prisma.chatMessage.findMany({
      where: sinceDate ? { createdAt: { gt: sinceDate } } : undefined,
      orderBy: { createdAt: "asc" },
      take: limit
    });
    sendOk(
      res,
      200,
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        username: r.username,
        message: r.message
      }))
    );
  } catch (e) {
    sendErr(res, 500, "DB_ERROR", String(e && e instanceof Error ? e.message : e));
  }
});

router.get("/skin/:username", async (req, res) => {
  const raw = String(req.params.username || "").trim();
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(raw)) {
    return sendErr(res, 400, "BAD_USERNAME", "Invalid username");
  }
  const c = loadConfig();
  const url = `${c.ELY_SKIN_BASE}/${encodeURIComponent(raw)}.png`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), c.API_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!upstream.ok) {
      return sendErr(res, upstream.status === 404 ? 404 : 502, "SKIN_UPSTREAM", `HTTP ${upstream.status}`);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buf);
  } catch {
    sendErr(res, 502, "SKIN_FETCH_FAILED", "Skin fetch failed");
  } finally {
    clearTimeout(t);
  }
});

export { router as apiV1Router };
