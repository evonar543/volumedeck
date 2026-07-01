const repoUrl = "https://github.com/evonar543/volumedeck";

export default function Footer() {
  return (
    <footer className="footer">
      <strong>VolumeDeck</strong>
      <a href={repoUrl}>GitHub</a>
      <a href={`${repoUrl}/tree/main/extension`}>Extension</a>
      <a href={`${repoUrl}/tree/main/site`}>Website</a>
      <a href={`${repoUrl}/blob/main/LICENSE`}>MIT License</a>
      <span>Built for people who keep many tabs open.</span>
    </footer>
  );
}
