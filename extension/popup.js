const state = {
  settings: {},
  presets: [],
  rules: [],
  tabs: [],
  checks: [],
  loadError: "",
  search: "",
  sort: "playing",
  refreshing: false
};

const $ = (selector) => document.querySelector(selector);

function hasChromeTabs() {
  return typeof chrome !== "undefined" && chrome.runtime && chrome.tabs;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function initials(domain) {
  return domain.split(".")[0].slice(0, 2).toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function chromeMessage(message) {
  if (!hasChromeTabs()) return null;
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

function getTabMediaStreamId(tabId) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.tabCapture?.getMediaStreamId) {
      resolve(null);
      return;
    }

    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (mediaStreamId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(mediaStreamId);
    });
  });
}

async function loadTabs(options = {}) {
  const { preserveStatus = false } = options;
  const storedTabState = await VolumeDeckStorage.getTabState();

  if (!hasChromeTabs()) {
    state.tabs = [];
    state.loadError = "Open VolumeDeck from the Chrome extension popup to control real tabs.";
    lockStatus(state.loadError);
    return;
  }

  const tabResponse = await chromeMessage({ type: "VOLDECK_GET_TABS" });

  if (!tabResponse?.ok) {
    state.tabs = [];
    state.loadError = tabResponse?.error || "Chrome did not return tab data. Reload VolumeDeck from chrome://extensions.";
    lockStatus(state.loadError);
    return;
  }

  state.loadError = "";
  if (!preserveStatus) unlockStatus();
  const chromeTabs = Array.isArray(tabResponse.tabs) ? tabResponse.tabs : [];
  const currentTabs = new Map(state.tabs.map((tab) => [tab.id, tab]));
  state.tabs = chromeTabs.map((tab) => ({
    ...tab,
    title: tab.title || "Untitled tab",
    domain: domainFromUrl(tab.url),
    volume: currentTabs.get(tab.id)?.volume ?? storedTabState[tab.id]?.volume ?? 100,
    pinned: storedTabState[tab.id]?.pinned ?? tab.pinned,
    audioMethod: currentTabs.get(tab.id)?.audioMethod ?? storedTabState[tab.id]?.audioMethod ?? "ready",
    audioControl: currentTabs.get(tab.id)?.audioControl || null
  }));
}

function reportStatus(message) {
  $("#statusText").textContent = message;
}

function lockStatus(message) {
  $("#statusText").dataset.locked = "true";
  reportStatus(message);
}

function unlockStatus() {
  delete $("#statusText").dataset.locked;
}

function statusFor(tab) {
  if (tab.muted) return "Muted";
  if (tab.volume > 100) return "Boosted";
  if (tab.audible) return "Playing";
  return "Silent";
}

function methodLabel(tab) {
  if (tab.audioMethod === "tabCapture") return "Method: tab capture boost";
  if (tab.audioMethod === "html5") return "Method: HTML5 media fallback";
  if (tab.audioMethod === "mute-only") return "Method: mute-only fallback";
  return "Method: ready";
}

function sortedTabs() {
  const search = state.search.trim().toLowerCase();
  const tabs = state.tabs.filter((tab) => {
    return !search || tab.title.toLowerCase().includes(search) || tab.domain.toLowerCase().includes(search);
  });

  return tabs.sort((a, b) => {
    if (state.sort === "loudest") return b.volume - a.volume;
    if (state.sort === "recent") return Number(b.active) - Number(a.active);
    if (state.sort === "domain") return a.domain.localeCompare(b.domain);
    if (state.sort === "pinned") return Number(b.pinned) - Number(a.pinned);
    return Number(b.audible) - Number(a.audible);
  });
}

function renderFavicon(container, tab) {
  container.textContent = initials(tab.domain);
  if (!tab.favIconUrl) return;
  const image = document.createElement("img");
  image.src = tab.favIconUrl;
  image.alt = "";
  image.addEventListener("error", () => image.remove());
  container.textContent = "";
  container.append(image);
}

