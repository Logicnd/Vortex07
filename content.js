// Vortex07 v1.2.7 content.js
// Clean stable build: 2007 layout + smart player search + safe hover preview.
// IMPORTANT: keep this as plain JavaScript. Do not paste HTML-escaped text like &gt; or &amp;.

const ext = typeof browser !== "undefined" ? browser : chrome;

const VORTEX07_VERSION = "1.6.0";
const VORTEX_ORIGIN = "https://playvortex.io";
const API_TIMEOUT_MS = 5000;
const BAN_ARCHIVE_KEY = "vortex07BanArchive";
const BAN_ARCHIVE_MAX = 1000;
const REPUTATION_VOTER_KEY = "vortex07VoterId";
const REPUTATION_MY_VOTES_KEY = "vortex07MyReputationVotes";
const REPUTATION_CACHE_KEY = "vortex07ReputationCache";
const REPUTATION_PENDING_KEY = "vortex07ReputationPending";
const COMMUNITY_REPUTATION_API = "https://vortex07.vercel.app/api";

const defaultSettings = {
  enabled: true,
  customNav: true,
  classicFooter: true,
  retroButtons: true,
  userSearch: true,
  banArchive: true,
  reputation: true,
  reputationApiUrl: "",
  debugLogs: false,
  themePreset: "classic",
};

let currentSettings = { ...defaultSettings };
let is2007Applied = false;
let bodyContainer = null;
let pageObserverStarted = false;
let layoutGuardStarted = false;
let searchDebounceTimer = null;
let lastSearchQuery = "";
let documentClickAttached = false;
let searchPositionListenersAttached = false;
let searchInputRef = null;
let searchHostRef = null;

const avatarMemoryCache = new Map();

const hideStyle = document.createElement("style");
hideStyle.id = "vortex-2007-hide";
hideStyle.textContent = "body { opacity: 0; }";
(document.head || document.documentElement).appendChild(hideStyle);

setTimeout(() => {
  // Failsafe: never leave the site hidden if the extension misses the layout target.
  revealBody();
}, 3000);

/* ========================================================= */
/* ================= LOGGING =============================== */
/* ========================================================= */

function logDebug(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][DEBUG]", ...args);
}

function logApi(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][API]", ...args);
}

function logSearch(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][SEARCH]", ...args);
}

function logAvatar(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][AVATAR]", ...args);
}

function logBanned(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][BANNED]", ...args);
}

function logArchive(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][ARCHIVE]", ...args);
}

function logRep(...args) {
  if (currentSettings.debugLogs) console.log("[Vortex07][REP]", ...args);
}

function logWarn(...args) {
  if (currentSettings.debugLogs) console.warn("[Vortex07][WARN]", ...args);
}

function logError(...args) {
  console.error("[Vortex07][ERROR]", ...args);
}

/* ========================================================= */
/* ================= HELPERS =============================== */
/* ========================================================= */

function revealBody() {
  document.getElementById("vortex-2007-hide")?.remove();
  if (document.body) {
    document.body.style.visibility = "visible";
    document.body.style.opacity = "1";
  }
}

function normalizeSettings(settings) {
  return { ...defaultSettings, ...(settings || {}) };
}

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeString(value) {
  return String(value || "").trim();
}

function safeLower(value) {
  return safeString(value).toLowerCase();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightMatch(text, query) {
  const cleanText = escapeHtml(text);
  const cleanQuery = safeString(query);

  if (!cleanQuery) return cleanText;

  const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "ig");

  return cleanText.replace(
    regex,
    '<span class="vortex07-search-highlight">$1</span>',
  );
}

function safeImageSrc(value, fallback = "") {
  const src = safeString(value);
  if (!src) return fallback;
  if (src.startsWith("data:image/")) return src;
  if (src.startsWith("https://")) return src;
  if (src.startsWith("http://")) return src;
  if (src.startsWith("/")) return `${VORTEX_ORIGIN}${src}`;
  return fallback;
}

function storageGet(area, defaults) {
  return new Promise((resolve) => {
    try {
      if (!ext.storage || !ext.storage[area]) {
        logWarn(`storage.${area} unavailable`);
        resolve(defaults);
        return;
      }

      ext.storage[area].get(defaults, (data) => {
        const err = ext.runtime?.lastError;
        if (err) {
          logWarn(`storage.${area}.get failed:`, err.message);
          resolve(defaults);
          return;
        }
        resolve(data || defaults);
      });
    } catch (err) {
      logWarn(`storage.${area}.get exception:`, err);
      resolve(defaults);
    }
  });
}

function storageSet(area, payload) {
  return new Promise((resolve) => {
    try {
      if (!ext.storage || !ext.storage[area]) {
        logWarn(`storage.${area} unavailable`);
        resolve();
        return;
      }

      ext.storage[area].set(payload, () => {
        const err = ext.runtime?.lastError;
        if (err) logWarn(`storage.${area}.set failed:`, err.message);
        resolve();
      });
    } catch (err) {
      logWarn(`storage.${area}.set exception:`, err);
      resolve();
    }
  });
}

function isElementInDocument(el) {
  return Boolean(el && document.documentElement.contains(el));
}

function isInsideVortexShell(el) {
  const container = document.getElementById("Container");
  return Boolean(container && el && container.contains(el));
}

/* ========================================================= */
/* ================= HOVER PREVIEW ========================= */
/* ========================================================= */

let hoverX = 0;
let hoverY = 0;
let hoverLoopStarted = false;

function createHoverPreview() {
  let preview = document.getElementById("vortex07-hover-preview");

  if (!preview) {
    preview = document.createElement("div");
    preview.id = "vortex07-hover-preview";

    preview.style.position = "fixed";
    preview.style.zIndex = "2147483647";
    preview.style.border = "1px solid #808080";
    preview.style.background = "#ece9d8";
    preview.style.padding = "4px";
    preview.style.width = "120px";
    preview.style.fontFamily = "Tahoma, Arial, Verdana, sans-serif";
    preview.style.fontSize = "11px";
    preview.style.color = "#000";
    preview.style.boxSizing = "border-box";
    preview.style.boxShadow = "none";
    preview.style.borderRadius = "0";
    preview.style.pointerEvents = "none";

    preview.style.display = "none";
    preview.style.opacity = "1";

    (document.body || document.documentElement).appendChild(preview);
  }

  return preview;
}

function showHoverPreview(player, event) {
  const preview = createHoverPreview();
  clearElement(preview);

  const container = document.createElement("div");
  container.style.textAlign = "center";

  const avatarSrc = safeImageSrc(player.avatarUrl, "");

  if (avatarSrc) {
    const img = document.createElement("img");
    img.src = avatarSrc;
    img.alt = "";
    img.loading = "lazy";
    img.style.width = "48px";
    img.style.height = "48px";
    img.style.objectFit = "cover";
    img.style.border = "1px solid #999";
    img.style.background = "#fff";
    img.style.marginBottom = "4px";
    container.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.textContent = initial(player.username);
    fallback.style.width = "48px";
    fallback.style.height = "48px";
    fallback.style.lineHeight = "48px";
    fallback.style.margin = "0 auto 4px auto";
    fallback.style.border = "1px solid #999";
    fallback.style.background = avatarColor(player.username);
    fallback.style.fontWeight = "bold";
    fallback.style.fontSize = "16px";
    container.appendChild(fallback);
  }

  const name = document.createElement("div");
  name.textContent = player.displayName || player.username || "Unknown";
  name.style.fontWeight = "bold";
  name.style.lineHeight = "1.2";
  container.appendChild(name);

  const user = document.createElement("div");
  user.textContent = `@${player.username || "unknown"}`;
  user.style.fontSize = "10px";
  user.style.color = "#555";
  user.style.lineHeight = "1.2";
  container.appendChild(user);

  if (player.isBanned) {
    const banned = document.createElement("div");
    banned.textContent = "BANNED";
    banned.style.color = "#5a4a9a";
    banned.style.fontWeight = "bold";
    banned.style.marginTop = "3px";
    container.appendChild(banned);
  }

  preview.appendChild(container);

  hoverX = event.clientX;
  hoverY = event.clientY;

  preview.style.left = hoverX + 12 + "px";
  preview.style.top = hoverY + 12 + "px";
  preview.style.display = "block";
  preview.style.opacity = "1";
}

