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

const UI_SETTINGS_KEY = "mc-monitor.ui-settings.v1";

type UiSettings = {
  statusPollSec: number;
  chatPollSec: number;
  historyPageSize: number;
  autoRefresh: boolean;
  notifyEnabled: boolean;
  showBackground: boolean;
  enableSkinPreview: boolean;
};

const defaultUiSettings: UiSettings = {
  statusPollSec: 10,
  chatPollSec: 3,
  historyPageSize: 20,
  autoRefresh: true,
  notifyEnabled: false,
  showBackground: true,
  enableSkinPreview: true
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeUiSettings(raw: Partial<UiSettings>): UiSettings {
  return {
    statusPollSec: clamp(Number(raw.statusPollSec || defaultUiSettings.statusPollSec), 5, 300),
    chatPollSec: clamp(Number(raw.chatPollSec || defaultUiSettings.chatPollSec), 1, 60),
    historyPageSize: clamp(Number(raw.historyPageSize || defaultUiSettings.historyPageSize), 5, 100),
    autoRefresh: raw.autoRefresh ?? defaultUiSettings.autoRefresh,
    notifyEnabled: raw.notifyEnabled ?? defaultUiSettings.notifyEnabled,
    showBackground: raw.showBackground ?? defaultUiSettings.showBackground,
    enableSkinPreview: raw.enableSkinPreview ?? defaultUiSettings.enableSkinPreview
  };
}

function loadUiSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return { ...defaultUiSettings };
    return normalizeUiSettings(JSON.parse(raw) as Partial<UiSettings>);
  } catch {
    return { ...defaultUiSettings };
  }
}

function saveUiSettings(next: UiSettings) {
  localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(next));
}

