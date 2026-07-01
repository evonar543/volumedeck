(function () {
  const STORAGE_KEY = "volumedeck";

  const defaultSettings = {
    masterVolume: 100,
    boostLimit: 600,
    metersEnabled: true,
    newTabBehavior: "remember-domain",
    compactMode: false,
    theme: "dark",
    autoMuteNewTabs: false
  };

  const defaultPresets = [
    { id: "gaming", name: "Gaming", master: 120, rules: { voice: 110, music: 60 }, color: "violet" },
    { id: "study", name: "Study", master: 70, rules: { music: 45, alerts: 20 }, color: "cyan" },
    { id: "movie", name: "Movie Night", master: 160, rules: { video: 150 }, color: "amber" },
    { id: "music", name: "Music Boost", master: 180, rules: { spotify: 80, youtube: 140 }, color: "pink" },
    { id: "quiet", name: "Quiet Browsing", master: 50, rules: { default: 50 }, color: "slate" }
  ];

  const defaultRules = [
    { id: "youtube-boost", domain: "youtube.com", action: "set-volume", value: 140, enabled: true, label: "Always set YouTube to 140%" },
    { id: "ad-mute", domain: "ads/background", action: "mute", value: 0, enabled: true, label: "Always mute ads/background tabs where possible" },
    { id: "spotify-soft", domain: "spotify.com", action: "set-volume", value: 80, enabled: true, label: "Keep Spotify at 80%" },
    { id: "new-tabs", domain: "*", action: "mute-new", value: 0, enabled: false, label: "Auto-mute new tabs" }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getChromeStorage() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function readLocalFallback() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeLocalFallback(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      window.__volumedeckMemory = value;
    }
  }

  async function readAll() {
    const chromeStorage = getChromeStorage();
    if (chromeStorage) {
      return chromeStorage.get(STORAGE_KEY).then((result) => result[STORAGE_KEY] || {});
    }
    return readLocalFallback();
  }

  async function writeAll(nextValue) {
    const chromeStorage = getChromeStorage();
    if (chromeStorage) {
      return chromeStorage.set({ [STORAGE_KEY]: nextValue });
    }
    writeLocalFallback(nextValue);
    return undefined;
  }

  async function patch(partial) {
    const current = await readAll();
    const nextValue = { ...current, ...partial, updatedAt: new Date().toISOString() };
    await writeAll(nextValue);
    return nextValue;
  }

  const api = {
    defaults: {
      settings: defaultSettings,
      presets: defaultPresets,
      rules: defaultRules
    },
    async ensureDefaults() {
      const current = await readAll();
      const nextValue = {
        settings: { ...clone(defaultSettings), ...(current.settings || {}) },
        presets: current.presets || clone(defaultPresets),
        rules: current.rules || clone(defaultRules),
        tabState: current.tabState || {},
        updatedAt: current.updatedAt || new Date().toISOString()
      };
      await writeAll(nextValue);
      return nextValue;
    },
    async getSettings() {
      const current = await api.ensureDefaults();
      return current.settings;
    },
    async saveSettings(settings) {
      const current = await api.ensureDefaults();
      return patch({ settings: { ...current.settings, ...settings } });
    },
    async getPresets() {
      const current = await api.ensureDefaults();
      return current.presets;
    },
    async savePresets(presets) {
      return patch({ presets });
    },
    async getRules() {
      const current = await api.ensureDefaults();
      return current.rules;
    },
    async saveRules(rules) {
      return patch({ rules });
    },
    async getTabState() {
      const current = await api.ensureDefaults();
      return current.tabState || {};
    },
    async saveTabState(tabState) {
      return patch({ tabState });
    },
    async exportData() {
      return api.ensureDefaults();
    },
    async importData(data) {
      const nextValue = {
        settings: { ...clone(defaultSettings), ...(data.settings || {}) },
        presets: Array.isArray(data.presets) ? data.presets : clone(defaultPresets),
        rules: Array.isArray(data.rules) ? data.rules : clone(defaultRules),
        tabState: data.tabState || {},
        updatedAt: new Date().toISOString()
      };
      await writeAll(nextValue);
      return nextValue;
    },
    async reset() {
      const nextValue = {
        settings: clone(defaultSettings),
        presets: clone(defaultPresets),
        rules: clone(defaultRules),
        tabState: {},
        updatedAt: new Date().toISOString()
      };
      await writeAll(nextValue);
      return nextValue;
    }
  };

  globalThis.VolumeDeckStorage = api;
})();
