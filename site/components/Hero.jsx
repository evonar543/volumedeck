const repoUrl = "https://github.com/evonar543/volumedeck";
const extensionUrl = `${repoUrl}/tree/main/extension`;
const siteUrl = `${repoUrl}/tree/main/site`;

export default function Hero() {
  return (
    <section className="hero">
      <nav className="nav" aria-label="Main navigation">
        <a className="mark" href="#top" aria-label="VolumeDeck home">VolumeDeck</a>
        <div>
          <a href="#what-it-is">What it is</a>
          <a href={extensionUrl}>Extension</a>
          <a href={siteUrl}>Website</a>
          <a href={repoUrl}>GitHub</a>
        </div>
      </nav>

      <div className="hero-copy">
        <p className="eyebrow">Browser audio, organized</p>
        <h1>VolumeDeck</h1>
        <p className="lede">A clean audio control deck for every tab in your browser.</p>
        <p className="description">
          VolumeDeck is a Chrome Extension prototype for people who keep many tabs open. It brings
          tab muting, solo mode, per-tab levels, presets, and domain rules into one focused popup.
        </p>
        <div className="hero-actions">
          <a className="button primary" href={repoUrl}>GitHub repository</a>
          <a className="button" href={extensionUrl}>View extension source</a>
          <a className="button ghost" href="#what-it-is">Read overview</a>
        </div>
      </div>
    </section>
  );
}
