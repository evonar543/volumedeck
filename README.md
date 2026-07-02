# VolumeDeck

**A clean audio control deck for every tab in your browser.**

VolumeDeck is a Chrome Extension Manifest V3 prototype plus a Vercel-ready product site. The extension is designed like a premium mini audio mixer for the browser, with per-tab controls, presets, domain rules, mute/solo workflows, and a polished popup UI.

GitHub: https://github.com/evonar543/volumedeck
Website: https://site-rose-ten-88.vercel.app

## Features

- Per-tab volume controls from 0% to 600%
- One-click mute, unmute, solo, reset, and pin controls
- Master volume controls with reset, mute all, unmute all, and normalize actions
- Presets for Gaming, Study, Movie Night, Music Boost, and Quiet Browsing
- Domain rules such as YouTube boost, Spotify level, and auto-mute behavior
- Search and sorting by playing, loudest, recently active, domain, and pinned
- Chrome tab muting through `chrome.tabs.update`
- Real tab gain control through the MV3 `tabCapture` and `offscreen` APIs
- HTML5 audio/video control through content scripts where the page allows it
- Real Chrome tab data only, with clear empty states when opened outside extension mode
- Live popup refresh from Chrome tab events, with a short polling fallback
- Built-in self checks for storage, tab access, script injection, tab capture, and page media access
- Verified mute/unmute actions that read Chrome tab state back after updates
- Vercel-ready Next.js website with a CSS-built extension preview

## Folder Structure

```text
volumedeck/
  extension/
    manifest.json
    popup.html
    popup.css
    popup.js
    background.js
    content.js
    offscreen.html
    offscreen.js
    options.html
    options.css
    options.js
    storage.js
    icons/
  site/
    app/
    components/
    next.config.js
    package.json
  README.md
  LICENSE
  .gitignore
```

## Run the Vercel Site

```bash
cd site
npm install
npm run dev
```

The site uses Next.js App Router and can be deployed from the `/site` folder on Vercel.

## Load the Extension in Chrome

1. Open Chrome
2. Go to `chrome://extensions`
3. Enable Developer Mode
4. Click Load unpacked
5. Select the `/extension` folder

## Known Limitations

VolumeDeck uses Chrome's `tabCapture` API with an offscreen document to route captured tab audio through a Web Audio `GainNode`. That is the path used for real per-tab gain and boost behavior.

Some pages and browser-owned URLs cannot be captured or scripted. In those cases, native tab muting through Chrome APIs remains the dependable fallback, and content scripts attempt HTML5 audio/video control only when page media elements are available.

The popup only lists real `http` and `https` tabs. Chrome pages, extension pages, the Chrome Web Store, and other browser-owned URLs are intentionally hidden because Chrome will not allow VolumeDeck to capture or script them.

## Roadmap

- Real-time audio analysis
- Better cross-site support
- Firefox support
- Cloud preset sync
- More visual themes
- Keyboard shortcut customization
- Published Chrome Web Store version

## License

MIT
