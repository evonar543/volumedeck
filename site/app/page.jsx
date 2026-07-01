import Hero from "../components/Hero";
import Footer from "../components/Footer";

const repoUrl = "https://github.com/evonar543/volumedeck";

const capabilities = [
  "Detect audible tabs with the Chrome tabs API.",
  "Mute, unmute, and solo tabs with native Chrome controls.",
  "Adjust HTML5 audio and video elements when a page exposes them.",
  "Save presets for gaming, studying, movies, music, and quiet browsing.",
  "Apply domain rules such as keeping Spotify lower or YouTube louder.",
  "Import and export settings as JSON."
];

const links = [
  ["Repository", repoUrl],
  ["Extension source", `${repoUrl}/tree/main/extension`],
  ["Website source", `${repoUrl}/tree/main/site`],
  ["README", `${repoUrl}/blob/main/README.md`],
  ["License", `${repoUrl}/blob/main/LICENSE`]
];

export default function Home() {
  return (
    <main>
      <Hero />

      <section id="what-it-is" className="section statement">
        <p className="eyebrow">What it is</p>
        <h2>
          VolumeDeck is a Manifest V3 browser extension prototype that treats tabs like channels
          on a small audio mixer.
        </h2>
        <p>
          The popup is built for fast decisions: turn a tab down, mute the noisy one, solo the
          thing you are listening to, or save a preset for the way you browse. The website is the
          companion page for the project and links directly to the source.
        </p>
      </section>

      <section className="section two-column" aria-labelledby="capabilities-title">
        <div>
          <p className="eyebrow">What it does</p>
          <h2 id="capabilities-title">Practical controls for messy browser audio.</h2>
        </div>
        <ul className="text-list">
          {capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>

      <section className="section two-column" id="how-it-works">
        <div>
          <p className="eyebrow">How it works</p>
          <h2>Chrome APIs for reliable mute, content scripts for HTML5 media.</h2>
        </div>
        <ol className="steps">
          <li>Detects audible tabs and recently active pages.</li>
          <li>Applies saved domain rules before you reach for the slider.</li>
          <li>Lets users control browser audio from one compact popup.</li>
          <li>Uses content scripts for HTML5 audio and video where possible.</li>
          <li>Falls back to Chrome tab muting when deep media control is unavailable.</li>
        </ol>
      </section>

      <section className="section two-column">
        <div>
          <p className="eyebrow">Project links</p>
          <h2>Everything lives in one public GitHub repository.</h2>
          <p>
            The repository separates the Chrome extension and the Vercel site so each part can
            evolve without becoming tangled with the other.
          </p>
        </div>
        <div className="link-list">
          {links.map(([label, href]) => (
            <a key={label} href={href}>{label}</a>
          ))}
        </div>
      </section>

      <section className="section statement">
        <p className="eyebrow">Limitations</p>
        <h2>Browser audio control has boundaries.</h2>
        <p>
          Some sites do not expose controllable media elements, and browser extensions cannot
          reliably boost every audio source. VolumeDeck keeps native tab muting as the dependable
          fallback while using content scripts where page-level media control is available.
        </p>
      </section>

      <Footer />
    </main>
  );
}
