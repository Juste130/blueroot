"use client";

import { PrivyProvider, useLogin, usePrivy, useSendTransaction, useSignMessage, useWallets } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { type Address, type Hex, isAddressEqual } from "viem";
import { useConnection } from "wagmi";
import { chain } from "@/lib/chain/config";
import { privyWagmiConfig } from "@/lib/chain/wagmi";
import { SponsorContext } from "../tx/use-write";
import { useSession } from "./session";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

type PrivyAuth = {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** The connected wallet is a Privy embedded wallet: gas is sponsored, signing needs no wallet app. */
  embedded: boolean;
  /** Email or phone the person signed in with, when there is one. */
  label: string | null;
};

const PrivyAuthContext = createContext<PrivyAuth | null>(null);

/** Privy state for the wallet button, or null when Privy is not configured (injected wallets only). */
export function usePrivyAuth(): PrivyAuth | null {
  return useContext(PrivyAuthContext);
}

/**
 * Privy layer (docs order: PrivyProvider > QueryClientProvider > Privy's WagmiProvider). Wagmi hooks keep
 * working everywhere: they see whichever wallet Privy made active, embedded or external.
 */
export function PrivyLayer({ appId, queryClient, children }: { appId: string; queryClient: QueryClient; children: React.ReactNode }) {
  const t = useTranslations("wallet");
  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Login methods (email, SMS, Google, wallets) are chosen in the Privy dashboard.
        appearance: { theme: "light", accentColor: "#0B3C5D", logo: "/icon.svg", landingHeader: t("privyHeader") },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={privyWagmiConfig}>
          <PrivyBridge>{children}</PrivyBridge>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, logout, user } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { address } = useConnection();

  const isEmbedded = useCallback(
    (account: Address) => wallets.some((w) => w.walletClientType === "privy" && isAddressEqual(w.address as Address, account)),
    [wallets],
  );

  const sponsor = useMemo(
    () => ({
      canSponsor: isEmbedded,
      // Privy native gas sponsorship ("App pays"): EIP-7702 delegation plus a paymaster, the wallet needs no POL.
      send: async (account: Address, tx: { to: Address; data: Hex }) =>
        (await sendTransaction({ to: tx.to, data: tx.data, chainId: chain.id }, { sponsor: true, address: account })).hash as Hex,
    }),
    [isEmbedded, sendTransaction],
  );

  const auth = useMemo<PrivyAuth>(
    () => ({
      ready,
      authenticated,
      login: () => login(),
      logout,
      embedded: !!address && isEmbedded(address),
      label: user?.email?.address ?? user?.phone?.number ?? user?.google?.email ?? null,
    }),
    [ready, authenticated, login, logout, address, isEmbedded, user],
  );

  return (
    <PrivyAuthContext.Provider value={auth}>
      <SponsorContext.Provider value={sponsor}>{children}</SponsorContext.Provider>
    </PrivyAuthContext.Provider>
  );
}

/**
 * Embedded wallets sign the SIWE message without a second prompt: the person just proved who they are
 * to Privy (email, SMS, Google), and the signature only opens a BlueRoot session, it moves nothing.
 * External wallets keep the explicit "Sign in" step.
 */
export function PrivyAutoSignIn() {
  const auth = usePrivyAuth();
  const session = useSession();
  const { signMessage } = useSignMessage();
  const { address } = useConnection();
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!auth?.authenticated || !auth.embedded || !address || session.status !== "signed-out" || tried.current === address) return;
    tried.current = address;
    void session.signIn(async (message) => (await signMessage({ message }, { uiOptions: { showWalletUIs: false }, address })).signature as Hex);
  }, [auth, address, session, signMessage]);

  // A new login (or account) may try again.
  useEffect(() => {
    if (!auth?.authenticated) tried.current = null;
  }, [auth?.authenticated]);

  return null;
}