function renderNowPlaying() {
  const card = $("#nowPlayingCard");
  const nowTab = [...state.tabs].sort((a, b) => Number(b.audible) - Number(a.audible) || b.volume - a.volume)[0];
  $("#nowVolume").textContent = nowTab ? `${nowTab.volume}%` : "0%";

  if (!nowTab) {
    card.innerHTML = `<p class="empty">${escapeHtml(state.loadError || "No controllable web tabs detected.")}</p>`;
    return;
  }

  card.innerHTML = `
    <div class="favicon"></div>
    <div class="now-copy">
      <h3>${escapeHtml(nowTab.title)}</h3>
      <p>${escapeHtml(nowTab.domain)}</p>
    </div>
    <div class="now-actions">
      <button type="button" data-now-action="mute" title="Mute current tab">${nowTab.muted ? "Unmute" : "Mute"}</button>
      <button type="button" data-now-action="solo" title="Solo current tab">Solo</button>
    </div>
  `;
  renderFavicon(card.querySelector(".favicon"), nowTab);
  card.querySelector('[data-now-action="mute"]').addEventListener("click", () => toggleMute(nowTab.id));
  card.querySelector('[data-now-action="solo"]').addEventListener("click", () => soloTab(nowTab.id));
}

function renderTabs() {
  const list = $("#tabList");
  const tabs = sortedTabs();
  $("#tabCount").textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
  if (!$("#statusText").dataset.locked) {
    $("#statusText").textContent = `${state.tabs.filter((tab) => tab.audible && !tab.muted).length} active audio tabs`;
  }
  list.innerHTML = "";

  if (!tabs.length) {
    if (state.loadError) {
      list.innerHTML = `<p class="empty">${escapeHtml(state.loadError)}</p>`;
    } else if (state.tabs.length) {
      list.innerHTML = '<p class="empty">No tabs match this search.</p>';
    } else {
      list.innerHTML = '<p class="empty">No real web tabs available. Open a normal http or https page, play audio, then reopen VolumeDeck.</p>';
    }
    return;
  }

  tabs.forEach((tab) => {
    const node = $("#tabTemplate").content.firstElementChild.cloneNode(true);
    const badge = node.querySelector(".badge");
    const slider = node.querySelector(".tab-slider");
    const output = node.querySelector("output");
    const volumeRow = node.querySelector(".volume-row");
    const status = statusFor(tab).toLowerCase();

    node.classList.toggle("playing", tab.audible && !tab.muted);
    node.classList.toggle("muted", tab.muted);
    node.querySelector("h3").textContent = tab.title;
    node.querySelector("p").textContent = tab.domain;
    node.querySelector(".method-line").textContent = methodLabel(tab);
    renderFavicon(node.querySelector(".favicon"), tab);
    badge.textContent = statusFor(tab);
    badge.className = `badge ${status}`;
    slider.value = tab.volume;
    slider.setAttribute("aria-label", `Volume for ${tab.title}`);
    output.textContent = `${tab.volume}%`;
    volumeRow.classList.toggle("warning", tab.volume > 300);

    slider.addEventListener("input", () => {
      tab.volume = Number(slider.value);
      output.textContent = `${tab.volume}%`;
      volumeRow.classList.toggle("warning", tab.volume > 300);
    });
    slider.addEventListener("change", () => setTabVolume(tab.id, Number(slider.value)));

    node.querySelector('[data-action="mute"]').textContent = tab.muted ? "Unmute" : "Mute";
    node.querySelector('[data-action="mute"]').addEventListener("click", () => toggleMute(tab.id));
    node.querySelector('[data-action="solo"]').addEventListener("click", () => soloTab(tab.id));
    node.querySelector('[data-action="reset"]').addEventListener("click", () => setTabVolume(tab.id, 100));
    node.querySelector('[data-action="pin"]').textContent = tab.pinned ? "Pinned" : "Pin";
    node.querySelector('[data-action="pin"]').addEventListener("click", () => pinTab(tab.id));

    list.append(node);
  });
}

