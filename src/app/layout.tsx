import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/data/site-config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} | ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "musician",
    "Northern Colorado",
    "live music",
    "acoustic",
    "entertainment",
    "wedding music",
    "corporate events",
    ...siteConfig.genres,
  ],
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: siteConfig.name,
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
