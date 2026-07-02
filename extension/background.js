importScripts("storage.js");

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

function isWebTab(tab) {
  return typeof tab.url === "string" && /^https?:\/\//i.test(tab.url);
}

async function queryTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => tab.id && isWebTab(tab))
    .map((tab) => ({
      id: tab.id,
      title: tab.title || "Untitled tab",
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || "",
      audible: Boolean(tab.audible),
      muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned)
    }));
}

async function getTabSnapshot(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !isWebTab(tab)) {
    return { ok: false, error: "Tab is not a controllable web page." };
  }

  return {
    ok: true,
    tab: {
      id: tab.id,
      title: tab.title || "Untitled tab",
      url: tab.url || "",
      favIconUrl: tab.favIconUrl || "",
      audible: Boolean(tab.audible),
      muted: Boolean(tab.mutedInfo && tab.mutedInfo.muted),
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned)
    }
  };
}

async function setMuted(tabId, muted) {
  const updatedTab = await chrome.tabs.update(tabId, { muted });
  const verifiedTab = await chrome.tabs.get(tabId);
  const actualMuted = Boolean(verifiedTab?.mutedInfo?.muted);

  return {
    ok: actualMuted === Boolean(muted),
    tabId,
    requestedMuted: Boolean(muted),
    muted: actualMuted,
    verified: actualMuted === Boolean(muted),
    error: actualMuted === Boolean(muted) ? null : "Chrome did not apply the requested mute state.",
    tab: {
      id: verifiedTab?.id || updatedTab?.id || tabId,
      audible: Boolean(verifiedTab?.audible),
      muted: actualMuted
    }
  };
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (injectionError) {
      return { found: 0, error: injectionError.message || error.message };
    }
  }
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if ("getContexts" in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }

  const clients = await self.clients.matchAll();
  return clients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Capture tab audio so VolumeDeck can apply per-tab gain."
  });
}

async function sendToOffscreen(message) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    target: "VOLDECK_OFFSCREEN",
    ...message
  });
}

async function runSelfCheck() {
  const checks = [];

  function add(id, label, ok, detail = "") {
    checks.push({ id, label, ok: Boolean(ok), detail });
  }

  try {
    const tabs = await queryTabs();
    add("tabs", "Real web tabs", true, `${tabs.length} controllable tab${tabs.length === 1 ? "" : "s"}`);
  } catch (error) {
    add("tabs", "Real web tabs", false, error.message);
  }

  try {
    await VolumeDeckStorage.ensureDefaults();
    add("storage", "Local storage", true, "Settings can be read and written.");
  } catch (error) {
    add("storage", "Local storage", false, error.message);
  }

  add("scripting", "Content script injection", Boolean(chrome.scripting?.executeScript), chrome.scripting?.executeScript ? "Available" : "Missing scripting API");
  add("tabCapture", "Tab capture boost", Boolean(chrome.tabCapture && chrome.offscreen), chrome.tabCapture && chrome.offscreen ? "Available for user-selected tabs." : "Missing tabCapture or offscreen API");

  const tabs = await queryTabs().catch(() => []);
  const activeTab = tabs.find((tab) => tab.active) || tabs[0];
  if (!activeTab) {
    add("media", "HTML5 media fallback", true, "Open a web tab to scan page media.");
  } else {
    const scan = await sendToTab(activeTab.id, { type: "VOLDECK_SCAN_MEDIA" });
    add(
      "media",
      "HTML5 media fallback",
      !scan?.error,
      scan?.error ? scan.error : `${scan?.found || 0} media element${scan?.found === 1 ? "" : "s"} on active tab`
    );
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    checkedAt: new Date().toISOString()
  };
}

async function setCapturedVolume(tabId, volume, mediaStreamId = null) {
  const nextVolume = Number(volume);

  if (nextVolume === 100) {
    return sendToOffscreen({
      type: "VOLDECK_RELEASE_CAPTURE",
      tabId
    }).catch(() => ({ captured: false, released: false, volume: 100 }));
  }

  const existing = await sendToOffscreen({
    type: "VOLDECK_GET_CAPTURE_STATE",
    tabId
  });

  return sendToOffscreen({
    type: "VOLDECK_SET_CAPTURE_VOLUME",
    tabId,
    volume: nextVolume,
    mediaStreamId,
    hasExistingCapture: Boolean(existing?.captured)
  });
}

chrome.runtime.onInstalled.addListener(() => {
  VolumeDeckStorage.ensureDefaults();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "VOLDECK_GET_TABS") {
    queryTabs()
      .then((tabs) => sendResponse({ ok: true, tabs }))
      .catch((error) => sendResponse({ ok: false, error: error.message, tabs: [] }));
    return true;
  }

  if (message.type === "VOLDECK_GET_TAB") {
    getTabSnapshot(message.tabId)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "VOLDECK_SET_MUTED") {
    setMuted(message.tabId, message.muted)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "VOLDECK_SELF_CHECK") {
    runSelfCheck()
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        checkedAt: new Date().toISOString(),
        checks: [{ id: "self-check", label: "Self check runner", ok: false, detail: error.message }]
      }));
    return true;
  }

  if (message.type === "VOLDECK_SET_VOLUME") {
    setCapturedVolume(message.tabId, message.volume, message.mediaStreamId)
      .then(async (result) => {
        if (Number(message.volume) === 100) {
          const fallback = await sendToTab(message.tabId, {
            type: "VOLDECK_SET_MEDIA_VOLUME",
            volume: 100
          });
          return { ok: true, method: "reset", ...result, fallback };
        }

        if (result?.captured) {
          return { ok: true, method: "tabCapture", ...result };
        }

        const fallback = await sendToTab(message.tabId, {
          type: "VOLDECK_SET_MEDIA_VOLUME",
          volume: message.volume
        });

        return {
          ok: Boolean(fallback?.found),
          method: fallback?.found ? "html5" : "none",
          captured: false,
          fallback,
          error: fallback?.found ? result?.error || message.captureError || null : result?.error || message.captureError || fallback?.error
        };
      })
      .catch(async (error) => {
        const fallback = await sendToTab(message.tabId, {
          type: "VOLDECK_SET_MEDIA_VOLUME",
          volume: message.volume
        });
        return {
          ok: Boolean(fallback?.found),
          method: fallback?.found ? "html5" : "none",
          captured: false,
          fallback,
          error: fallback?.found ? null : error.message
        };
      })
      .then(sendResponse);
    return true;
  }

  if (message.type === "VOLDECK_SOLO_TAB") {
    queryTabs()
      .then((tabs) =>
        Promise.all(
          tabs.map((tab) => setMuted(tab.id, tab.id !== message.tabId))
        )
      )
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id) return;

  if (command === "toggle-solo-tab") {
    const tabs = await queryTabs();
    const othersMuted = tabs.filter((tab) => tab.id !== activeTab.id).every((tab) => tab.muted);
    await Promise.all(tabs.map((tab) => setMuted(tab.id, othersMuted ? false : tab.id !== activeTab.id)));
  }

  if (command === "mute-all-tabs") {
    const tabs = await queryTabs();
    await Promise.all(tabs.map((tab) => setMuted(tab.id, true)));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sendToOffscreen({
    type: "VOLDECK_RELEASE_CAPTURE",
    tabId
  }).catch(() => undefined);
});
