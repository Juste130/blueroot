import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("certificate");
  return { title: `${t("lookupTitle")} · BlueRoot` };
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** Works without JavaScript: a GET form that redirects to the certificate page. */
export default async function CertificateLookup({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { tx } = await searchParams;
  const value = tx?.trim();
  if (value && TX_HASH.test(value)) redirect({ href: `/certificates/${value.toLowerCase()}`, locale });
  const t = await getTranslations("certificate");
  const invalid = Boolean(value);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">{t("lookupTitle")}</h1>
      <p className="measure mt-3 text-muted">{t("lookupIntro")}</p>
      <form method="get" className="mt-8" noValidate>
        <label htmlFor="tx" className="block font-semibold">
          {t("txLabel")}
        </label>
        <p id="tx-hint" className="mt-1 text-sm text-muted">
          {t("txHint")}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="tx"
            name="tx"
            defaultValue={value}
            required
            pattern="0x[0-9a-fA-F]{64}"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={invalid ? "tx-hint tx-error" : "tx-hint"}
            aria-invalid={invalid || undefined}
            className="figures min-w-0 flex-1 rounded-control border border-line bg-surface px-3 py-2.5 aria-invalid:border-bad"
          />
          <button type="submit" className="rounded-control bg-tide px-5 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft dark:bg-roots dark:text-tide">
            {t("submit")}
          </button>
        </div>
        {invalid ? (
          <p id="tx-error" role="alert" className="mt-2 text-sm text-bad">
            {t("txInvalid")}
          </p>
        ) : null}
      </form>
    </div>
  );
}
