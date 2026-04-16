import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://filum.vercel.app"
  ),
  title: "Filum",
  description: "AI 기반 창의 리서치 엔진 — 아이디어의 실을 잇다",
  applicationName: "Filum",
  appleWebApp: {
    capable: true,
    title: "Filum",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
    other: [
      { rel: "android-chrome-192x192", url: "/android-chrome-192x192.png" },
      { rel: "android-chrome-512x512", url: "/android-chrome-512x512.png" },
    ],
  },
  openGraph: {
    type: "website",
    title: "Filum",
    description: "AI 기반 창의 리서치 엔진 — 아이디어의 실을 잇다",
    images: [
      {
        url: "/filum-og.jpg",
        width: 1200,
        height: 630,
        alt: "Filum — Creative Research Engine",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Filum",
    description: "AI 기반 창의 리서치 엔진 — 아이디어의 실을 잇다",
    images: ["/filum-og.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
