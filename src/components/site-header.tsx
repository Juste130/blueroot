import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { LogoMark } from "./logo-mark";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";
import { WalletButton } from "./wallet/wallet-button";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  return (
    <header className="sticky top-0 z-40 border-b print:hidden border-line bg-paper/92 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-control" aria-label="BlueRoot">
          <LogoMark className="h-9 w-auto" />
          <span className="text-lg font-extrabold tracking-[-0.02em]">
            Blue<span className="text-ok">Root</span>
          </span>
        </Link>
        <nav aria-label={t("primary")} className="ml-4 hidden lg:block">
          <NavLinks />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>
          <WalletButton />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
