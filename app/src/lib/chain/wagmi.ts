import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain } from "./config";

/**
 * Injected wallets only (MetaMask, Rabby, Coinbase Wallet extension, mobile wallet browsers): no
 * third-party relay, no extra script origin in the CSP.
 */
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http() },
  ssr: true,
});

/** With Privy configured, Privy supplies the connectors (embedded and external wallets). */
export const privyWagmiConfig = createPrivyConfig({
  chains: [chain],
  transports: { [chain.id]: http() },
  ssr: true,
});

// Same chain and transport in both configs; Privy's connector list is the wider type, so both providers accept it.
declare module "wagmi" {
  interface Register {
    config: typeof privyWagmiConfig;
  }
}
