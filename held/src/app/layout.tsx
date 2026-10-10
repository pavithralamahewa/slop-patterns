import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const body = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "600", "700", "800"],
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
