import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discoverability Score: GEO Audit",
  description:
    "Scan any page for how well it's built to be read, quoted, and cited by AI answer engines.",
  openGraph: {
    title: "Discoverability Score: GEO Audit",
    description:
      "Scan any page for how well it's built to be read, quoted, and cited by AI answer engines.",
    url: "https://discoverability-score.vercel.app",
    siteName: "Discoverability Score",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Discoverability Score: GEO Audit",
    description:
      "Scan any page for how well it's built to be read, quoted, and cited by AI answer engines.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-display antialiased">{children}</body>
    </html>
  );
}
