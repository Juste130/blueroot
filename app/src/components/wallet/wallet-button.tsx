"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "@/lib/chain/config";
import { shortHex } from "@/lib/format";
import { usePrivyAuth } from "./privy";
import { useSession } from "./session";
import { useRoles } from "./use-roles";

const button =
  "inline-flex h-10 items-center gap-2 rounded-control px-3.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-70";

export function WalletButton() {
  const t = useTranslations("wallet");
  const { address, chainId, isConnected } = useConnection();
  const { mutate: connect, isPending: connecting } = useConnect();
  const connectors = useConnectors();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const session = useSession();
  const privy = usePrivyAuth();
  const { roles } = useRoles(session.address);
  const [open, setOpen] = useState(false);
  const [noWallet, setNoWallet] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!isConnected && privy) {
    // Privy: one button for email, SMS, Google or an external wallet. While Privy restores a session
    // (or wagmi picks up the new wallet), the button waits.
    const waiting = !privy.ready || privy.authenticated;
    return (
      <button
        type="button"
        disabled={waiting}
        onClick={privy.login}
        className={`${button} bg-tide text-paper hover:bg-tide-soft dark:bg-roots dark:text-tide`}
      >
        {waiting ? t("connecting") : t("login")}
      </button>
    );
  }

  if (!isConnected) {
    return (
      <div className="relative">
        <button
          type="button"
          disabled={connecting}
          onClick={() => {
            const injected = connectors[0];
            if (typeof window !== "undefined" && !(window as { ethereum?: unknown }).ethereum) return setNoWallet(true);
            // Asking for the app chain here folds the network switch into the connect prompt.
            if (injected) connect({ connector: injected, chainId: chain.id });
          }}
          className={`${button} bg-tide text-paper hover:bg-tide-soft dark:bg-roots dark:text-tide`}
        >
          {connecting ? t("connecting") : t("connect")}
        </button>
        {noWallet ? (
          <p role="alert" className="absolute right-0 top-12 z-50 w-72 rounded-panel border border-line bg-surface p-4 text-sm shadow-lg">
            {t("noWallet")}
          </p>
        ) : null}
      </div>
    );
  }

  if (chainId !== chain.id) {
    return (
      <button type="button" disabled={switching} onClick={() => switchChain({ chainId: chain.id })} className={`${button} bg-bad text-white`}>
        {t("wrongNetwork", { network: chain.name })}
      </button>
    );
  }

  if (session.status !== "signed-in") {
    return (
      <div className="relative">
        <button
          type="button"
          disabled={session.status === "signing" || session.status === "loading"}
          onClick={() => void session.signIn()}
          className={`${button} bg-tide text-paper hover:bg-tide-soft dark:bg-roots dark:text-tide`}
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-mangrove" />
          {session.status === "signing" ? t("signingIn") : t("signIn")}
        </button>
        {session.error ? (
          <p role="alert" className="absolute right-0 top-12 z-50 w-72 rounded-panel border border-bad/30 bg-surface p-3 text-sm text-bad shadow-lg">
            {t(session.error === "rejected" ? "rejected" : "signInError")}
          </p>
        ) : null}
      </div>
    );
  }

  const roleList = (Object.keys(roles) as (keyof typeof roles)[]).filter((r) => roles[r]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`${button} figures border border-line hover:bg-roots/40`}
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-mangrove" />
        <span className="sr-only">{t("signedInAs", { address: address! })}</span>
        <span aria-hidden="true">{shortHex(address!, 6, 4)}</span>
      </button>
      {open ? (
        <div id={panelId} className="absolute right-0 top-12 z-50 w-72 rounded-panel border border-line bg-surface p-4 text-sm shadow-lg">
          {privy?.label ? <p className="font-semibold">{privy.label}</p> : null}
          <p className="figures break-all text-muted">{address}</p>
          {privy?.embedded ? <p className="mt-2 text-xs text-ok">{t("sponsored")}</p> : null}
          <h2 className="mt-4 text-xs font-semibold tracking-normal text-muted">{t("roles")}</h2>
          {roleList.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {roleList.map((r) => (
                <li key={r} className="rounded-chip bg-roots/60 px-2 py-0.5 text-xs font-semibold text-tide">
                  {t(`role.${r}`)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">{t("noRole")}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => {
                void session.signOut();
                if (privy) void privy.logout();
              }}
              className="rounded-control px-2 py-1.5 text-left font-medium hover:bg-roots/40"
            >
              {t("signOut")}
            </button>
            {privy ? null : (
              <button
                type="button"
                onClick={() => {
                  void session.signOut();
                  disconnect();
                }}
                className="rounded-control px-2 py-1.5 text-left font-medium text-muted hover:bg-roots/40 hover:text-ink"
              >
                {t("disconnect")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
