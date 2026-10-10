import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Held — Decide before you build",
  description:
    "A guided path to answer one hard product question with real people before expensive engineering. No design-sprint experience required.",
  openGraph: {
    title: "Held — Decide before you build",
    description:
      "Name the bet, explore real options, choose as the Decider, fake a product, watch five real people, leave with a Verdict Packet.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={body.variable}>{children}</body>
    </html>
  );
}
