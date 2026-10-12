import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "InsightFlow", template: "%s · InsightFlow" },
  description:
    "Turn raw customer feedback into ranked, evidence-backed decisions: sentiment, recurring issues, priorities and recommended actions.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Lets the command trigger show the right shortcut (⌘K vs Ctrl K) before hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.toggle('os-macos',/Mac|iPhone|iPad/.test(navigator.platform))",
          }}
        />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
