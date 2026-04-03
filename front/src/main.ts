import "./style.css";
import {
  fetchStatus,
  fetchMeta,
  fetchHistory,
  fetchChat,
  postChat,
  skinUrl,
  getApiSettings,
  updateApiSettings,
  type StatusResponse,
  type ChatRow
} from "./api.js";

const POLL_MS = 10_000;
const CHAT_POLL_MS = 2500;

let lastChatIso: string | null = null;
let skinviewLoading = false;
let skinviewReady = false;
/** eslint-disable @typescript-eslint/no-explicit-any */
let activeSkinViewer: any = null;

function isValidTargetAddress(v: string) {
  return /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(v);
}

function el(html: string) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}д ${h}ч ${m}м`;
  if (h > 0) return `${h}ч ${m}м ${sec}с`;
  if (m > 0) return `${m}м ${sec}с`;
  return `${sec}с`;
}

function applyBackground(url: string | null) {
  const root = document.documentElement;
  if (url) {
    root.style.setProperty("--page-bg-image", `url(${JSON.stringify(url)})`);
  } else {
    root.style.removeProperty("--page-bg-image");
  }
}

function disposeSkinViewer() {
  if (activeSkinViewer && typeof activeSkinViewer.dispose === "function") {
    try {
      activeSkinViewer.dispose();
    } catch {
      /* ignore */
    }
  }
  activeSkinViewer = null;
}

async function ensureSkinview3d(): Promise<boolean> {
  if (skinviewReady) return true;
  if (skinviewLoading) {
    await new Promise((r) => setTimeout(r, 120));
    return skinviewReady;
  }
  skinviewLoading = true;
  try {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/skinview3d@3.4.1/bundles/skinview3d.bundle.js";
    s.async = true;
    const ok = await new Promise<boolean>((resolve) => {
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
    skinviewReady = Boolean(ok && (window as unknown as { skinview3d?: unknown }).skinview3d);
    return skinviewReady;
  } finally {
    skinviewLoading = false;
  }
}

async function openSkinModal(username: string) {
  disposeSkinViewer();
  const dlg = document.getElementById("skinModal") as HTMLDialogElement;
  const canvas = document.getElementById("skinCanvas") as HTMLCanvasElement;
  const title = document.getElementById("skinModalTitle");
  if (!dlg || !canvas || !title) return;
  title.textContent = username;
  const W = 280;
  const H = 340;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = "";
  canvas.style.height = "";
  if (!dlg.open) dlg.showModal();
  const url = skinUrl(username);
  const ready = await ensureSkinview3d();
  const api = (window as unknown as { skinview3d?: any }).skinview3d;
  if (ready && api) {
    try {
      activeSkinViewer = new api.SkinViewer({
        canvas,
        width: W,
        height: H,
        skin: url
      });
      activeSkinViewer.animation = new api.WalkingAnimation();
      activeSkinViewer.animation.speed = 0.6;
    } catch {
      draw2dFallback(canvas, url);
    }
  } else {
    draw2dFallback(canvas, url);
  }
}

async function draw2dFallback(canvas: HTMLCanvasElement, url: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise((r) => {
    img.onload = r;
    img.onerror = r;
  });
  if (!img.naturalWidth) return;
  const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  const w = Math.floor(img.naturalWidth * scale);
  const h = Math.floor(img.naturalHeight * scale);
  const ox = Math.floor((canvas.width - w) / 2);
  const oy = Math.floor((canvas.height - h) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, ox, oy, w, h);
}

function renderStatus(data: StatusResponse) {
  const pulse = document.getElementById("statusPulse");
  const st = document.getElementById("statusText");
  const players = document.getElementById("playersLine");
  const ping = document.getElementById("pingLine");
  const uptime = document.getElementById("uptimeLine");
  const motd = document.getElementById("motdBlock");
  const icon = document.getElementById("serverIcon") as HTMLImageElement;
  const ver = document.getElementById("versionLine");

  if (pulse) {
    pulse.className = "status-pulse " + (data.online ? "is-on" : "is-off");
  }
  if (st) {
    st.textContent = data.online ? "Онлайн" : "Оффлайн";
    st.className = "status-title " + (data.online ? "on" : "off");
  }
  if (players) {
    const o = data.players.online;
    const m = data.players.max;
    players.textContent =
      o != null && m != null ? `${o} / ${m} игроков` : o != null ? `${o} игроков` : "—";
  }
  if (ping) ping.textContent = data.pingMs != null ? `${data.pingMs} мс` : "—";
  if (uptime) {
    if (data.online && data.onlineSinceMs) {
      uptime.textContent = formatDuration(Date.now() - data.onlineSinceMs);
    } else {
      uptime.textContent = "—";
    }
  }
  if (motd) motd.textContent = data.motd || "";
  if (icon && data.branding.iconDataUrl) {
    icon.src = data.branding.iconDataUrl;
    icon.hidden = false;
  } else if (icon) {
    icon.hidden = true;
  }
  if (ver) ver.textContent = data.version ? `Версия ${data.version}` : "";

  applyBackground(data.branding.backgroundUrl);

  const list = document.getElementById("playerChips");
  if (list) {
    list.innerHTML = "";
    for (const name of data.players.list) {
      const chip = el(`
        <button type="button" class="player-chip" data-name="${escapeAttr(name)}">
          <canvas width="28" height="28" class="player-chip__canvas" aria-hidden="true"></canvas>
          <span class="player-chip__name">${escapeHtml(name)}</span>
        </button>
      `) as HTMLButtonElement;
      const cvs = chip.querySelector("canvas");
      if (cvs) void drawHead(cvs, name);
      chip.addEventListener("click", () => void openSkinModal(name));
      list.appendChild(chip);
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string) {
  return s.replace(/"/g, "&quot;");
}

async function drawHead(canvas: HTMLCanvasElement, username: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const url = skinUrl(username);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise((r) => {
    img.onload = r;
    img.onerror = r;
  });
  if (!img.naturalWidth) return;
  const size = canvas.width;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
  ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
}

function renderChat(rows: ChatRow[], append: boolean) {
  const box = document.getElementById("chatMessages");
  if (!box) return;
  if (!append) box.innerHTML = "";
  for (const r of rows) {
    const line = el(`
      <div class="chat-line">
        <span class="chat-time">${escapeHtml(new Date(r.createdAt).toLocaleTimeString())}</span>
        <span class="chat-user">${escapeHtml(r.username)}</span>
        <span class="chat-text">${escapeHtml(r.message)}</span>
      </div>
    `);
    box.appendChild(line);
  }
  box.scrollTop = box.scrollHeight;
}

async function tickChat() {
  try {
    const rows = await fetchChat(lastChatIso ?? undefined);
    if (!lastChatIso) {
      renderChat(rows, false);
      if (rows.length) lastChatIso = rows[rows.length - 1].createdAt;
      return;
    }
    if (rows.length) {
      renderChat(rows, true);
      lastChatIso = rows[rows.length - 1].createdAt;
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  const root = document.getElementById("app");
  if (!root) return;

  root.appendChild(
    el(`
    <div class="shell">
      <header class="top">
        <div class="brand">
          <img id="serverIcon" class="server-icon" alt="" hidden width="48" height="48" />
          <div>
            <h1 id="displayTitle" class="title">…</h1>
            <p id="addrMasked" class="sub"></p>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn" id="btnNotify">Уведомления</button>
          <button type="button" class="btn" id="btnHistory">История проверок</button>
          <button type="button" class="btn" id="btnSettings">Настройки</button>
        </div>
      </header>

      <section class="card hero">
        <div class="hero-row">
          <div id="statusPulse" class="status-pulse is-off"></div>
          <div>
            <div id="statusText" class="status-title off">…</div>
            <div id="versionLine" class="ver muted"></div>
          </div>
        </div>
        <div class="stats">
          <div><span class="lbl">Игроки</span><div id="playersLine" class="big mono">—</div></div>
          <div><span class="lbl">Пинг</span><div id="pingLine" class="big mono">—</div></div>
          <div><span class="lbl">В сети</span><div id="uptimeLine" class="big mono">—</div></div>
        </div>
        <p id="motdBlock" class="motd mono"></p>
        <div id="playerChips" class="chips"></div>
      </section>

      <section class="card">
        <h2 class="h2">Чат</h2>
        <div id="chatMessages" class="chat-box"></div>
        <form id="chatForm" class="chat-form">
          <input id="chatUser" class="inp" maxlength="32" placeholder="Ник" required />
          <input id="chatMsg" class="inp inp-grow" maxlength="2000" placeholder="Сообщение" required />
          <button type="submit" class="btn btn-primary">Отправить</button>
        </form>
      </section>

      <p id="hint" class="muted foot"></p>
    </div>

    <dialog id="histModal" class="modal">
      <div class="modal-inner">
        <header class="modal-head"><h2>История проверок</h2><button type="button" class="btn" id="histClose">✕</button></header>
        <div id="histBody" class="table-wrap"></div>
        <div class="pager"><button type="button" class="btn" id="histPrev">Назад</button><span id="histPage"></span><button type="button" class="btn" id="histNext">Вперёд</button></div>
      </div>
    </dialog>

    <dialog id="skinModal" class="modal skin-modal">
      <div class="modal-inner">
        <header class="modal-head"><h2 id="skinModalTitle" class="mono">—</h2><button type="button" class="btn" id="skinClose">✕</button></header>
        <canvas id="skinCanvas" width="280" height="340"></canvas>
      </div>
    </dialog>

    <dialog id="settingsModal" class="modal">
      <div class="modal-inner">
        <header class="modal-head"><h2>Настройки</h2><button type="button" class="btn" id="settingsClose">✕</button></header>
        <form id="settingsForm" class="settings-form">
          <label class="settings-field">
            <span class="lbl">API Base URL</span>
            <input id="setApiBase" class="inp" placeholder="https://your-api.onrender.com" />
          </label>
          <label class="settings-field">
            <span class="lbl">Целевой адрес сервера</span>
            <input id="setAddress" class="inp" placeholder="play.example.com:25565" />
          </label>
          <p class="muted">Если пусто — используются значения сервера по умолчанию.</p>
          <div class="actions">
            <button type="submit" class="btn btn-primary">Сохранить</button>
            <button type="button" class="btn" id="settingsReset">Сбросить</button>
          </div>
        </form>
      </div>
    </dialog>
  `)
  );

  async function refreshMeta() {
    try {
      const meta = await fetchMeta();
      const t = document.getElementById("displayTitle");
      const a = document.getElementById("addrMasked");
      if (t) t.textContent = meta.displayName;
      if (a) a.textContent = meta.addressMasked;
    } catch {
      /* ignore */
    }
  }

  await refreshMeta();

  const settings = getApiSettings();
  const setApiBase = document.getElementById("setApiBase") as HTMLInputElement | null;
  const setAddress = document.getElementById("setAddress") as HTMLInputElement | null;
  if (setApiBase) setApiBase.value = settings.apiBaseUrl;
  if (setAddress) setAddress.value = settings.monitorAddress;

  document.getElementById("btnSettings")?.addEventListener("click", () => {
    (document.getElementById("settingsModal") as HTMLDialogElement).showModal();
  });
  document.getElementById("settingsClose")?.addEventListener("click", () => {
    (document.getElementById("settingsModal") as HTMLDialogElement).close();
  });
  document.getElementById("settingsReset")?.addEventListener("click", () => {
    updateApiSettings({ apiBaseUrl: "", monitorAddress: "" });
    if (setApiBase) setApiBase.value = "";
    if (setAddress) setAddress.value = "";
  });

  document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const apiBase = (setApiBase?.value || "").trim();
    const address = (setAddress?.value || "").trim();
    if (address && !isValidTargetAddress(address)) {
      const hint = document.getElementById("hint");
      if (hint) hint.textContent = "Некорректный адрес. Формат: host или host:port";
      return;
    }
    updateApiSettings({ apiBaseUrl: apiBase, monitorAddress: address });
    lastChatIso = null;
    await refreshMeta();
    await tick();
    await tickChat();
    (document.getElementById("settingsModal") as HTMLDialogElement).close();
  });

  let histPage = 1;
  let histTotalPages = 1;

  async function loadHistory() {
    let data = await fetchHistory(histPage);
    if (data.totalPages >= 1 && histPage > data.totalPages) {
      histPage = data.totalPages;
      data = await fetchHistory(histPage);
    }
    histTotalPages = data.totalPages;
    const body = document.getElementById("histBody");
    const pg = document.getElementById("histPage");
    if (body) {
      body.innerHTML = `<table class="data-table"><thead><tr><th>Время</th><th>Статус</th><th>Игроки</th><th>Пинг</th></tr></thead><tbody>
        ${data.items
          .map(
            (r) =>
              `<tr><td>${escapeHtml(new Date(r.createdAt).toLocaleString())}</td><td>${r.online ? "🟢" : "⚫"}</td><td>${r.playersOnline ?? "—"} / ${r.playersMax ?? "—"}</td><td>${r.pingMs ?? "—"}</td></tr>`
          )
          .join("")}
      </tbody></table>`;
    }
    if (pg) pg.textContent = `${data.page} / ${data.totalPages}`;
  }

  document.getElementById("btnHistory")?.addEventListener("click", () => {
    histPage = 1;
    void loadHistory().then(() => (document.getElementById("histModal") as HTMLDialogElement).showModal());
  });
  document.getElementById("histClose")?.addEventListener("click", () => (document.getElementById("histModal") as HTMLDialogElement).close());
  document.getElementById("histPrev")?.addEventListener("click", () => {
    if (histPage > 1) {
      histPage--;
      void loadHistory();
    }
  });
  document.getElementById("histNext")?.addEventListener("click", () => {
    if (histPage < histTotalPages) {
      histPage++;
      void loadHistory();
    }
  });

  document.getElementById("skinClose")?.addEventListener("click", () => {
    disposeSkinViewer();
    (document.getElementById("skinModal") as HTMLDialogElement).close();
  });
  document.getElementById("skinModal")?.addEventListener("close", () => disposeSkinViewer());

  document.getElementById("chatForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = (document.getElementById("chatUser") as HTMLInputElement).value.trim();
    const m = (document.getElementById("chatMsg") as HTMLInputElement).value.trim();
    if (!u || !m) return;
    await postChat(u, m);
    (document.getElementById("chatMsg") as HTMLInputElement).value = "";
    await tickChat();
  });

  let notifyOn = false;
  document.getElementById("btnNotify")?.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    if (notifyOn) {
      notifyOn = false;
      (document.getElementById("btnNotify") as HTMLButtonElement).textContent = "Уведомления: выкл";
      return;
    }
    const p = await Notification.requestPermission();
    notifyOn = p === "granted";
    (document.getElementById("btnNotify") as HTMLButtonElement).textContent =
      notifyOn ? "Уведомления: вкл" : "Уведомления: выкл";
  });

  let lastOnline = false;
  let lastSnap: StatusResponse | null = null;

  async function tick() {
    try {
      const data = await fetchStatus();
      lastSnap = data;
      renderStatus(data);
      const hint = document.getElementById("hint");
      if (hint) hint.textContent = `Обновлено ${new Date().toLocaleTimeString()} · ${data.onlineReason}`;
      if (notifyOn && "Notification" in window && Notification.permission === "granted") {
        if (!lastOnline && data.online) {
          new Notification("Сервер в сети", { body: data.motd || "" });
        }
      }
      lastOnline = data.online;
    } catch (e) {
      const hint = document.getElementById("hint");
      if (hint) hint.textContent = String(e && e instanceof Error ? e.message : e);
    }
  }

  await tick();
  setInterval(tick, POLL_MS);
  await tickChat();
  setInterval(tickChat, CHAT_POLL_MS);
  setInterval(() => {
    const uptime = document.getElementById("uptimeLine");
    if (!uptime || !lastSnap) return;
    if (lastSnap.online && lastSnap.onlineSinceMs) {
      uptime.textContent = formatDuration(Date.now() - lastSnap.onlineSinceMs);
    }
  }, 1000);
}

void main();
