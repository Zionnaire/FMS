import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/** Interface typeface, Institutional Intelligence (2026-11-14) — replaces Plus Jakarta Sans.
 * Reuses the existing `--font-plus-jakarta-sans` variable NAME (not renamed) so the ~160 existing
 * `font-sans`/body-text call sites across the app don't need touching to pick up the new font;
 * only `tailwind.config`'s/`@theme`'s `--font-sans` mapping and this one variable's value change. */
const interSans = Inter({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/** Role shrinks drastically under the new directive — "restrained display typeface only where
 * appropriate for major editorial headings," not every page's default h1 the way it was under
 * Botanical Precision. Still loaded; usage is being pared back page by page as each is re-skinned
 * (see docs/design/frontend-redesign-assessment.md), not removed in one pass. */
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
});

/** Forensic/reference-identifier typeface, Institutional Intelligence — replaces JetBrains Mono.
 * Same variable-name-reuse reasoning as `interSans` above. */
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "EFIMS Core",
  description: "Enterprise Financial Crime & Incident Orchestration Platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${interSans.variable} ${playfairDisplay.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-surface text-on-surface">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