function moveHoverPreview(event) {
  hoverX = event.clientX;
  hoverY = event.clientY;

  const preview = document.getElementById("vortex07-hover-preview");
  if (!preview || preview.style.display === "none") return;

  preview.style.left = hoverX + 12 + "px";
  preview.style.top = hoverY + 12 + "px";
}

function hideHoverPreview() {
  const preview = document.getElementById("vortex07-hover-preview");
  if (!preview) return;
  preview.style.display = "none";
}

function startHoverLoop() {
  // Hover preview uses direct positioning — no smooth follow loop.
}

/* ========================================================= */
/* ================= BANNED DETECTION ====================== */
/* ========================================================= */

function readBooleanLike(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = safeLower(value);
  return [
    "true",
    "yes",
    "1",
    "banned",
    "terminated",
    "deleted",
    "restricted",
    "disabled",
    "suspended",
  ].includes(text);
}

function detectBannedStatus(rawPlayer) {
  const result = { isBanned: false, detectedBy: "", rawValue: null };
  if (!rawPlayer || typeof rawPlayer !== "object") return result;

  const directFields = [
    "isBanned",
    "banned",
    "is_banned",
    "isTerminated",
    "terminated",
    "is_terminated",
    "deleted",
    "isDeleted",
    "is_deleted",
    "restricted",
    "isRestricted",
    "is_restricted",
    "disabled",
    "isDisabled",
    "is_disabled",
    "suspended",
    "isSuspended",
    "is_suspended",
  ];

  for (const field of directFields) {
    if (Object.prototype.hasOwnProperty.call(rawPlayer, field)) {
      const value = rawPlayer[field];
      if (readBooleanLike(value)) {
        result.isBanned = true;
        result.detectedBy = field;
        result.rawValue = value;
        return result;
      }
    }
  }

  const statusFields = [
    "status",
    "accountStatus",
    "account_status",
    "moderationStatus",
    "moderation_status",
    "state",
  ];
  const bannedWords = [
    "banned",
    "ban",
    "terminated",
    "deleted",
    "restricted",
    "disabled",
    "moderated",
    "suspended",
  ];

  for (const field of statusFields) {
    if (Object.prototype.hasOwnProperty.call(rawPlayer, field)) {
      const value = rawPlayer[field];
      const text = safeLower(value);
      if (bannedWords.some((word) => text.includes(word))) {
        result.isBanned = true;
        result.detectedBy = field;
        result.rawValue = value;
        return result;
      }
    }
  }

  return result;
}

function logBannedCandidate(rawPlayer, normalizedPlayer, detection) {
  if (!currentSettings.debugLogs) return;

  const id =
    normalizedPlayer?.id ??
    rawPlayer?.id ??
    rawPlayer?.userId ??
    rawPlayer?.user_id ??
    "unknown";
  const username =
    normalizedPlayer?.username ??
    rawPlayer?.username ??
    rawPlayer?.name ??
    "unknown";

  if (detection?.isBanned) {
    logBanned("Detected banned user:", {
      id,
      username,
      detectedBy: detection.detectedBy,
      rawValue: detection.rawValue,
      normalized: normalizedPlayer,
      raw: rawPlayer,
    });
    return;
  }

  const visibleSignals = {};
  [
    "isBanned",
    "banned",
    "terminated",
    "deleted",
    "restricted",
    "disabled",
    "suspended",
    "status",
    "accountStatus",
    "moderationStatus",
    "state",
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(rawPlayer || {}, key))
      visibleSignals[key] = rawPlayer[key];
  });

  if (Object.keys(visibleSignals).length > 0) {
    logBanned("Ban-related fields found but user was not marked banned:", {
      id,
      username,
      fields: visibleSignals,
    });
  }
}

/* ========================================================= */
/* ================= BAN ARCHIVE =========================== */
/* Local termed-player registry — snapshots users on sight.  */
/* ========================================================= */

function playerMatchesArchiveQuery(entry, query) {
  const q = safeLower(query);
  if (!q || q.length < 2) return false;

  const username = safeLower(entry.username);
  const displayName = safeLower(entry.displayName || entry.username);

  return username.includes(q) || displayName.includes(q);
}

function archiveEntryFromPlayer(player, source) {
  const id = safeNumber(player.id);
  if (id === null) return null;

  const now = Date.now();
  const isBanned = Boolean(player.isBanned);

  return {
    id,
    username: safeString(player.username),
    displayName: safeString(player.displayName || player.username),
    avatarUrl: safeString(player.avatarUrl),
    isBanned,
    bannedAt: isBanned ? now : null,
    lastSeenAt: now,
    lastSeenSource: safeString(source) || "unknown",
    snapshotCount: 1,
  };
}

async function loadBanArchive() {
  const data = await storageGet("local", { [BAN_ARCHIVE_KEY]: {} });
  const archive = data[BAN_ARCHIVE_KEY];
  return archive && typeof archive === "object" ? archive : {};
}

async function saveBanArchive(archive) {
  await storageSet("local", { [BAN_ARCHIVE_KEY]: archive });
}

async function getBanArchiveCount() {
  const archive = await loadBanArchive();
  return Object.keys(archive).length;
}

function trimBanArchive(archive) {
  const entries = Object.values(archive);
  if (entries.length <= BAN_ARCHIVE_MAX) return archive;

  entries.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  const trimmed = {};

  entries.slice(0, BAN_ARCHIVE_MAX).forEach((entry) => {
    trimmed[String(entry.id)] = entry;
  });

  return trimmed;
}

async function snapshotPlayersToArchive(players, source) {
  if (!currentSettings.banArchive) return;
  if (!Array.isArray(players) || players.length === 0) return;

  const archive = await loadBanArchive();
  const now = Date.now();
  let changed = false;

  players.forEach((player) => {
    const id = safeNumber(player.id);
    const username = safeString(player.username);
    if (id === null || !username) return;

    const key = String(id);
    const incoming = archiveEntryFromPlayer(player, source);
    if (!incoming) return;

    const existing = archive[key];
    if (existing) {
      existing.username = incoming.username || existing.username;
      existing.displayName = incoming.displayName || existing.displayName;
      if (incoming.avatarUrl) existing.avatarUrl = incoming.avatarUrl;
      if (incoming.isBanned) {
        existing.isBanned = true;
        existing.bannedAt = existing.bannedAt || now;
      }
      existing.lastSeenAt = now;
      existing.lastSeenSource = source;
      existing.snapshotCount = (existing.snapshotCount || 0) + 1;
    } else {
      archive[key] = incoming;
    }

    changed = true;
  });

  if (!changed) return;

  await saveBanArchive(trimBanArchive(archive));
  logArchive(`Snapshotted ${players.length} player(s) from ${source}`);
}

async function markPlayerBannedInArchive(id, reason = "detected") {
  if (!currentSettings.banArchive) return;

  const numericId = safeNumber(id);
  if (numericId === null) return;

  const archive = await loadBanArchive();
  const key = String(numericId);
  const now = Date.now();

  if (archive[key]) {
    archive[key].isBanned = true;
    archive[key].bannedAt = archive[key].bannedAt || now;
    archive[key].lastSeenAt = now;
    archive[key].lastSeenSource = reason;
  }

  await saveBanArchive(archive);
  logArchive("Marked banned in archive:", numericId, reason);
}

async function searchBanArchive(query, excludeIds = new Set()) {
  if (!currentSettings.banArchive) return [];

  const archive = await loadBanArchive();
  const results = [];

  Object.values(archive).forEach((entry) => {
    if (!entry || safeNumber(entry.id) === null) return;
    if (excludeIds.has(Number(entry.id))) return;
    if (!playerMatchesArchiveQuery(entry, query)) return;

    results.push({
      id: entry.id,
      username: entry.username,
      displayName: entry.displayName || entry.username,
      avatarUrl: entry.avatarUrl || "",
      isBanned: Boolean(entry.isBanned),
      isArchived: true,
      lastSeenAt: entry.lastSeenAt || 0,
      archivedSource: entry.lastSeenSource || "archive",
    });
  });

  results.sort((a, b) => {
    if (a.isBanned !== b.isBanned) return a.isBanned ? -1 : 1;
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });

  return results.slice(0, 5);
}

function archivedPlayerToRow(player) {
  return {
    id: player.id,
    username: player.username,
    displayName: player.displayName || player.username,
    avatarUrl: player.avatarUrl || "",
    isBanned: Boolean(player.isBanned),
    isArchived: true,
    lastSeenAt: player.lastSeenAt || 0,
    archivedSource: player.archivedSource || "archive",
  };
}

