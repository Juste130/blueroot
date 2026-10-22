import "../globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NetworkNotice } from "@/components/network-notice";
import { Providers } from "@/components/providers";
import { ServiceWorker } from "@/components/service-worker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { routing } from "@/i18n/routing";
import { getDeployment } from "@/lib/chain/deployment";
import { getRegistry } from "@/lib/registry/indexer";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F9F8" },
    { media: "(prefers-color-scheme: dark)", color: "#071F30" },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    alternates: { languages: { en: "/en", fr: "/fr", "x-default": "/en" } },
    manifest: "/manifest.webmanifest",
    openGraph: { title: t("title"), description: t("description"), siteName: "BlueRoot", locale },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("nav");
  const snapshot = await getRegistry();

  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <NextIntlClientProvider>
          <Providers deployment={getDeployment()}>
            <a
              href="#main"
              className="sr-only z-50 rounded-control bg-tide px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
            >
              {t("skip")}
            </a>
            <SiteHeader />
            <NetworkNotice status={snapshot.status} />
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <SiteFooter />
            <ServiceWorker />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
