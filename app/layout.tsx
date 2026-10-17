import type { Metadata, Viewport } from "next";
import { Sora, Manrope, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { siteName, siteOrigin } from "@/lib/site";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  display: "swap",
});

// The site's own name and origin come from one module, shared with the emails
// we send: a member must not be told "Verify your X email" and then land on a
// page branded Y.
const siteUrl = siteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Global Traders HubX — Connect. Copy. Trade. Grow.",
    template: "%s · Global Traders HubX",
  },
  description:
    "Global Traders HubX is a digital trading community connecting traders and investors through copy trading, structured participation, referral networking, and a global trader community.",
  applicationName: siteName(),
  keywords: [
    "trading community",
    "copy trading",
    "traders network",
    "investment community",
    "referral network",
    "trading education",
    "global trading hub",
  ],
  authors: [{ name: siteName() }],
  openGraph: {
    type: "website",
    siteName: siteName(),
    title: "Global Traders HubX — Connect. Copy. Trade. Grow.",
    description:
      "A global community for traders and investors — copy trading, participation, networking, and education in one hub.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Global Traders HubX — Connect. Copy. Trade. Grow.",
    description:
      "A global community for traders and investors — copy trading, participation, networking, and education in one hub.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* Reveal animations start hidden; without JS they must never stay hidden. */}
        <noscript>
          <style>{`.reveal{opacity:1 !important;transform:none !important;}`}</style>
        </noscript>
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#121b2f",
              border: "1px solid rgba(212,167,44,0.22)",
              color: "#ffffff",
            },
          }}
        />
      </body>
    </html>
  );
}
