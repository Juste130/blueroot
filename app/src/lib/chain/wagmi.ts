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

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