function renderPresets() {
  const list = $("#presetList");
  list.innerHTML = "";
  state.presets.forEach((preset) => {
    const card = document.createElement("article");
    const presetName = escapeHtml(preset.name);
    card.className = "preset-card";
    card.innerHTML = `
      <div>
        <strong>${presetName}</strong>
        <p>${preset.master}% master / ${Object.keys(preset.rules || {}).length} tuned lanes</p>
      </div>
      <div class="preset-actions">
        <button type="button" data-action="apply" title="Apply ${presetName} preset">Apply</button>
        <button type="button" data-action="rename" title="Rename ${presetName} preset">Rename</button>
        <button type="button" data-action="delete" title="Delete ${presetName} preset">Delete</button>
      </div>
    `;
    card.querySelector('[data-action="apply"]').addEventListener("click", () => applyPreset(preset));
    card.querySelector('[data-action="rename"]').addEventListener("click", () => renamePreset(preset.id));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deletePreset(preset.id));
    list.append(card);
  });
}

function renderRules() {
  const list = $("#ruleList");
  list.innerHTML = "";
  state.rules.forEach((rule) => {
    const row = document.createElement("label");
    row.className = "rule-row";
    row.innerHTML = `<p>${escapeHtml(rule.label)}</p><input type="checkbox" ${rule.enabled ? "checked" : ""} aria-label="Toggle ${escapeHtml(rule.label)}" />`;
    row.querySelector("input").addEventListener("change", async (event) => {
      rule.enabled = event.target.checked;
      await VolumeDeckStorage.saveRules(state.rules);
    });
    list.append(row);
  });
}

function renderChecks() {
  const list = $("#checkList");
  if (!list) return;
  list.innerHTML = "";

  if (!state.checks.length) {
    list.innerHTML = '<p class="empty">Checks have not run yet.</p>';
    return;
  }

  state.checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = `check-row ${check.ok ? "ok" : "fail"}`;
    row.innerHTML = `
      <span class="check-dot" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(check.label)}</strong>
        <span>${escapeHtml(check.detail || (check.ok ? "OK" : "Needs attention"))}</span>
      </div>
    `;
    list.append(row);
  });
}

async function persistTabState() {
  const tabState = {};
  state.tabs.forEach((tab) => {
    tabState[tab.id] = { volume: tab.volume, pinned: tab.pinned, audioMethod: tab.audioMethod };
  });
  await VolumeDeckStorage.saveTabState(tabState);
}

function describeVolumeResult(tab, volume) {
  const result = tab.audioControl;

  if (!result) return;

  if (result.method === "tabCapture" || result.captured) {
    tab.audioMethod = "tabCapture";
    lockStatus("Tab audio captured. Real boost is active.");
    return;
  }

  if (result.method === "reset") {
    tab.audioMethod = "ready";
    unlockStatus();
    return;
  }

  if (result.method === "html5" || result.fallback?.found) {
    tab.audioMethod = "html5";
    const applied = result.fallback?.appliedNativeVolume;
    if (Number(volume) > 100) {
      lockStatus(`HTML5 media volume changed to ${applied || 100}%. Boost above 100% needs tab capture.`);
    } else {
      lockStatus("HTML5 media volume changed on this page.");
    }
    return;
  }

  if (result.method === "none" || result.error) {
    tab.audioMethod = "mute-only";
    lockStatus(`Volume control failed: ${result.error || "this page blocked capture and media control"}. Use mute for this tab.`);
  }
}

async function setTabVolume(tabId, volume) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  tab.volume = volume;
  tab.audioControl = null;
  await persistTabState();
  let mediaStreamId = null;
  let captureError = null;
  if (hasChromeTabs() && Number(volume) !== 100) {
    try {
      mediaStreamId = await getTabMediaStreamId(tabId);
    } catch (error) {
      captureError = error.message;
    }
  }

  tab.audioControl = await chromeMessage({ type: "VOLDECK_SET_VOLUME", tabId, volume, mediaStreamId, captureError });

  describeVolumeResult(tab, volume);
  await persistTabState();
  render();
}

