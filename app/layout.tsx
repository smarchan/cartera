import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartera",
  description: "Seguimiento de cartera de inversión en tiempo real, multidivisa.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0a0b", width: "device-width", initialScale: 1 };

const appearance = {
  variables: {
    colorPrimary: "#f2f2f3",
    colorPrimaryForeground: "#0a0a0b",
    colorBackground: "#111113",
    colorForeground: "#f2f2f3",
    colorMutedForeground: "#9b9ba3",
    colorInput: "#0a0a0b",
    colorInputForeground: "#f2f2f3",
    colorNeutral: "#f2f2f3",
    borderRadius: "8px",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ClerkProvider localization={esES} appearance={appearance} signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/sign-in">
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
