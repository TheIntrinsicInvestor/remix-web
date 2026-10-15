import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Satoshi (Fontshare, ITF Free Font License - see fonts/Satoshi-LICENSE.txt).
// Self-hosted via next/font/local: no external request, no CLS.
const satoshi = localFont({
  src: "./fonts/Satoshi-Variable.woff2",
  variable: "--font-satoshi",
  weight: "300 900",
  display: "swap",
});

// Mono is scoped to the technical writeup and the stem labels only.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://your-frontend.example.com"),
  title: "Remix",
  description:
    "A tool that splits a song into its parts. Vocals, drums, bass and other, separated with demucs and served as files you can sing over.",
  openGraph: {
    title: "Remix",
    description:
      "A tool that splits a song into its parts. Vocals, drums, bass and other, separated with demucs.",
    url: "/",
    siteName: "Remix",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Four separated waveforms rendered as machined silver slabs." }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Remix",
    description: "A tool that splits a song into its parts.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${satoshi.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
