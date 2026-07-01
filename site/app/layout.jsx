import "./globals.css";

export const metadata = {
  title: "VolumeDeck - Browser Tab Volume Manager",
  description: "A clean audio control deck for every tab in your browser.",
  openGraph: {
    title: "VolumeDeck",
    description: "A clean audio control deck for every tab in your browser.",
    url: "https://github.com/evonar543/volumedeck",
    siteName: "VolumeDeck"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
