"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { WagmiProvider } from "wagmi";
import type { Deployment } from "@/lib/chain/config";
import { wagmiConfig } from "@/lib/chain/wagmi";
import { PRIVY_APP_ID, PrivyAutoSignIn, PrivyLayer } from "./wallet/privy";
import { SessionProvider } from "./wallet/session";

const DeploymentContext = createContext<Deployment | null>(null);

/** Contract addresses of the configured chain, or null until the contracts are deployed. */
export function useDeployment(): Deployment | null {
  return useContext(DeploymentContext);
}

export function Providers({ deployment, children }: { deployment: Deployment | null; children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 2 } } }));
  const app = (
    <DeploymentContext.Provider value={deployment}>
      <SessionProvider>
        {PRIVY_APP_ID ? <PrivyAutoSignIn /> : null}
        {children}
      </SessionProvider>
    </DeploymentContext.Provider>
  );

  // With a Privy app id: email/SMS/wallet login, embedded wallets and sponsored gas. Without: injected wallets.
  if (PRIVY_APP_ID) {
    return (
      <PrivyLayer appId={PRIVY_APP_ID} queryClient={queryClient}>
        {app}
      </PrivyLayer>
    );
  }
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
    </WagmiProvider>
  );
}
