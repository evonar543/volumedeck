const captures = new Map();

function numericTabId(tabId) {
  return Number(tabId);
}

function closeCapture(tabId) {
  const key = numericTabId(tabId);
  const capture = captures.get(key);
  if (!capture) return false;

  capture.source.disconnect();
  capture.gain.disconnect();
  capture.stream.getTracks().forEach((track) => track.stop());
  capture.context.close();
  captures.delete(key);
  return true;
}

async function createCapture(tabId, mediaStreamId) {
  const key = numericTabId(tabId);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: mediaStreamId
      }
    },
    video: false
  });

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain();
  const analyser = context.createAnalyser();

  analyser.fftSize = 64;
  source.connect(gain);
  gain.connect(analyser);
  analyser.connect(context.destination);

  const capture = { context, source, gain, analyser, stream, volume: 100 };
  captures.set(key, capture);
  return capture;
}

async function setCaptureVolume(tabId, volume, mediaStreamId, hasExistingCapture = false) {
  const key = numericTabId(tabId);
  const nextVolume = Number(volume);

  if (nextVolume === 100 && captures.has(key)) {
    closeCapture(key);
    return { captured: false, released: true, volume: 100 };
  }

  let capture = captures.get(key);
  if (!capture) {
    if (!mediaStreamId) {
      return {
        captured: false,
        volume: nextVolume,
        error: hasExistingCapture ? "Capture state was lost. Move the slider again." : "Missing tab audio stream permission."
      };
    }
    capture = await createCapture(key, mediaStreamId);
  }

  if (capture.context.state === "suspended") {
    await capture.context.resume();
  }

  capture.volume = nextVolume;
  capture.gain.gain.value = Math.max(0, nextVolume / 100);
  return { captured: true, volume: nextVolume };
}

function getCaptureState(tabId) {
  const capture = captures.get(numericTabId(tabId));
  return {
    captured: Boolean(capture),
    volume: capture?.volume || 100
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "VOLDECK_OFFSCREEN") return false;

  if (message.type === "VOLDECK_GET_CAPTURE_STATE") {
    sendResponse(getCaptureState(message.tabId));
    return true;
  }

  if (message.type === "VOLDECK_SET_CAPTURE_VOLUME") {
    setCaptureVolume(message.tabId, message.volume, message.mediaStreamId, message.hasExistingCapture)
      .then(sendResponse)
      .catch((error) => sendResponse({ captured: false, error: error.message }));
    return true;
  }

  if (message.type === "VOLDECK_RELEASE_CAPTURE") {
    sendResponse({ released: closeCapture(message.tabId) });
    return true;
  }

  return false;
});