async function toggleMute(tabId) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const requestedMuted = !tab.muted;
  tab.muted = requestedMuted;
  renderTabs();
  const response = await chromeMessage({ type: "VOLDECK_SET_MUTED", tabId, muted: requestedMuted });

  if (!response?.ok || !response.verified) {
    tab.muted = Boolean(response?.muted);
    lockStatus(`Mute check failed: ${response?.error || "Chrome did not verify the mute change."}`);
  } else {
    tab.muted = response.muted;
    lockStatus(`${response.muted ? "Mute" : "Unmute"} verified by Chrome.`);
  }

  await refreshSingleTab(tabId);
  render();
}

async function setTabMuted(tabId, muted) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const response = await chromeMessage({ type: "VOLDECK_SET_MUTED", tabId, muted });
  tab.muted = Boolean(response?.muted ?? muted);
  return response;
}

async function soloTab(tabId) {
  state.tabs.forEach((tab) => {
    tab.muted = tab.id !== tabId;
  });
  const response = await chromeMessage({ type: "VOLDECK_SOLO_TAB", tabId });
  const failed = response?.results?.filter((result) => !result.ok || !result.verified) || [];
  if (response?.error) {
    lockStatus(`Solo failed: ${response.error}`);
  } else if (failed.length) {
    lockStatus(`Solo check failed on ${failed.length} tab${failed.length === 1 ? "" : "s"}.`);
  } else {
    lockStatus("Solo verified by Chrome.");
  }
  await refreshLiveTabs();
  render();
}

async function pinTab(tabId) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  await persistTabState();
  render();
}

async function applyPreset(preset) {
  state.settings.masterVolume = preset.master;
  $("#masterVolume").value = preset.master;
  await Promise.all(state.tabs.map((tab) => {
    const domainKey = Object.keys(preset.rules || {}).find((key) => tab.domain.includes(key));
    return setTabVolume(tab.id, domainKey ? preset.rules[domainKey] : preset.master);
  }));
  await VolumeDeckStorage.saveSettings({ masterVolume: preset.master });
  render();
}

async function renamePreset(id) {
  const preset = state.presets.find((item) => item.id === id);
  const nextName = prompt("Preset name", preset.name);
  if (!nextName) return;
  preset.name = nextName.trim();
  await VolumeDeckStorage.savePresets(state.presets);
  renderPresets();
}

async function deletePreset(id) {
  state.presets = state.presets.filter((preset) => preset.id !== id);
  await VolumeDeckStorage.savePresets(state.presets);
  renderPresets();
}

async function saveCurrentPreset() {
  const name = prompt("Name this preset", "Custom Mix");
  if (!name) return;
  state.presets.unshift({
    id: `custom-${Date.now()}`,
    name: name.trim(),
    master: Number($("#masterVolume").value),
    rules: {},
    color: "cyan"
  });
  await VolumeDeckStorage.savePresets(state.presets);
  renderPresets();
}

function render() {
  $("#masterOutput").textContent = `${$("#masterVolume").value}%`;
  renderNowPlaying();
  renderTabs();
  renderChecks();
  renderPresets();
  renderRules();
  document.body.classList.toggle("light", state.settings.theme === "light");
}

async function refreshSingleTab(tabId) {
  const response = await chromeMessage({ type: "VOLDECK_GET_TAB", tabId });
  if (!response?.ok || !response.tab) return;
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  Object.assign(tab, {
    ...response.tab,
    domain: domainFromUrl(response.tab.url),
    volume: tab.volume,
    pinned: tab.pinned,
    audioMethod: tab.audioMethod,
    audioControl: tab.audioControl
  });
}

async function refreshLiveTabs() {
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    await loadTabs({ preserveStatus: true });
    renderNowPlaying();
    renderTabs();
  } finally {
    state.refreshing = false;
  }
}

