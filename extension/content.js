(function () {
  if (window.__volumedeckContentReady) return;
  window.__volumedeckContentReady = true;

  let requestedVolume = 100;
  let mediaMuted = false;

  function mediaElements() {
    return Array.from(document.querySelectorAll("audio, video"));
  }

  function applyMediaState() {
    const nativeVolume = Math.max(0, Math.min(requestedVolume / 100, 1));
    const elements = mediaElements();
    elements.forEach((media) => {
      media.volume = nativeVolume;
      media.muted = mediaMuted || requestedVolume === 0;
      media.dataset.volumedeckVolume = String(requestedVolume);
    });

    const verified = elements.every((media) => {
      return media.volume === nativeVolume && media.muted === (mediaMuted || requestedVolume === 0);
    });

    return {
      found: elements.length,
      requestedVolume,
      appliedNativeVolume: Math.round(nativeVolume * 100),
      boostedBeyondNative: requestedVolume > 100,
      verified,
      partial: requestedVolume > 100,
      error: elements.length ? null : "No HTML5 audio or video elements found on this page."
    };
  }

  const observer = new MutationObserver(() => {
    if (requestedVolume !== 100 || mediaMuted) applyMediaState();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "VOLDECK_SET_MEDIA_VOLUME") {
      requestedVolume = Number(message.volume || 100);
      sendResponse(applyMediaState());
      return true;
    }

    if (message.type === "VOLDECK_MUTE_MEDIA") {
      mediaMuted = Boolean(message.muted);
      sendResponse(applyMediaState());
      return true;
    }

    if (message.type === "VOLDECK_SCAN_MEDIA") {
      sendResponse({ found: mediaElements().length });
      return true;
    }

    return false;
  });
})();
