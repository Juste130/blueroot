import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  localePrefix: "always",
  // Everyone lands in English whatever the browser language; French stays one click away (and is remembered).
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
