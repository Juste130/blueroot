import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnchorNode, Hash } from "@/components/hash";
import { LogoMark } from "@/components/logo-mark";
import { PrintButton } from "@/components/print-button";
import { Link } from "@/i18n/navigation";
import { addressUrl, txUrl } from "@/lib/chain/config";
import { getCertificates } from "@/lib/certificates";
import { formatDate, formatNumber, unitsToHaYears } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; txHash: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("certificate");
  return { title: `${t("title")} · BlueRoot`, robots: { index: false } };
}

export default async function CertificatePage({ params }: Params) {
  const { locale, txHash } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("certificate");
  const common = await getTranslations("common");
  const result = await getCertificates(txHash);

  if (result.status !== "ok") {
    const message = result.status === "not-deployed" ? t("notDeployed") : result.status === "invalid" ? t("txInvalid") : t("notFound");
    return (
      <div className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
        <h1 className="text-3xl">{t("title")}</h1>
        <p role="alert" className="mt-6 rounded-panel border border-bad/30 bg-bad/10 p-4">
          {message}
        </p>
        <Link href="/certificates" className="mt-6 inline-block font-semibold underline decoration-line underline-offset-4">
          {t("lookupTitle")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 pt-12 sm:px-6 print:max-w-none print:p-0">
      {result.certificates.map((c) => {
        const tx = txUrl(c.txHash);
        return (
          <article key={c.retirementId} aria-labelledby={`cert-${c.retirementId}`} className="rounded-panel border border-line bg-surface p-6 sm:p-10 print:border-0">
            <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-anchor">
                  <AnchorNode label={common("anchored")} />
                  {t("valid")}
                </p>
                <h1 id={`cert-${c.retirementId}`} className="mt-2 text-2xl sm:text-3xl">
                  {t("title")} <span className="figures text-muted">n° {c.retirementId}</span>
                </h1>
              </div>
              <LogoMark className="h-14 w-auto shrink-0" />
            </header>

            <div className="py-8">
              <p className="text-sm text-muted">{t("retiredFor")}</p>
              <p className="mt-1 text-2xl font-bold">{c.reason?.beneficiaryName ?? <Hash value={c.beneficiary} label={t("beneficiaryWallet")} />}</p>
              <p className="figures mt-6 text-4xl font-bold tracking-[-0.02em]">{formatNumber(locale, c.amount)}</p>
              <p className="text-muted">{t("amountValue", { amount: formatNumber(locale, c.amount), ha: formatNumber(locale, unitsToHaYears(c.amount), 2) })}</p>
              {c.reason ? (
                <blockquote className="measure mt-6 border-l-2 border-lagoon pl-4">
                  <p className="text-sm text-muted">{t("reason")}</p>
                  <p className="mt-1">{c.reason.reason}</p>
                </blockquote>
              ) : (
                <p className="mt-6 text-sm text-muted">{t("reasonUnverified")}</p>
              )}
            </div>

            <dl className="grid gap-x-8 gap-y-4 border-t border-line pt-6 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t("project")}</dt>
                <dd className="font-semibold">
                  <Link href={`/projects/${c.projectId}`} className="underline decoration-line underline-offset-4 hover:decoration-current">
                    {c.projectName ?? `#${c.projectId}`}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("vintage")}</dt>
                <dd className="figures font-semibold">{c.vintage}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("date")}</dt>
                <dd className="font-semibold">{formatDate(locale, c.timestamp)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("account")}</dt>
                <dd className="font-semibold">
                  <Hash value={c.account} label={t("account")} href={addressUrl(c.account)} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">{t("tx")}</dt>
                <dd className="font-semibold">
                  <Hash value={c.txHash} label={t("tx")} href={tx} anchored full />
                </dd>
              </div>
              {c.reportHashes.map((h) => (
                <div key={h} className="sm:col-span-2">
                  <dt className="text-muted">{t("report")}</dt>
                  <dd className="font-semibold">
                    <Hash value={h} label={t("report")} anchored full />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-sm text-muted">{t("permanent")}</p>
          </article>
        );
      })}
      <div className="print:hidden">
        <PrintButton label={t("print")} />
      </div>
    </div>
  );
}
