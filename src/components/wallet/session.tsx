"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type Address, type Hex, isAddressEqual } from "viem";
import { createSiweMessage } from "viem/siwe";
import { useConnection, useSignMessage } from "wagmi";
import { chain } from "@/lib/chain/config";

type SessionState = {
  /** Address proven by a SIWE signature, if any. */
  address: Address | null;
  status: "loading" | "signed-out" | "signing" | "signed-in";
  error: "rejected" | "failed" | null;
  /** Signs in with the connected wallet, or with `sign` when given (Privy embedded wallets). */
  signIn: (sign?: (message: string) => Promise<Hex>) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <Providers>");
  return value;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { address: connected } = useConnection();
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const [address, setAddress] = useState<Address | null>(null);
  const [status, setStatus] = useState<SessionState["status"]>("loading");
  const [error, setError] = useState<SessionState["error"]>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json() as Promise<{ session: { address: Address } | null }>)
      .then(({ session }) => {
        setAddress(session?.address ?? null);
        setStatus(session ? "signed-in" : "signed-out");
      })
      .catch(() => setStatus("signed-out"));
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    setAddress(null);
    setStatus("signed-out");
  }, []);

  // A session belongs to one wallet: switching account in the wallet ends it.
  useEffect(() => {
    if (status === "signed-in" && address && connected && !isAddressEqual(address, connected)) void signOut();
  }, [connected, address, status, signOut]);

  const signIn = useCallback(async (sign?: (message: string) => Promise<Hex>) => {
    if (!connected) return;
    setError(null);
    setStatus("signing");
    try {
      const { nonce } = (await (await fetch("/api/auth/nonce")).json()) as { nonce: string };
      const now = new Date();
      const message = createSiweMessage({
        domain: window.location.host,
        uri: window.location.origin,
        address: connected,
        chainId: chain.id,
        nonce,
        version: "1",
        statement: "BlueRoot: sign in with this wallet. This signature costs nothing and authorizes no transaction.",
        issuedAt: now,
        expirationTime: new Date(now.getTime() + 10 * 60_000),
      });
      const signature = sign ? await sign(message) : await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) throw new Error("verify");
      setAddress(((await res.json()) as { address: Address }).address);
      setStatus("signed-in");
    } catch (e) {
      const rejected = (e as { name?: string }).name === "UserRejectedRequestError" || /reject|denied/i.test(String((e as Error).message));
      setError(rejected ? "rejected" : "failed");
      setStatus("signed-out");
    }
  }, [connected, signMessageAsync]);

  return <SessionContext.Provider value={{ address, status, error, signIn, signOut }}>{children}</SessionContext.Provider>;
}