async function seedBanArchiveFromHistory() {
  if (!currentSettings.banArchive) return;

  const data = await storageGet("local", {
    vortex07LastPlayerSearch: null,
    vortex07BanArchiveSeeded: false,
  });

  if (data.vortex07BanArchiveSeeded) return;

  const history = data.vortex07LastPlayerSearch;
  if (history?.players?.length) {
    await snapshotPlayersToArchive(history.players, "history");
  }

  await storageSet("local", { vortex07BanArchiveSeeded: true });
  logArchive("Seeded ban archive from search history");
}

function extractUserIdFromHref(href) {
  const match = safeString(href).match(/\/users\/(\d+)(?:\/|$)/i);
  return match ? safeNumber(match[1]) : null;
}

function snapshotProfilePageFromDom() {
  if (!currentSettings.banArchive) return;

  const id = extractUserIdFromHref(window.location.pathname);
  if (id === null) return;

  const username = safeString(
    document.querySelector(".profile-username")?.textContent,
  ).replace(/^@+/, "");
  if (!username) return;

  const avatarUrl = safeString(document.querySelector(".profile-avatar")?.src);

  snapshotPlayersToArchive(
    [
      {
        id,
        username,
        displayName: username,
        avatarUrl,
        isBanned: false,
      },
    ],
    "profile",
  );
}

function snapshotVisiblePlayersFromDom() {
  if (!currentSettings.banArchive) return;

  const players = [];
  const seen = new Set();

  document
    .querySelectorAll(
      'a[href*="/users/"], .friend-card, .user-card, .user-row',
    )
    .forEach((el) => {
      const link = el.tagName === "A" ? el : el.querySelector('a[href*="/users/"]');
      const href = link?.getAttribute("href") || el.getAttribute("href") || "";
      const id = extractUserIdFromHref(href);
      if (id === null || seen.has(id)) return;

      const nameEl =
        el.querySelector(".friend-name, .user-card-name, .user-row-name") ||
        link;
      const username = safeString(nameEl?.textContent).replace(/^@+/, "");
      if (!username) return;

      const avatarUrl = safeString(
        el.querySelector("img")?.src || link?.querySelector("img")?.src,
      );

      seen.add(id);
      players.push({
        id,
        username,
        displayName: username,
        avatarUrl,
        isBanned: false,
      });
    });

  if (players.length > 0) {
    snapshotPlayersToArchive(players, "page");
  }
}

function formatArchiveDate(timestamp) {
  const value = safeNumber(timestamp);
  if (value === null) return "unknown";

  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "unknown";
  }
}

/* ========================================================= */
/* ================= REPUTATION ============================ */
/* RoPro-style extension-only thumbs-up reputation system.   */
/* ========================================================= */

function getProfileUserIdFromPage() {
  return extractUserIdFromHref(window.location.pathname);
}

function getLoggedInUserIdFromNav() {
  const links = document.querySelectorAll(
    '.navbar-actions a[href*="/users/"], #Alerts a[href*="/users/"]',
  );

  for (const link of links) {
    const href = link.getAttribute("href") || "";
    if (!href.includes("/profile")) continue;
    const id = extractUserIdFromHref(href);
    if (id !== null) return id;
  }

  return null;
}

function getReputationApiBase() {
  const custom = safeString(currentSettings.reputationApiUrl).replace(/\/$/, "");
  if (custom) return custom;
  if (currentSettings.reputation) return COMMUNITY_REPUTATION_API;
  return "";
}

async function ensureVoterId() {
  const data = await storageGet("local", { [REPUTATION_VOTER_KEY]: "" });
  if (data[REPUTATION_VOTER_KEY]) return data[REPUTATION_VOTER_KEY];

  const voterId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `v${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  await storageSet("local", { [REPUTATION_VOTER_KEY]: voterId });
  return voterId;
}

async function loadMyReputationVotes() {
  const data = await storageGet("local", { [REPUTATION_MY_VOTES_KEY]: {} });
  const votes = data[REPUTATION_MY_VOTES_KEY];
  return votes && typeof votes === "object" ? votes : {};
}

async function saveMyReputationVote(userId) {
  const votes = await loadMyReputationVotes();
  votes[String(userId)] = Date.now();
  await storageSet("local", { [REPUTATION_MY_VOTES_KEY]: votes });
}

async function getCachedReputation(userId) {
  const data = await storageGet("local", { [REPUTATION_CACHE_KEY]: {} });
  const cache = data[REPUTATION_CACHE_KEY];
  return cache?.[String(userId)] || null;
}

async function cacheReputation(userId, count, hasVoted) {
  const data = await storageGet("local", { [REPUTATION_CACHE_KEY]: {} });
  const cache = data[REPUTATION_CACHE_KEY] || {};
  cache[String(userId)] = {
    count: Number(count) || 0,
    hasVoted: Boolean(hasVoted),
    cachedAt: Date.now(),
  };
  await storageSet("local", { [REPUTATION_CACHE_KEY]: cache });
}

async function fetchReputationStatus(userId) {
  const voterId = await ensureVoterId();
  const myVotes = await loadMyReputationVotes();
  const localHasVoted = Boolean(myVotes[String(userId)]);
  const apiBase = getReputationApiBase();

  if (!apiBase) {
    return {
      count: localHasVoted ? 1 : 0,
      hasVoted: localHasVoted,
      synced: false,
      localOnly: true,
    };
  }

  try {
    const url = `${apiBase}/reputation?userId=${encodeURIComponent(userId)}&voterId=${encodeURIComponent(voterId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const count = Number(json.count) || 0;
    const hasVoted = Boolean(json.hasVoted) || localHasVoted;

    await cacheReputation(userId, count, hasVoted);
    logRep("Fetched reputation:", { userId, count, hasVoted });

    return { count, hasVoted, synced: true, localOnly: false };
  } catch (err) {
    logWarn("Reputation fetch failed:", err);
    const cached = await getCachedReputation(userId);
    if (cached) {
      return {
        count: cached.count,
        hasVoted: cached.hasVoted || localHasVoted,
        synced: false,
        localOnly: false,
      };
    }

    return {
      count: localHasVoted ? 1 : 0,
      hasVoted: localHasVoted,
      synced: false,
      localOnly: true,
    };
  }
}

async function giveReputation(userId) {
  const numericId = safeNumber(userId);
  if (numericId === null) return { ok: false, reason: "invalid-user" };

  const loggedInId = getLoggedInUserIdFromNav();
  if (loggedInId !== null && loggedInId === numericId) {
    return { ok: false, reason: "self" };
  }

  const myVotes = await loadMyReputationVotes();
  if (myVotes[String(numericId)]) {
    return { ok: false, reason: "already-voted" };
  }

  const voterId = await ensureVoterId();
  const apiBase = getReputationApiBase();

  if (apiBase) {
    try {
      const response = await fetch(`${apiBase}/reputation`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: numericId, voterId }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      await saveMyReputationVote(numericId);
      await cacheReputation(numericId, json.count, true);
      logRep("Gave reputation (synced):", numericId, json.count);

      return {
        ok: true,
        count: Number(json.count) || 0,
        hasVoted: true,
        synced: true,
      };
    } catch (err) {
      logWarn("Reputation POST failed:", err);
      await queuePendingReputationVote(numericId);
    }
  } else {
    await queuePendingReputationVote(numericId);
  }

  await saveMyReputationVote(numericId);
  const cached = await getCachedReputation(numericId);
  const count = (Number(cached?.count) || 0) + 1;
  await cacheReputation(numericId, count, true);
  logRep("Gave reputation (queued/local):", numericId, count);

  return {
    ok: true,
    count,
    hasVoted: true,
    synced: false,
    localOnly: true,
  };
}

function updateReputationPanel(panel, status) {
  const countEl = panel.querySelector(".vortex07-rep-count");
  const btn = panel.querySelector(".vortex07-rep-btn");
  const noteEl = panel.querySelector(".vortex07-reputation-note");

  if (countEl) countEl.textContent = String(status.count ?? 0);

  if (btn) {
    btn.disabled = Boolean(status.hasVoted);
    btn.textContent = status.hasVoted ? "Rep given" : "Give Rep";
    btn.classList.toggle("vortex07-rep-btn-done", Boolean(status.hasVoted));
  }

  if (noteEl) {
    if (status.synced) {
      noteEl.textContent = "Global · Vortex07 users";
    } else if (status.localOnly) {
      noteEl.textContent = "Syncing… (global rep network)";
    } else {
      noteEl.textContent = "Cached global counts";
    }
  }
}

async function refreshReputationPanel(panel, userId) {
  const status = await fetchReputationStatus(userId);
  updateReputationPanel(panel, status);
  return status;
}

function injectReputationWidget() {
  if (!currentSettings.reputation) return;

  const userId = getProfileUserIdFromPage();
  if (userId === null) return;

  const header = document.querySelector(".profile-header");
  if (!header) return;

  let panel = header.querySelector(".vortex07-reputation-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "vortex07-reputation-panel";
    panel.dataset.vortex07UserId = String(userId);

    panel.innerHTML = `
      <div class="vortex07-reputation-title">Reputation</div>
      <div class="vortex07-reputation-body">
        <span class="vortex07-rep-thumb" aria-hidden="true">&#128077;</span>
        <span class="vortex07-rep-count">0</span>
      </div>
      <button type="button" class="vortex07-rep-btn rbx-2007-btn">Give Rep</button>
      <div class="vortex07-reputation-note">Global · Vortex07 users</div>
    `;

    const btn = panel.querySelector(".vortex07-rep-btn");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "...";

      const result = await giveReputation(userId);
      if (result.ok) {
        updateReputationPanel(panel, {
          count: result.count,
          hasVoted: true,
          synced: result.synced,
          localOnly: result.localOnly,
        });
      } else if (result.reason === "self") {
        btn.textContent = "Can't self-rep";
        btn.disabled = true;
      } else if (result.reason === "already-voted") {
        await refreshReputationPanel(panel, userId);
      } else {
        btn.disabled = false;
        btn.textContent = "Give Rep";
      }
    });

    header.appendChild(panel);
  } else if (panel.dataset.vortex07UserId !== String(userId)) {
    panel.dataset.vortex07UserId = String(userId);
  }

  refreshReputationPanel(panel, userId);
}