function startLiveRefresh() {
  if (!hasChromeTabs()) return;
  setInterval(refreshLiveTabs, 2000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshLiveTabs();
  });

  const refresh = () => refreshLiveTabs();
  chrome.tabs.onActivated?.addListener(refresh);
  chrome.tabs.onCreated?.addListener(refresh);
  chrome.tabs.onRemoved?.addListener(refresh);
  chrome.tabs.onUpdated?.addListener(refresh);
}

async function runSelfCheck() {
  state.checks = [{ id: "running", label: "Running checks", ok: true, detail: "Checking Chrome APIs and active tab media..." }];
  renderChecks();

  const response = await chromeMessage({ type: "VOLDECK_SELF_CHECK" });
  state.checks = Array.isArray(response?.checks)
    ? response.checks
    : [{ id: "self-check", label: "Self check runner", ok: false, detail: "Chrome did not return check results." }];

  if (response?.ok) {
    lockStatus("Self check passed.");
  } else {
    const failed = state.checks.filter((check) => !check.ok).length;
    lockStatus(`Self check found ${failed || 1} issue${failed === 1 ? "" : "s"}.`);
  }

  render();
}

async function init() {
  const data = await VolumeDeckStorage.ensureDefaults();
  state.settings = data.settings;
  state.presets = data.presets;
  state.rules = data.rules;
  await loadTabs();

  $("#masterVolume").value = state.settings.masterVolume;
  $("#masterVolume").addEventListener("input", (event) => {
    $("#masterOutput").textContent = `${event.target.value}%`;
  });
  $("#masterVolume").addEventListener("change", async (event) => {
    const volume = Number(event.target.value);
    state.settings.masterVolume = volume;
    await VolumeDeckStorage.saveSettings({ masterVolume: volume });
    await Promise.all(state.tabs.map((tab) => setTabVolume(tab.id, volume)));
  });

  $("#resetMaster").addEventListener("click", () => {
    $("#masterVolume").value = 100;
    state.tabs.forEach((tab) => (tab.volume = 100));
    Promise.all([
      VolumeDeckStorage.saveSettings({ masterVolume: 100 }),
      ...state.tabs.map((tab) => setTabVolume(tab.id, 100))
    ]).then(render);
  });
  $("#muteAll").addEventListener("click", async () => {
    const results = await Promise.all(state.tabs.map((tab) => setTabMuted(tab.id, true)));
    const failed = results.filter((result) => !result?.ok || !result?.verified).length;
    lockStatus(failed ? `Mute-all check failed on ${failed} tab${failed === 1 ? "" : "s"}.` : "Mute all verified by Chrome.");
    await refreshLiveTabs();
    render();
  });
  $("#unmuteAll").addEventListener("click", async () => {
    const results = await Promise.all(state.tabs.map((tab) => setTabMuted(tab.id, false)));
    const failed = results.filter((result) => !result?.ok || !result?.verified).length;
    lockStatus(failed ? `Unmute-all check failed on ${failed} tab${failed === 1 ? "" : "s"}.` : "Unmute all verified by Chrome.");
    await refreshLiveTabs();
    render();
  });
  $("#normalizeTabs").addEventListener("click", () => {
    Promise.all(
      state.tabs.map((tab) => (tab.volume > 160 ? setTabVolume(tab.id, 100) : Promise.resolve()))
    ).then(render);
  });
  $("#saveCurrentPreset").addEventListener("click", saveCurrentPreset);
  $("#settingsButton").addEventListener("click", () => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open("options.html", "_blank");
  });
  $("#themeToggle").addEventListener("click", async () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    await VolumeDeckStorage.saveSettings({ theme: state.settings.theme });
    render();
  });
  $("#searchTabs").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTabs();
  });
  $("#sortTabs").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderTabs();
  });
  $("#runSelfCheck").addEventListener("click", runSelfCheck);

  render();
  startLiveRefresh();
  runSelfCheck();
}

init();
