const mockTabs = [
  { id: 101, title: "Lo-fi study radio - beats to focus", domain: "youtube.com", audible: true, muted: false, volume: 140, active: true, pinned: true, favIconUrl: "" },
  { id: 102, title: "Product planning notes", domain: "notion.so", audible: false, muted: false, volume: 100, active: false, pinned: false, favIconUrl: "" },
  { id: 103, title: "Spotify - Deep Focus", domain: "open.spotify.com", audible: true, muted: false, volume: 80, active: false, pinned: false, favIconUrl: "" },
  { id: 104, title: "Trailer - Movie Night", domain: "netflix.com", audible: true, muted: true, volume: 320, active: false, pinned: false, favIconUrl: "" }
];

const state = {
  settings: {},
  presets: [],
  rules: [],
  tabs: [],
  search: "",
  sort: "playing"
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

async function loadTabs() {
  const storedTabState = await VolumeDeckStorage.getTabState();
  const tabResponse = await chromeMessage({ type: "VOLDECK_GET_TABS" });
  const chromeTabs = tabResponse?.ok ? tabResponse.tabs : null;

  const sourceTabs = Array.isArray(chromeTabs) && chromeTabs.length
    ? chromeTabs.map((tab) => ({
        ...tab,
        domain: domainFromUrl(tab.url),
        volume: storedTabState[tab.id]?.volume || 100,
        pinned: storedTabState[tab.id]?.pinned || tab.pinned
      }))
    : mockTabs.map((tab) => ({ ...tab }));

  state.tabs = sourceTabs;
}

function reportStatus(message) {
  $("#statusText").textContent = message;
}

function statusFor(tab) {
  if (tab.muted) return "Muted";
  if (tab.volume > 100) return "Boosted";
  if (tab.audible) return "Playing";
  return "Silent";
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
    card.innerHTML = '<p class="empty">No audio tabs detected.</p>';
    return;
  }

  card.innerHTML = `
    <div class="favicon"></div>
    <div class="now-copy">
      <h3>${nowTab.title}</h3>
      <p>${nowTab.domain}</p>
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
    list.innerHTML = '<p class="empty">No tabs match this search.</p>';
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
    card.className = "preset-card";
    card.innerHTML = `
      <div>
        <strong>${preset.name}</strong>
        <p>${preset.master}% master / ${Object.keys(preset.rules || {}).length} tuned lanes</p>
      </div>
      <div class="preset-actions">
        <button type="button" data-action="apply" title="Apply ${preset.name} preset">Apply</button>
        <button type="button" data-action="rename" title="Rename ${preset.name} preset">Rename</button>
        <button type="button" data-action="delete" title="Delete ${preset.name} preset">Delete</button>
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
    row.innerHTML = `<p>${rule.label}</p><input type="checkbox" ${rule.enabled ? "checked" : ""} aria-label="Toggle ${rule.label}" />`;
    row.querySelector("input").addEventListener("change", async (event) => {
      rule.enabled = event.target.checked;
      await VolumeDeckStorage.saveRules(state.rules);
    });
    list.append(row);
  });
}

async function persistTabState() {
  const tabState = {};
  state.tabs.forEach((tab) => {
    tabState[tab.id] = { volume: tab.volume, pinned: tab.pinned };
  });
  await VolumeDeckStorage.saveTabState(tabState);
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

  if (tab.audioControl?.error) {
    $("#statusText").dataset.locked = "true";
    reportStatus(`Volume control failed: ${tab.audioControl.error}`);
  } else if (tab.audioControl?.fallback?.found) {
    $("#statusText").dataset.locked = "true";
    reportStatus("HTML5 media volume changed on this page.");
  } else {
    delete $("#statusText").dataset.locked;
  }
  render();
}

async function toggleMute(tabId) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  tab.muted = !tab.muted;
  await chromeMessage({ type: "VOLDECK_SET_MUTED", tabId, muted: tab.muted });
  render();
}

async function setTabMuted(tabId, muted) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  tab.muted = muted;
  await chromeMessage({ type: "VOLDECK_SET_MUTED", tabId, muted });
}

async function soloTab(tabId) {
  state.tabs.forEach((tab) => {
    tab.muted = tab.id !== tabId;
  });
  const response = await chromeMessage({ type: "VOLDECK_SOLO_TAB", tabId });
  if (response?.error) reportStatus(`Solo failed: ${response.error}`);
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
  renderPresets();
  renderRules();
  document.body.classList.toggle("light", state.settings.theme === "light");
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
    await Promise.all(state.tabs.map((tab) => setTabMuted(tab.id, true)));
    render();
  });
  $("#unmuteAll").addEventListener("click", async () => {
    await Promise.all(state.tabs.map((tab) => setTabMuted(tab.id, false)));
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

  render();
}

init();
