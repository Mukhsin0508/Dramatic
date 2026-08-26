import type { Metadata } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const editorial = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Dramatic — You choose what happens next",
  description:
    "Short dramas that listen back. Watch the cliffhanger, make the call, and help shape tomorrow's episode.",
  openGraph: {
    title: "Dramatic — You choose what happens next",
    description:
      "Watch tonight. Choose the twist. Come back tomorrow for the episode you helped write.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Dramatic — You choose what happens next",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dramatic — You choose what happens next",
    description:
      "Watch tonight. Choose the twist. Come back tomorrow for the episode you helped write.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${editorial.variable}`}>
      <body>{children}</body>
    </html>
  );
}
