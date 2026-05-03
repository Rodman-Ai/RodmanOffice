import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { ThemeBoot } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "LeoCRM",
  description: "AI lead-generation CRM backed by Google Workspace",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "LeoCRM", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3a45d6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeBoot />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
