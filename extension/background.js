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

async function setMuted(tabId, muted) {
  await chrome.tabs.update(tabId, { muted });
  return { ok: true, tabId, muted };
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { found: 0, error: error.message };
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

async function setCapturedVolume(tabId, volume) {
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

  let mediaStreamId = null;
  if (!existing?.captured) {
    mediaStreamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  }

  return sendToOffscreen({
    type: "VOLDECK_SET_CAPTURE_VOLUME",
    tabId,
    volume: nextVolume,
    mediaStreamId
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

  if (message.type === "VOLDECK_SET_MUTED") {
    setMuted(message.tabId, message.muted)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "VOLDECK_SET_VOLUME") {
    setCapturedVolume(message.tabId, message.volume)
      .catch(async (error) => {
        const fallback = await sendToTab(message.tabId, {
          type: "VOLDECK_SET_MEDIA_VOLUME",
          volume: message.volume
        });
        return {
          ok: false,
          captured: false,
          fallback,
          error: error.message
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
