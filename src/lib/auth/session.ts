import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Address } from "viem";

/**
 * Wallet sessions (F1). No password and no personal data: the session only holds the address proven
 * by a SIWE signature. Roles are always read on-chain at the time of the request, never cached here.
 */
const SESSION_COOKIE = "br_session";
const NONCE_COOKIE = "br_nonce";
const SESSION_TTL = 8 * 60 * 60; // seconds
const NONCE_TTL = 5 * 60;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ characters) is required");
    return new TextEncoder().encode("development-only-session-secret-not-for-production");
  }
  return new TextEncoder().encode(value);
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge,
});

async function sign(payload: Record<string, unknown>, ttl: number, audience: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
}

async function read<T>(name: string, audience: string): Promise<T | null> {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience, algorithms: ["HS256"] });
    return payload as T;
  } catch {
    return null;
  }
}

export async function issueNonce(nonce: string): Promise<void> {
  (await cookies()).set(NONCE_COOKIE, await sign({ nonce }, NONCE_TTL, "siwe-nonce"), cookieOptions(NONCE_TTL));
}

/** Returns the pending nonce and deletes it: a nonce can be used once only (no replay). */
export async function consumeNonce(): Promise<string | null> {
  const payload = await read<{ nonce: string }>(NONCE_COOKIE, "siwe-nonce");
  (await cookies()).delete(NONCE_COOKIE);
  return payload?.nonce ?? null;
}

export interface Session {
  address: Address;
  chainId: number;
}

export async function startSession(session: Session): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await sign({ ...session }, SESSION_TTL, "session"), cookieOptions(SESSION_TTL));
}

export async function getSession(): Promise<Session | null> {
  const payload = await read<Session>(SESSION_COOKIE, "session");
  return payload ? { address: payload.address, chainId: payload.chainId } : null;
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Proof that a report was produced by this server for this owner (1 hour). Without it, anyone could
 * pin a hand-made report on IPFS and ask the server to anchor it.
 */
export async function signReportToken(claims: { hash: string; projectId: number; owner: Address }): Promise<string> {
  return sign({ ...claims }, 60 * 60, "report-submit");
}

export async function verifyReportToken(token: string): Promise<{ hash: `0x${string}`; projectId: number; owner: Address } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "report-submit", algorithms: ["HS256"] });
    return payload as unknown as { hash: `0x${string}`; projectId: number; owner: Address };
  } catch {
    return null;
  }
}
