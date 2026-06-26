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
};

const checkboxSettingIds = [
  "enabled",
  "customNav",
  "classicFooter",
  "retroButtons",
  "userSearch",
  "banArchive",
  "reputation",
  "debugLogs",
];

const textSettingIds = ["reputationApiUrl"];
const selectSettingIds = [];

const dependentCheckboxIds = checkboxSettingIds.filter((id) => id !== "enabled");
const dependentTextIds = [...textSettingIds];

let saveStatusTimer = null;

function normalizeSettings(settings) {
  return {
    ...defaultSettings,
    ...(settings || {}),
  };
}

function readSettingsFromPopup() {
  const settings = {};

  checkboxSettingIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) settings[id] = Boolean(input.checked);
  });

  textSettingIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) settings[id] = String(input.value || "").trim();
  });

  selectSettingIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) settings[id] = input.value || defaultSettings[id];
  });

  return normalizeSettings(settings);
}

function applySettingsToPopup(settings) {
  checkboxSettingIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.checked = Boolean(settings[id]);
  });

  textSettingIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = settings[id] || defaultSettings[id] || "";
  });

  selectSettingIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = settings[id] || defaultSettings[id];
  });

  applyMasterToggleState(settings);
  updateRepApiHint(settings);
}

function applyMasterToggleState(settings) {
  const enabled = Boolean(settings.enabled);
  const shell = document.getElementById("popupShell");

  dependentCheckboxIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.disabled = !enabled;
  });

  dependentTextIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.disabled = !enabled;
  });

  if (shell) shell.classList.toggle("popup-off", !enabled);
}

function updateRepApiHint(settings) {
  const hint = document.getElementById("repApiHint");
  if (!hint) return;

  const url = String(settings.reputationApiUrl || "").trim();
  if (!url) {
    hint.textContent =
      "Using community rep sync (vortex07.vercel.app). Counts are shared across all Vortex07 users.";
    return;
  }

  hint.textContent = `Custom sync via ${url.replace(/^https?:\/\//, "")}`;
}

function setSaveStatus(text, type = "") {
  const el = document.getElementById("saveStatus");
  if (!el) return;

  el.textContent = text;
  el.classList.remove("save-ok", "save-err");
  if (type) el.classList.add(type);

  clearTimeout(saveStatusTimer);
  if (type === "save-ok") {
    saveStatusTimer = setTimeout(() => {
      el.textContent = "Ready";
      el.classList.remove("save-ok");
    }, 1800);
  }
}

function updateArchiveStat() {
  const el = document.getElementById("archiveStat");
  if (!el) return;

  chrome.storage.local.get({ vortex07BanArchive: {} }, (data) => {
    const archive = data.vortex07BanArchive || {};
    const count = Object.keys(archive).length;
    const termed = Object.values(archive).filter((entry) => entry?.isBanned).length;

    if (count === 0) {
      el.textContent = "Archive: empty — browse profiles to build it";
      return;
    }

    el.textContent = `Archive: ${count} snapshot${count === 1 ? "" : "s"} · ${termed} termed`;
  });
}

function saveSettings() {
  const settings = readSettingsFromPopup();
  applyMasterToggleState(settings);
  updateRepApiHint(settings);

  chrome.storage.sync.set({ vortex07Settings: settings }, () => {
    const err = chrome.runtime.lastError;

    if (err) {
      console.error("[Vortex07][POPUP] Failed to save settings:", err.message);
      setSaveStatus("Save failed", "save-err");
      return;
    }

    setSaveStatus("Settings saved", "save-ok");

    if (settings.debugLogs) {
      console.log("[Vortex07][POPUP] Settings saved:", settings);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get({ vortex07Settings: defaultSettings }, (data) => {
    const settings = normalizeSettings(data.vortex07Settings);
    applySettingsToPopup(settings);

    if (settings.debugLogs) {
      console.log("[Vortex07][POPUP] Settings loaded:", settings);
    }
  });

  updateArchiveStat();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "sync" && changes.vortex07Settings) {
      applySettingsToPopup(
        normalizeSettings(changes.vortex07Settings.newValue),
      );
    }

    if (namespace === "local" && changes.vortex07BanArchive) {
      updateArchiveStat();
    }
  });

  document
    .querySelectorAll('input[type="checkbox"], input[type="text"], select')
    .forEach((input) => {
      input.addEventListener("change", saveSettings);
    });

  document.querySelectorAll('input[type="text"]').forEach((input) => {
    input.addEventListener("input", saveSettings);
  });

  document.getElementById("enabled")?.addEventListener("change", () => {
    applyMasterToggleState(readSettingsFromPopup());
  });
});