let uiSettings = loadUiSettings();

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

  applyBackground(uiSettings.showBackground ? data.branding.backgroundUrl : null);

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
      if (uiSettings.enableSkinPreview) {
        if (cvs) void drawHead(cvs, name);
        chip.addEventListener("click", () => void openSkinModal(name));
      } else {
        if (cvs) {
          cvs.style.display = "none";
        }
        chip.style.padding = "8px 12px";
      }
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

      <details id="settingsPanel" class="card settings-sheet">
        <summary class="settings-summary">Настройки · API · мониторинг · интерфейс</summary>
        <form id="settingsForm" class="settings-form">
          <label class="settings-field">
            <span class="lbl">API Base URL</span>
            <input id="setApiBase" class="inp" placeholder="https://your-api.onrender.com" />
          </label>
          <label class="settings-field">
            <span class="lbl">Целевой адрес сервера</span>
            <input id="setAddress" class="inp" placeholder="play.example.com:25565" />
          </label>

          <div class="settings-grid2">
            <label class="settings-field">
              <span class="lbl">Опрос статуса (сек)</span>
              <input id="setStatusSec" class="inp" type="number" min="5" max="300" step="1" />
            </label>
            <label class="settings-field">
              <span class="lbl">Опрос чата (сек)</span>
              <input id="setChatSec" class="inp" type="number" min="1" max="60" step="1" />
            </label>
          </div>

          <label class="settings-field">
            <span class="lbl">Элементов в истории</span>
            <input id="setHistoryLimit" class="inp" type="number" min="5" max="100" step="1" />
          </label>

          <div class="settings-flags">
            <label class="chk"><input id="setAutoRefresh" type="checkbox" /> Автообновление</label>
            <label class="chk"><input id="setNotify" type="checkbox" /> Уведомления о переходе в онлайн</label>
            <label class="chk"><input id="setShowBg" type="checkbox" /> Фоновая картинка сервера</label>
            <label class="chk"><input id="setSkinPreview" type="checkbox" /> Превью скинов игроков</label>
          </div>

          <p class="muted">Если API/адрес пустые — используются серверные значения по умолчанию.</p>
          <div class="actions">
            <button type="submit" class="btn btn-primary">Сохранить</button>
            <button type="button" class="btn" id="settingsReset">Сбросить</button>
          </div>
        </form>
      </details>

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
  const setStatusSec = document.getElementById("setStatusSec") as HTMLInputElement | null;
  const setChatSec = document.getElementById("setChatSec") as HTMLInputElement | null;
  const setHistoryLimit = document.getElementById("setHistoryLimit") as HTMLInputElement | null;
  const setAutoRefresh = document.getElementById("setAutoRefresh") as HTMLInputElement | null;
  const setNotify = document.getElementById("setNotify") as HTMLInputElement | null;
  const setShowBg = document.getElementById("setShowBg") as HTMLInputElement | null;
  const setSkinPreview = document.getElementById("setSkinPreview") as HTMLInputElement | null;
  const btnNotify = document.getElementById("btnNotify") as HTMLButtonElement | null;
  const settingsPanel = document.getElementById("settingsPanel") as HTMLDetailsElement | null;

  function syncNotifyLabel() {
    if (!btnNotify) return;
    btnNotify.textContent = uiSettings.notifyEnabled ? "Уведомления: вкл" : "Уведомления: выкл";
  }

  function syncSettingsForm() {
    if (setApiBase) setApiBase.value = settings.apiBaseUrl;
    if (setAddress) setAddress.value = settings.monitorAddress;
    if (setStatusSec) setStatusSec.value = String(uiSettings.statusPollSec);
    if (setChatSec) setChatSec.value = String(uiSettings.chatPollSec);
    if (setHistoryLimit) setHistoryLimit.value = String(uiSettings.historyPageSize);
    if (setAutoRefresh) setAutoRefresh.checked = uiSettings.autoRefresh;
    if (setNotify) setNotify.checked = uiSettings.notifyEnabled;
    if (setShowBg) setShowBg.checked = uiSettings.showBackground;
    if (setSkinPreview) setSkinPreview.checked = uiSettings.enableSkinPreview;
    syncNotifyLabel();
  }

  syncSettingsForm();

  document.getElementById("btnSettings")?.addEventListener("click", () => {
    if (settingsPanel) {
      settingsPanel.open = true;
      settingsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  document.getElementById("settingsReset")?.addEventListener("click", () => {
    updateApiSettings({ apiBaseUrl: "", monitorAddress: "" });
    settings.apiBaseUrl = "";
    settings.monitorAddress = "";
    uiSettings = { ...defaultUiSettings };
    saveUiSettings(uiSettings);
    syncSettingsForm();
    restartPolling();
    lastChatIso = null;
    void refreshMeta();
    void tick();
    void tickChat();
  });

  document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const apiBase = (setApiBase?.value || "").trim();
    const address = (setAddress?.value || "").trim();
    const statusPollSec = clamp(Number(setStatusSec?.value || uiSettings.statusPollSec), 5, 300);
    const chatPollSec = clamp(Number(setChatSec?.value || uiSettings.chatPollSec), 1, 60);
    const historyPageSize = clamp(Number(setHistoryLimit?.value || uiSettings.historyPageSize), 5, 100);
    const autoRefresh = Boolean(setAutoRefresh?.checked);
    const notifyEnabled = Boolean(setNotify?.checked);
    const showBackground = Boolean(setShowBg?.checked);
    const enableSkinPreview = Boolean(setSkinPreview?.checked);

    if (address && !isValidTargetAddress(address)) {
      const hint = document.getElementById("hint");
      if (hint) hint.textContent = "Некорректный адрес. Формат: host или host:port";
      return;
    }

    let notifyFinal = notifyEnabled;
    if (notifyEnabled && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      notifyFinal = p === "granted";
    }

    updateApiSettings({ apiBaseUrl: apiBase, monitorAddress: address });
    settings.apiBaseUrl = apiBase;
    settings.monitorAddress = address;
    uiSettings = normalizeUiSettings({
      statusPollSec,
      chatPollSec,
      historyPageSize,
      autoRefresh,
      notifyEnabled: notifyFinal,
      showBackground,
      enableSkinPreview
    });
    saveUiSettings(uiSettings);
    if (setNotify) setNotify.checked = uiSettings.notifyEnabled;
    syncNotifyLabel();

    lastChatIso = null;
    await refreshMeta();
    await tick();
    await tickChat();
    restartPolling();
    if (settingsPanel) settingsPanel.open = false;
  });

  let histPage = 1;
  let histTotalPages = 1;

  async function loadHistory() {
    let data = await fetchHistory(histPage, uiSettings.historyPageSize);
    if (data.totalPages >= 1 && histPage > data.totalPages) {
      histPage = data.totalPages;
      data = await fetchHistory(histPage, uiSettings.historyPageSize);
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

  document.getElementById("btnNotify")?.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    if (uiSettings.notifyEnabled) {
      uiSettings.notifyEnabled = false;
      if (setNotify) setNotify.checked = false;
      saveUiSettings(uiSettings);
      syncNotifyLabel();
      return;
    }
    const p = await Notification.requestPermission();
    uiSettings.notifyEnabled = p === "granted";
    if (setNotify) setNotify.checked = uiSettings.notifyEnabled;
    saveUiSettings(uiSettings);
    syncNotifyLabel();
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
      if (uiSettings.notifyEnabled && "Notification" in window && Notification.permission === "granted") {
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

  let statusTimer: number | null = null;
  let chatTimer: number | null = null;

  function restartPolling() {
    if (statusTimer !== null) {
      window.clearInterval(statusTimer);
      statusTimer = null;
    }
    if (chatTimer !== null) {
      window.clearInterval(chatTimer);
      chatTimer = null;
    }
    if (!uiSettings.autoRefresh) return;
    statusTimer = window.setInterval(() => {
      void tick();
    }, uiSettings.statusPollSec * 1000);
    chatTimer = window.setInterval(() => {
      void tickChat();
    }, uiSettings.chatPollSec * 1000);
  }

  await tick();
  await tickChat();
  restartPolling();
  setInterval(() => {
    const uptime = document.getElementById("uptimeLine");
    if (!uptime || !lastSnap) return;
    if (lastSnap.online && lastSnap.onlineSinceMs) {
      uptime.textContent = formatDuration(Date.now() - lastSnap.onlineSinceMs);
    }
  }, 1000);
}

void main();