async function fetchReputationCountsBulk(userIds) {
  const apiBase = getReputationApiBase();
  const ids = [...new Set(userIds.map((id) => safeNumber(id)).filter(Boolean))];
  if (!apiBase || ids.length === 0) return new Map();

  try {
    const voterId = await ensureVoterId();
    const url = `${apiBase}/reputation?ids=${encodeURIComponent(ids.join(","))}&voterId=${encodeURIComponent(voterId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const map = new Map();
    const rows = json?.results || json?.counts || json;

    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        const id = safeNumber(row.userId ?? row.id);
        if (id === null) return;
        map.set(id, {
          count: Number(row.count) || 0,
          hasVoted: Boolean(row.hasVoted),
        });
        cacheReputation(id, row.count, row.hasVoted);
      });
    } else if (rows && typeof rows === "object") {
      Object.entries(rows).forEach(([key, value]) => {
        const id = safeNumber(key);
        if (id === null) return;
        const count = typeof value === "object" ? value.count : value;
        const hasVoted =
          typeof value === "object" ? Boolean(value.hasVoted) : false;
        map.set(id, { count: Number(count) || 0, hasVoted });
        cacheReputation(id, count, hasVoted);
      });
    }

    return map;
  } catch (err) {
    logWarn("Bulk reputation fetch failed:", err);
    const map = new Map();
    for (const id of ids) {
      const cached = await getCachedReputation(id);
      if (cached) {
        map.set(id, { count: cached.count, hasVoted: cached.hasVoted });
      }
    }
    return map;
  }
}

async function syncPendingReputationVotes() {
  const apiBase = getReputationApiBase();
  if (!apiBase) return;

  const data = await storageGet("local", { [REPUTATION_PENDING_KEY]: [] });
  const pending = Array.isArray(data[REPUTATION_PENDING_KEY])
    ? data[REPUTATION_PENDING_KEY]
    : [];
  if (pending.length === 0) return;

  const voterId = await ensureVoterId();
  const remaining = [];

  for (const userId of pending) {
    try {
      const response = await fetch(`${apiBase}/reputation`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, voterId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      await cacheReputation(userId, json.count, true);
    } catch {
      remaining.push(userId);
    }
  }

  await storageSet("local", { [REPUTATION_PENDING_KEY]: remaining });
}

async function queuePendingReputationVote(userId) {
  const data = await storageGet("local", { [REPUTATION_PENDING_KEY]: [] });
  const pending = Array.isArray(data[REPUTATION_PENDING_KEY])
    ? data[REPUTATION_PENDING_KEY]
    : [];
  if (!pending.includes(Number(userId))) pending.push(Number(userId));
  await storageSet("local", { [REPUTATION_PENDING_KEY]: pending });
}

function getUserIdFromRepNode(node) {
  if (!node) return null;
  if (node.dataset?.vortex07UserId) return safeNumber(node.dataset.vortex07UserId);
  const href =
    node.getAttribute("href") ||
    node.querySelector("a[href*='/users/']")?.getAttribute("href") ||
    "";
  return extractUserIdFromHref(href);
}

function decorateGlobalRepBadge(parentEl, userId, count) {
  if (!currentSettings.reputation || !parentEl) return;
  const numeric = safeNumber(userId);
  if (numeric === null) return;

  let badge = parentEl.querySelector(".vortex07-global-rep");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "vortex07-global-rep";
    badge.title = "Vortex07 global reputation";
    parentEl.appendChild(badge);
  }

  badge.textContent = `\u{1F44D} ${Number(count) || 0}`;
}

async function applyGlobalRepBadges(root = document) {
  if (!currentSettings.reputation) return;

  const nodes = root.querySelectorAll(
    ".friend-card, .vortex07-player-result, .user-row",
  );
  if (nodes.length === 0) return;

  const ids = [];
  nodes.forEach((node) => {
    const id = getUserIdFromRepNode(node);
    if (id !== null) ids.push(id);
  });

  const repMap = await fetchReputationCountsBulk(ids);
  nodes.forEach((node) => {
    const id = getUserIdFromRepNode(node);
    if (id === null) return;
    const rep = repMap.get(id);
    const cached = rep || null;
    decorateGlobalRepBadge(
      node,
      id,
      cached ? cached.count : 0,
    );
  });
}

let globalRepScheduled = false;

function scheduleGlobalRepBadges(root = document) {
  if (globalRepScheduled || !currentSettings.reputation) return;
  globalRepScheduled = true;

  requestAnimationFrame(async () => {
    globalRepScheduled = false;
    await applyGlobalRepBadges(root);
  });
}

function normalizeProfileLayout() {
  const header = document.querySelector(".profile-header");
  if (!header) return;

  header.classList.add("vortex07-profile-header");

  const avatarWrap = header.querySelector(".profile-avatar-wrap");
  if (avatarWrap) avatarWrap.classList.add("vortex07-profile-avatar-slot");

  const avatar = header.querySelector(".profile-avatar");
  if (avatar) {
    avatar.style.width = "100px";
    avatar.style.height = "100px";
    avatar.style.maxWidth = "100px";
    avatar.style.maxHeight = "100px";
    avatar.style.objectFit = "contain";
  }
}

function normalizeOnlineIndicators() {
  document
    .querySelectorAll(
      ".friend-card, .profile-header, .user-row, .user-card",
    )
    .forEach((card) => {
      const indicators = card.querySelectorAll(
        ".status-dot, [class*='online-status'], [class*='status-indicator'], [data-online], [data-status]",
      );

      indicators.forEach((el) => {
        if (el.closest(".vortex07-reputation-panel")) return;
        if (el.matches("a, button, input, select, textarea")) return;

        el.classList.add("vortex07-status-pill");

        const text = safeLower(
          el.textContent ||
            el.getAttribute("data-status") ||
            el.getAttribute("data-online") ||
            el.className,
        );

        const isOnline =
          text.includes("online") ||
          text.includes("in-game") ||
          text.includes("ingame") ||
          el.classList.contains("online") ||
          el.getAttribute("data-online") === "true" ||
          el.getAttribute("data-status") === "online";

        const isOffline =
          text.includes("offline") ||
          el.classList.contains("offline") ||
          el.getAttribute("data-status") === "offline";

        el.classList.toggle("vortex07-status-online", isOnline);
        el.classList.toggle("vortex07-status-offline", isOffline && !isOnline);
      });
    });
}

/* ========================================================= */
/* ================= API SUBSYSTEM ========================= */
/* ========================================================= */

const vortexApi = {
  async get(path, params = {}) {
    const url = new URL(path, VORTEX_ORIGIN);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    logApi("GET", url.pathname + url.search);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      logApi(`${url.pathname} status:`, response.status);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      logApi(`${url.pathname} response:`, json);
      return json;
    } catch (err) {
      if (err.name === "AbortError") logWarn(`API timeout: ${url.pathname}`);
      else logWarn(`API failed: ${url.pathname}`, err);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

function normalizePlayer(rawPlayer) {
  if (!rawPlayer || typeof rawPlayer !== "object") return null;

  const id = safeNumber(rawPlayer.id ?? rawPlayer.userId ?? rawPlayer.user_id);
  if (id === null) return null;

  const username = safeString(
    rawPlayer.username ||
      rawPlayer.name ||
      rawPlayer.userName ||
      rawPlayer.user_name,
  );
  const displayName = safeString(
    rawPlayer.displayName ||
      rawPlayer.display_name ||
      rawPlayer.nickname ||
      username,
  );
  if (!username) return null;

  const detection = detectBannedStatus(rawPlayer);
  const player = {
    id,
    username,
    displayName: displayName || username,
    isBanned: detection.isBanned,
    bannedDetectedBy: detection.detectedBy,
    bannedRawValue: detection.rawValue,
    avatarUrl: "",
  };

  logBannedCandidate(rawPlayer, player, detection);
  return player;
}

function normalizeAvatarMap(rawAvatarResponse) {
  const avatarMap = new Map();
  if (!rawAvatarResponse || typeof rawAvatarResponse !== "object")
    return avatarMap;

  Object.entries(rawAvatarResponse).forEach(([id, value]) => {
    const numericId = Number(id);
    const avatarUrl = safeString(value);
    if (!Number.isFinite(numericId) || !avatarUrl) return;
    avatarMap.set(numericId, avatarUrl);
  });

  return avatarMap;
}

/* ========================================================= */
/* ================= INIT ================================== */
/* ========================================================= */

async function initVortex07() {
  logDebug("Starting Vortex07", VORTEX07_VERSION);

  const data = await storageGet("sync", { vortex07Settings: defaultSettings });
  currentSettings = normalizeSettings(data.vortex07Settings);
  logDebug("Loaded settings:", currentSettings);

  if (!currentSettings.enabled) {
    revealBody();
    return;
  }

  startHoverLoop();
  await seedBanArchiveFromHistory();
  if (currentSettings.reputation) await syncPendingReputationVotes();
  startObserver();
}

if (ext.storage?.onChanged) {
  ext.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync" || !changes.vortex07Settings) return;

    const oldSettings = currentSettings;
    const newSettings = normalizeSettings(changes.vortex07Settings.newValue);

    currentSettings = newSettings;

    logDebug("Settings changed:", currentSettings);

    const enabledChanged = oldSettings.enabled !== newSettings.enabled;
    const navChanged = oldSettings.customNav !== newSettings.customNav;

    if (enabledChanged || navChanged) {
      location.reload();
      return;
    }

    updateFooterState();
    updateRetroButtonState();

    if (currentSettings.userSearch) ensureSearchSystem();
    else removeUserSearch();
  });
}

/* ========================================================= */
/* ================= LAYOUT ================================ */
/* ========================================================= */

function build2007Layout() {
  if (is2007Applied || !currentSettings.enabled) return;

  if (document.querySelector(".wrap")) {
    is2007Applied = true;
    revealBody();
    ensureSearchSystem();
    return;
  }

  const navbar = document.querySelector(".navbar");
  let mainContent =
    document.querySelector(".page") ||
    document.querySelector(".catalog-container");
  if (!navbar) return;

  if (window.location.pathname === "/download" && !mainContent) {
    const dlContent = document.querySelectorAll(
      ".dl-hero, .dl-cards, .dl-footer-note",
    );
    if (dlContent.length > 0) {
      mainContent = document.createElement("div");
      mainContent.className = "page";
      dlContent.forEach((el) => mainContent.appendChild(el));
    }
  }

  if (!mainContent) return;

  is2007Applied = true;
  revealBody();

  const logoLink = document.querySelector(".navbar-logo");
  const navActions = document.querySelector(".navbar-actions");
  const siteFooter = document.querySelector(".site-footer");

  if (navActions && currentSettings.customNav) rebuildNavigation(navActions);
  else if (navActions) softenNavigation(navActions);

  if (logoLink) {
    logoLink.textContent = "";
    const img = document.createElement("img");
    img.src = ext.runtime.getURL("Assets/logo.png");
    img.alt = "Vortex";
    img.border = "0";
    img.style.height = "44px";
    logoLink.appendChild(img);
  }

  const container = document.createElement("div");
  container.id = "Container";

  const header = createHeader();
  if (logoLink) header.logoSlot.appendChild(logoLink);
  ensureSearchSystem();
  if (navActions) header.navigationSlot.appendChild(navActions);

  container.appendChild(header.headerEl);

  bodyContainer = document.createElement("div");
  bodyContainer.id = "Body";
  bodyContainer.appendChild(mainContent);
  container.appendChild(bodyContainer);

  if (currentSettings.classicFooter)
    container.appendChild(createClassicFooter());

  document.body.insertBefore(container, document.body.firstChild);
  navbar.style.display = "none";
  if (siteFooter) siteFooter.style.display = "none";

  updateRetroButtonState();
  enhanceLegacyStatusLabels();
  flattenCarousels();
  compressHeroSections();
  normalizeFriendTiles();
  normalizeProfileLayout();
  normalizeOnlineIndicators();
  snapshotProfilePageFromDom();
  snapshotVisiblePlayersFromDom();
  injectReputationWidget();
  scheduleGlobalRepBadges();
  ensureSearchSystem();
  startLayoutGuard();

  logDebug("2007 layout applied");
}

function rebuildNavigation(navActions) {
  const navItems = [];

  Array.from(navActions.children).forEach((link) => {
    if (!link || !link.tagName) return;
    if (link.classList?.contains("Separator")) return;

    if (link.tagName === "A" || link.tagName === "BUTTON") {
      link.className = "MenuItem vortex07-nav-tab";
      link.style.background = "none";
      link.style.border = "none";
      link.style.flex = "1 1 0";
      link.style.width = "0";
      link.style.textAlign = "center";
    }

    navItems.push(link);
  });

  navActions.textContent = "";
  navActions.classList.add("vortex07-nav-actions");
  navActions.classList.remove("vortex07-nav-split");

  navItems.forEach((link) => navActions.appendChild(link));
}

function softenNavigation(navActions) {
  navActions.classList.remove("vortex07-nav-actions");

  Array.from(navActions.children).forEach((link, index) => {
    if (
      index > 0 &&
      !link.previousElementSibling?.classList?.contains("Separator")
    ) {
      const sep = document.createElement("span");
      sep.className = "Separator";
      sep.textContent = " | ";
      navActions.insertBefore(sep, link);
    }

    if (link.tagName === "A" || link.tagName === "BUTTON") {
      link.className = "MenuItem";
      link.style.background = "none";
      link.style.border = "none";
    }
  });
}

function createHeader() {
  const headerEl = document.createElement("div");
  headerEl.id = "Header";

  const banner = document.createElement("div");
  banner.id = "Banner";

  const options = document.createElement("div");
  options.id = "Options";

  const auth = document.createElement("div");
  auth.id = "Authentication";

  const welcome = document.createElement("span");
  welcome.textContent = "Welcome to Vortex";

  auth.appendChild(welcome);
  options.appendChild(auth);

  const logoSlot = document.createElement("div");
  logoSlot.id = "Logo";

  const alertsSlot = document.createElement("div");
  alertsSlot.id = "Alerts";

  banner.appendChild(options);
  banner.appendChild(logoSlot);
  banner.appendChild(alertsSlot);

  const navigationSlot = document.createElement("div");
  navigationSlot.className = "Navigation";

  headerEl.appendChild(banner);
  headerEl.appendChild(navigationSlot);

  return { headerEl, logoSlot, alertsSlot, navigationSlot };
}

function appendNavItem(parent, link) {
  if (parent.children.length > 0) {
    const sep = document.createElement("span");
    sep.className = "Separator";
    sep.textContent = " | ";
    parent.appendChild(sep);
  }
  parent.appendChild(link);
}

function createClassicFooter() {
  const footerDiv = document.createElement("div");
  footerDiv.id = "Footer";

  const hr = document.createElement("hr");
  const legal = document.createElement("p");
  legal.className = "Legalese";

  appendText(
    legal,
    'Vortex, "Online Building Toy", characters, logos, names, and all related indicia are trademarks of ',
  );
  appendFooterLink(legal, "Vortex Corporation", "javascript:void(0);");
  appendText(legal, ", ©2007. Patents pending.");
  legal.appendChild(document.createElement("br"));

  appendText(
    legal,
    "Vortex Corp. is not affliated with Lego, MegaBloks, Bionicle, Pokemon, Nintendo, Lincoln Logs, Yu Gi Oh, K'nex, Tinkertoys, Erector Set, or the Pirates of the Caribbean. ARrrr!",
  );
  legal.appendChild(document.createElement("br"));

  appendText(legal, "Use of this site signifies your acceptance of the ");
  appendFooterLink(legal, "Terms and Conditions", "/terms");
  appendText(legal, ".");
  legal.appendChild(document.createElement("br"));

  appendFooterLink(legal, "Privacy Policy", "/privacy");
  appendText(legal, " | ");
  appendFooterLink(legal, "Contact Us", "javascript:void(0);");
  appendText(legal, " | ");
  appendFooterLink(legal, "About Us", "javascript:void(0);");
  appendText(legal, " | ");
  appendFooterLink(legal, "Jobs", "javascript:void(0);");

  footerDiv.appendChild(hr);
  footerDiv.appendChild(legal);
  return footerDiv;
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

function appendFooterLink(parent, text, href) {
  const link = document.createElement("a");
  link.textContent = text;
  link.href = href;
  parent.appendChild(link);
}

function updateFooterState() {
  const footerDiv = document.getElementById("Footer");
  const container = document.getElementById("Container");

  if (!currentSettings.classicFooter && footerDiv) footerDiv.remove();
  else if (currentSettings.classicFooter && !footerDiv && container)
    container.appendChild(createClassicFooter());
}

function updateRetroButtonState() {
  if (currentSettings.retroButtons) {
    document
      .querySelectorAll(
        ".btn-primary, .btn-secondary, .btn-play, .Button, .btn, button",
      )
      .forEach((btn) => btn.classList.add("rbx-2007-btn"));
  } else {
    document
      .querySelectorAll(".rbx-2007-btn")
      .forEach((btn) => btn.classList.remove("rbx-2007-btn"));
  }
}

function startLayoutGuard() {
  if (layoutGuardStarted) return;
  layoutGuardStarted = true;
  let scheduled = false;

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      const mainContent =
        document.querySelector(".page") ||
        document.querySelector(".catalog-container");

      if (
        mainContent &&
        bodyContainer &&
        isElementInDocument(bodyContainer) &&
        mainContent.parentNode !== bodyContainer &&
        !isInsideVortexShell(mainContent)
      ) {
        bodyContainer.appendChild(mainContent);
      }

      const navbar = document.querySelector(".navbar");
      if (navbar && navbar.style.display !== "none")
        navbar.style.display = "none";

      const footer = document.querySelector(".site-footer");
      if (footer && footer.style.display !== "none")
        footer.style.display = "none";

      updateFooterState();
      updateRetroButtonState();
      enhanceLegacyStatusLabels();
      flattenCarousels();
      compressHeroSections();
      normalizeFriendTiles();
      normalizeProfileLayout();
      normalizeOnlineIndicators();
      snapshotProfilePageFromDom();
      snapshotVisiblePlayersFromDom();
      injectReputationWidget();
      scheduleGlobalRepBadges();
      ensureSearchSystem();

      if (currentSettings.userSearch) {
        updateResultsBoxPosition();
      }
    });
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function startObserver() {
  if (pageObserverStarted) return;
  pageObserverStarted = true;

  const observer = new MutationObserver(() => build2007Layout());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  build2007Layout();
  logDebug("Page observer started");
}

/* ========================================================= */
/* ================= SEARCH ================================ */
/* ========================================================= */

function findSearchHost() {
  const alerts = document.getElementById("Alerts");

  return (
    (alerts &&
      (alerts.querySelector("#vortex07-search-form") ||
        alerts.querySelector("#search-form") ||
        alerts.querySelector(".navbar-search") ||
        alerts.querySelector(".vortex07-search-host"))) ||
    document.getElementById("vortex07-search-form") ||
    document.getElementById("search-form") ||
    document.querySelector(".navbar-search") ||
    document.querySelector(".navbar #search-form") ||
    document.querySelector(".navbar .navbar-search")
  );
}

function findSearchInput() {
  const host = findSearchHost();

  return (
    document.getElementById("vortex07-search-input") ||
    document.querySelector("#Alerts #vortex07-search-input") ||
    document.querySelector("#Alerts #search-form input") ||
    document.querySelector("#Alerts .navbar-search input") ||
    host?.querySelector('input[type="search"]') ||
    host?.querySelector('input[name="q"]') ||
    host?.querySelector('input[type="text"]') ||
    document.querySelector(".navbar-search input") ||
    document.querySelector('input[type="search"]') ||
    document.querySelector('input[name="q"]')
  );
}

function findSearchButton(host = findSearchHost()) {
  if (!host) return null;

  return (
    host.querySelector(".vortex07-search-go") ||
    host.querySelector('button[type="submit"]') ||
    host.querySelector("button")
  );
}

function moveSearchToAlerts() {
  const alerts = document.getElementById("Alerts");
  if (!alerts) return;

  const host = findSearchHost();
  if (host && !alerts.contains(host)) {
    alerts.appendChild(host);
    logSearch("Moved search host into #Alerts");
  }
}

function buildVortex07SearchHost() {
  const form = document.createElement("form");
  form.id = "vortex07-search-form";
  form.className = "vortex07-search-host";
  form.setAttribute("autocomplete", "off");
  form.noValidate = true;

  const input = document.createElement("input");
  input.type = "text";
  input.name = "q";
  input.id = "vortex07-search-input";
  input.placeholder = "Search players / termed archive...";
  input.setAttribute("aria-label", "Search players and termed archive");

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "vortex07-search-go rbx-2007-btn";
  button.textContent = "Search";

  form.appendChild(input);
  form.appendChild(button);
  return form;
}

function ensureSearchSystem() {
  if (!currentSettings.userSearch) return;

  const alerts = document.getElementById("Alerts");
  if (!alerts) return;

  let host = findSearchHost();

  if (!host) {
    host = buildVortex07SearchHost();
    alerts.appendChild(host);
    logSearch("Injected Vortex07 search host into #Alerts");
  } else if (!alerts.contains(host)) {
    alerts.appendChild(host);
    logSearch("Relocated search host into #Alerts");
  }

  host.classList.add("vortex07-search-host");

  const button = findSearchButton(host);
  if (button) {
    button.classList.add("vortex07-search-go", "rbx-2007-btn");
    if (!button.textContent.trim()) button.textContent = "Search";
  }

  searchHostRef = host;
  enhanceUserSearch();
  updateSearchPlaceholder();
}

function isInsideSearchUi(target) {
  if (!target || !target.closest) return false;

  return Boolean(
    target.closest(
      "#Alerts, .vortex07-search-host, #search-form, #vortex07-search-form, .navbar-search, #vortex07-user-results, #vortex07-hover-preview",
    ),
  );
}

function updateSearchPlaceholder() {
  const input = findSearchInput();
  if (!input) return;

  input.placeholder = "Search players / termed archive...";
  input.setAttribute("aria-label", "Search players and termed archive");
}

function showResultsBox() {
  const box = getOrCreateResultsBox();
  if (!box) return;

  box.hidden = false;
  box.classList.add("vortex07-results-open");
  box.style.setProperty("display", "block", "important");
  box.style.setProperty("visibility", "visible", "important");
  box.style.setProperty("pointer-events", "auto", "important");
  updateResultsBoxPosition();
}

function hideResultsBox() {
  const box = document.getElementById("vortex07-user-results");
  if (!box) return;

  box.hidden = true;
  box.classList.remove("vortex07-results-open");
  box.style.setProperty("display", "none", "important");
  hideHoverPreview();
}

function getOrCreateResultsBox() {
  let resultsBox = document.getElementById("vortex07-user-results");

  if (!resultsBox) {
    resultsBox = document.createElement("div");
    resultsBox.id = "vortex07-user-results";
    resultsBox.className = "vortex07-user-results";
    resultsBox.hidden = true;
    document.body.appendChild(resultsBox);
    logSearch("Created search results box on document.body");
  } else if (resultsBox.parentNode !== document.body) {
    document.body.appendChild(resultsBox);
    logSearch("Moved search results box to document.body");
  }

  resultsBox.style.setProperty("position", "fixed", "important");
  resultsBox.style.setProperty("right", "auto", "important");
  resultsBox.style.setProperty("z-index", "2147483647", "important");
  resultsBox.style.setProperty("overflow", "visible", "important");

  return resultsBox;
}

function updateResultsBoxPosition() {
  const input = findSearchInput();
  const box = document.getElementById("vortex07-user-results");
  if (!input || !box || box.hidden) return;

  const rect = input.getBoundingClientRect();
  const width = 260;

  box.style.setProperty("position", "fixed", "important");
  box.style.setProperty("top", `${Math.round(rect.bottom + 2)}px`, "important");
  box.style.setProperty("left", `${Math.round(rect.left)}px`, "important");
  box.style.setProperty("width", `${width}px`, "important");
  box.style.setProperty("min-width", `${width}px`, "important");
  box.style.setProperty("right", "auto", "important");
  box.style.setProperty("z-index", "2147483647", "important");
  box.style.setProperty("overflow", "visible", "important");
  box.style.setProperty("display", "block", "important");

  logSearch("Positioned search results box:", {
    top: box.style.top,
    left: box.style.left,
    width: box.style.width,
  });
}

function attachSearchPositionListeners() {
  if (searchPositionListenersAttached) return;
  searchPositionListenersAttached = true;

  window.addEventListener("scroll", () => updateResultsBoxPosition(), true);
  window.addEventListener("resize", () => updateResultsBoxPosition());
}

function runPlayerSearchFromUi() {
  const input = findSearchInput();
  if (!input) return;

  const query = input.value.trim();
  if (query.length < 2) {
    clearSearchResults();
    return;
  }

  searchPlayers(query);
}

function bindSearchHost(host, input) {
  if (!host || !input) return;

  host.classList.add("vortex07-search-host");

  if (!host.dataset.vortex07SubmitEnhanced) {
    host.dataset.vortex07SubmitEnhanced = "true";
    host.addEventListener("submit", (event) => {
      event.preventDefault();
      runPlayerSearchFromUi();
    });
  }

  const button = findSearchButton(host);
  if (button) {
    button.type = "submit";
    button.classList.add("vortex07-search-go", "rbx-2007-btn");
    if (!button.textContent.trim()) button.textContent = "Search";
  }
}

function enhanceUserSearch() {
  if (!currentSettings.userSearch) return;

  const input = findSearchInput();
  if (!input) return;

  if (
    searchInputRef &&
    searchInputRef !== input &&
    searchInputRef.dataset.vortex07SearchEnhanced === "true"
  ) {
    delete searchInputRef.dataset.vortex07SearchEnhanced;
  }

  if (
    input.dataset.vortex07SearchEnhanced === "true" &&
    isElementInDocument(input)
  ) {
    searchInputRef = input;
    bindSearchHost(findSearchHost(), input);
    getOrCreateResultsBox();
    updateResultsBoxPosition();
    return;
  }

  searchInputRef = input;
  input.dataset.vortex07SearchEnhanced = "true";
  input.setAttribute("autocomplete", "off");

  const host = input.closest("form") || input.parentElement;
  bindSearchHost(host, input);

  attachSearchPositionListeners();
  getOrCreateResultsBox();

  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (query.length < 2) {
      clearSearchResults();
      return;
    }
    debouncedPlayerSearch(query);
  });

  input.addEventListener("focus", () => {
    const query = input.value.trim();
    const box = document.getElementById("vortex07-user-results");

    if (
      query.length >= 2 &&
      query === lastSearchQuery &&
      box &&
      box.children.length > 0
    ) {
      showResultsBox();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearSearchResults();
    }
  });

  if (!documentClickAttached) {
    documentClickAttached = true;

    document.addEventListener(
      "click",
      (event) => {
        const box = document.getElementById("vortex07-user-results");
        if (!box) return;

        if (!isInsideSearchUi(event.target)) {
          hideResultsBox();
        }
      },
      true,
    );
  }

  logSearch("Player search attached");
}

function removeUserSearch() {
  hideResultsBox();
  document.getElementById("vortex07-user-results")?.remove();
  searchInputRef = null;
  searchHostRef = null;

  document
    .querySelectorAll('[data-vortex07-search-enhanced="true"]')
    .forEach((input) => {
      delete input.dataset.vortex07SearchEnhanced;
    });
}

function debouncedPlayerSearch(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => searchPlayers(query), 300);
}

async function searchPlayers(query) {
  if (!query || query.length < 2) return;

  lastSearchQuery = query;

  const resultsBox = getOrCreateResultsBox();
  if (!resultsBox) return;

  clearElement(resultsBox);
  showResultsBox();
  resultsBox.appendChild(makeMutedRow("Searching players..."));
  updateResultsBoxPosition();

  logSearch("Searching players:", query);

  try {
    const players = await fetchTopPlayers(query);
    await snapshotPlayersToArchive(players, "search");

    players
      .filter((player) => player.isBanned)
      .forEach((player) => markPlayerBannedInArchive(player.id, "search-detected"));

    const liveIds = new Set(
      players.map((player) => Number(player.id)).filter(Number.isFinite),
    );
    const archived = await searchBanArchive(query, liveIds);

    renderPlayerResults(players, archived, query);

    const bannedUsers = players.filter((player) => player.isBanned);
    logBanned("Search banned summary:", {
      query,
      totalPlayers: players.length,
      bannedPlayers: bannedUsers.length,
      archivedMatches: archived.length,
      bannedUsers: bannedUsers.map((player) => ({
        id: player.id,
        username: player.username,
        detectedBy: player.bannedDetectedBy,
        rawValue: player.bannedRawValue,
      })),
    });

    logArchive("Search merge:", {
      query,
      live: players.length,
      archived: archived.length,
      archiveTotal: await getBanArchiveCount(),
    });

    await storageSet("local", {
      vortex07LastPlayerSearch: { query, players, savedAt: Date.now() },
    });
  } catch (err) {
    logError("Player search failed:", err);
    clearElement(resultsBox);
    resultsBox.appendChild(makeMutedRow("Search unavailable"));
    showResultsBox();
  }
}

async function fetchTopPlayers(query) {
  const data = await vortexApi.get("/api/users/search", { q: query });
  if (data === null) throw new Error("Player search unavailable");

  if (!Array.isArray(data)) {
    logWarn("Player search response was not an array:", data);
    return [];
  }

  logSearch(`Raw player search results: ${data.length}`, data);

  const players = data.map(normalizePlayer).filter(Boolean).slice(0, 5);
  const bannedPlayers = players.filter((player) => player.isBanned);

  logSearch(`Normalized ${players.length} players`);
  logBanned(`Normalized ${bannedPlayers.length} banned players`, bannedPlayers);

  return attachAvatars(players);
}

async function fetchPlayerAvatars(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

  const cleanIds = userIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  if (cleanIds.length === 0) return new Map();

  const resultMap = new Map();
  const missingIds = [];

  cleanIds.forEach((id) => {
    if (avatarMemoryCache.has(id)) {
      resultMap.set(id, avatarMemoryCache.get(id));
      logAvatar(`cache hit ${id}`);
    } else {
      missingIds.push(id);
      logAvatar(`cache miss ${id}`);
    }
  });

  if (missingIds.length === 0) return resultMap;

  const data = await vortexApi.get("/api/users/avatar-pictures", {
    ids: missingIds.join(","),
  });
  if (data === null) {
    logWarn("Avatar API unavailable, using fallback avatars.");
    return resultMap;
  }

  const fetchedMap = normalizeAvatarMap(data);
  fetchedMap.forEach((avatarUrl, id) => {
    avatarMemoryCache.set(id, avatarUrl);
    resultMap.set(id, avatarUrl);
  });

  logAvatar(`Fetched ${fetchedMap.size} avatars`);
  return resultMap;
}

async function attachAvatars(players) {
  if (!Array.isArray(players) || players.length === 0) return [];

  const ids = players
    .map((player) => player.id)
    .filter((id) => Number.isFinite(Number(id)));
  const avatarMap = await fetchPlayerAvatars(ids);

  return players.map((player) => ({
    ...player,
    avatarUrl: avatarMap.get(Number(player.id)) || "",
  }));
}

function renderPlayerResults(livePlayers, archivedPlayers, query) {
  const resultsBox = getOrCreateResultsBox();
  if (!resultsBox) return;

  clearElement(resultsBox);
  hideHoverPreview();

  const live = Array.isArray(livePlayers) ? livePlayers : [];
  const archived = Array.isArray(archivedPlayers) ? archivedPlayers : [];
  let rendered = 0;

  if (live.length > 0) {
    const title = document.createElement("div");
    title.className = "vortex07-search-section-title";
    title.textContent = "Players";
    resultsBox.appendChild(title);

    live.slice(0, 5).forEach((player) => {
      const row = makePlayerRow(player);
      if (row) {
        resultsBox.appendChild(row);
        rendered += 1;
      }
    });
  }

  if (archived.length > 0) {
    const title = document.createElement("div");
    title.className =
      "vortex07-search-section-title vortex07-search-section-archive";
    title.textContent = "Termed Archive";
    resultsBox.appendChild(title);

    archived.slice(0, 5).forEach((player) => {
      const row = makePlayerRow(archivedPlayerToRow(player), {
        archived: true,
      });
      if (row) {
        resultsBox.appendChild(row);
        rendered += 1;
      }
    });
  }

  if (rendered === 0) {
    resultsBox.appendChild(makeMutedRow(`No players found for "${query}"`));
    if (currentSettings.banArchive) {
      resultsBox.appendChild(
        makeMutedRow(
          "Termed Archive: visit profiles or search users before they are banned to save snapshots.",
        ),
      );
    }
  }

  showResultsBox();
  scheduleGlobalRepBadges(resultsBox);
  logSearch("Rendered player results:", { live: live.length, archived: archived.length });
}

function makePlayerRow(player, options = {}) {
  const id = safeNumber(player.id);
  if (id === null) return null;

  const isArchived = Boolean(options.archived || player.isArchived);
  const username = player.username || "unknown";
  const displayName = player.displayName || username;

  const row = document.createElement("a");
  row.className = "vortex07-user-result vortex07-player-result";
  if (isArchived) row.classList.add("vortex07-archived-result");

  row.href = `/users/${id}/profile`;
  row.dataset.vortex07UserId = String(id);
  if (isArchived) {
    row.title = "Archived snapshot — profile may be terminated on Vortex";
  }

  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.padding = "4px 6px";

  const avatar = document.createElement("span");
  avatar.className = "vortex07-user-avatar";
  avatar.style.background = avatarColor(username);

  const avatarSrc = safeImageSrc(player.avatarUrl, "");

  if (avatarSrc) {
    const img = document.createElement("img");
    img.className = "vortex07-user-avatar-img";
    img.src = avatarSrc;
    img.alt = "";
    img.loading = "lazy";
    avatar.appendChild(img);
  } else {
    const letter = document.createElement("span");
    letter.className = "vortex07-user-avatar-letter";
    letter.textContent = initial(username);
    avatar.appendChild(letter);
  }

  const info = document.createElement("span");
  info.className = "vortex07-user-info";
  info.style.display = "flex";
  info.style.flexDirection = "column";
  info.style.lineHeight = "1.1";

  const nameLine = document.createElement("span");
  nameLine.className = "vortex07-user-name";
  nameLine.innerHTML = highlightMatch(displayName, lastSearchQuery);

  const userLine = document.createElement("span");
  userLine.className = "vortex07-user-sub";
  userLine.textContent = `@${username}`;
  userLine.style.color = "#555";
  userLine.style.fontSize = "10px";

  info.appendChild(nameLine);
  info.appendChild(userLine);

  if (isArchived) {
    const seenLine = document.createElement("span");
    seenLine.className = "vortex07-user-sub vortex07-archive-meta";
    seenLine.textContent = `Last seen ${formatArchiveDate(player.lastSeenAt)}`;
    info.appendChild(seenLine);
  }

  row.appendChild(avatar);
  row.appendChild(info);

  if (player.isBanned || isArchived) {
    const badge = document.createElement("span");
    badge.className = "vortex07-user-banned";
    if (isArchived && player.isBanned) badge.classList.add("vortex07-user-termed");
    badge.textContent = player.isBanned ? "TERMED" : "ARCHIVED";
    row.appendChild(badge);
  }

  return row;
}

function makeMutedRow(text) {
  const row = document.createElement("div");
  row.className = "vortex07-user-result vortex07-user-muted";
  row.textContent = text;
  return row;
}

function avatarColor(username) {
  const colors = ["#d8c7ff", "#cab6f2", "#bfa7e8", "#e2d6ff", "#c7b2ee"];
  let hash = 0;
  const source = String(username || "V");

  for (let i = 0; i < source.length; i++) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

function initial(username) {
  return (
    String(username || "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?"
  );
}

function clearSearchResults() {
  const resultsBox = document.getElementById("vortex07-user-results");
  if (!resultsBox) return;

  clearElement(resultsBox);
  hideResultsBox();
}

function clearUserResults() {
  clearSearchResults();
}

function enhanceLegacyStatusLabels() {
  // Status text labels intentionally disabled.
  // Native site status dots may remain styled by CSS if needed.
}

function flattenCarousels() {
  document
    .querySelectorAll(
      ".carousel-wrap, .carousel-track, .carousel-inner, .carousel-slider, [class*='carousel']",
    )
    .forEach((el) => {
      if (isInsideVortexShell(el) && el.closest("#Header, #Banner, .Navigation"))
        return;

      el.style.transform = "none";
      el.style.transition = "none";
      el.style.animation = "none";
      el.style.overflow = "visible";
      el.style.width = "100%";
      el.style.maxWidth = "100%";
    });

  document
    .querySelectorAll(".carousel-arrow, .carousel-btn, [class*='carousel-prev'], [class*='carousel-next']")
    .forEach((el) => {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
    });

  document.querySelectorAll(".carousel-wrap").forEach((wrap) => {
    wrap.dataset.vortex07Flattened = "true";
  });
}

function compressHeroSections() {
  document
    .querySelectorAll(
      ".hero, .page-hero, .home-hero, .site-hero, .banner-hero, [class*='hero-banner'], [class*='Hero']",
    )
    .forEach((el) => {
      if (el.closest("#Banner, #Header, #Logo")) return;
      el.classList.add("vortex07-hero-compressed");
    });

  document.querySelectorAll(".dl-hero").forEach((el) => {
    el.classList.add("vortex07-dl-hero-compact");
  });
}

function normalizeFriendTiles() {
  const grids = document.querySelectorAll(
    ".friends-grid, .friends-section, .friends-list, [class*='friends-grid'], [class*='friend-list']",
  );

  grids.forEach((grid) => {
    grid.style.removeProperty("display");
    grid.style.removeProperty("grid-template-columns");
    grid.style.removeProperty("grid-template-rows");
    grid.style.removeProperty("gap");
  });

  document
    .querySelectorAll(
      ".friend-card, .friends-grid > a, .friends-section > a, .friends-list > a",
    )
    .forEach((card) => {
      if (!card.closest("#Container")) return;

      card.classList.add("vortex07-friend-tile");

      const friendId = getUserIdFromRepNode(card);
      if (friendId !== null) {
        card.dataset.vortex07UserId = String(friendId);
      }

      [
        "width",
        "min-width",
        "max-width",
        "flex",
        "flex-direction",
        "align-items",
        "align-self",
        "grid-column",
        "grid-row",
        "justify-content",
      ].forEach((prop) => card.style.removeProperty(prop));

      card.querySelectorAll(".friend-name, span, p").forEach((label) => {
        if (label.closest(".friend-avatar, [class*='avatar']")) return;
        if (label.querySelector("img")) return;

        label.style.removeProperty("position");
        label.style.removeProperty("top");
        label.style.removeProperty("right");
        label.style.removeProperty("bottom");
        label.style.removeProperty("left");
        label.style.removeProperty("align-self");
      });
    });
}

(async () => {
  try {
    await initVortex07();
  } catch (err) {
    logError("Init failed:", err);
  } finally {
    // Last-resort protection against white screen of death.
    revealBody();
  }
})();
