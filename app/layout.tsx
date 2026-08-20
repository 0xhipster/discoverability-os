import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Discoverability Score: GEO Audit",
  description:
    "Scan any page for how well it's built to be read, quoted, and cited by AI answer engines.",
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
