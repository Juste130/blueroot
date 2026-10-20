/**
 * End-to-end checks of the API routes against a running app (`npm run dev`) and the local chain
 * seeded by scripts/demo.ts. Every protection is exercised with a real request, including the
 * attacks it must block. Run: node scripts/api-check.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cellToLatLng, latLngToCell } from "h3-js";
import sharp from "sharp";
import { mnemonicToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { insertExifSegment } from "../src/lib/evidence/jpeg.ts";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const HOST = new URL(BASE).host;
const MNEMONIC = "test test test test test test test test test test test junk"; // Anvil's public test mnemonic
const proponent = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
const validator = mnemonicToAccount(MNEMONIC, { addressIndex: 3 });
const buyer = mnemonicToAccount(MNEMONIC, { addressIndex: 6 });
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) passed++;
  else failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}`);
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

/** Minimal client keeping cookies, sending the same-origin headers a browser would. */
function client() {
  const jar = new Map<string, string>();
  return async (path: string, init: RequestInit & { origin?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const origin = init.origin === undefined ? BASE : init.origin;
    if (origin) headers.set("origin", origin);
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, v] = pair!.split("=");
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c) || !v) jar.delete(k!);
      else jar.set(k!, v);
    }
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: res.status, body: body as Record<string, unknown>, headers: res.headers, text };
  };
}

async function signIn(account: typeof proponent) {
  const call = client();
  const { body } = await call("/api/auth/nonce");
  const message = createSiweMessage({
    domain: HOST,
    uri: BASE,
    address: account.address,
    chainId: 31337,
    nonce: body.nonce as string,
    version: "1",
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 600_000),
  });
  const signature = await account.signMessage({ message });
  const res = await call("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
  return { call, res, message, signature };
}

// --- EXIF writer: a big-endian TIFF block with GPS and DateTimeOriginal, as a phone camera writes it.
function exifSegment(lat: number, lon: number, date: Date): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push((v >> 8) & 255, v & 255);
  const u32 = (v: number) => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const dms = (v: number) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60 * 10000);
    return [d, 1, m, 1, s, 10000];
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}\0`;

  // Layout (offsets from the TIFF header): IFD0 @8 (2 entries), ExifIFD @38 (1 entry), GPS IFD @56 (4 entries), data after.
  const ifd0 = 8, exif = ifd0 + 2 + 2 * 12 + 4, gps = exif + 2 + 12 + 4, data = gps + 2 + 4 * 12 + 4;
  const latOff = data, lonOff = latOff + 24, dateOff = lonOff + 24;
  out.push(0x4d, 0x4d); u16(42); u32(ifd0);
  u16(2); // IFD0
  u16(0x8769); u16(4); u32(1); u32(exif);
  u16(0x8825); u16(4); u32(1); u32(gps);
  u32(0);
  u16(1); // Exif IFD
  u16(0x9003); u16(2); u32(stamp.length); u32(dateOff);
  u32(0);
  u16(4); // GPS IFD
  u16(1); u16(2); u32(2); out.push(lat >= 0 ? 78 : 83, 0, 0, 0);
  u16(2); u16(5); u32(3); u32(latOff);
  u16(3); u16(2); u32(2); out.push(lon >= 0 ? 69 : 87, 0, 0, 0);
  u16(4); u16(5); u32(3); u32(lonOff);
  u32(0);
  for (const v of dms(lat)) u32(v);
  for (const v of dms(lon)) u32(v);
  for (const ch of stamp) out.push(ch.charCodeAt(0));
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...out];
  return Uint8Array.from([0xff, 0xe1, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload]);
}

/** A distinct photo per seed (random pattern), so perceptual hashes differ between photos. */
async function photo(seed: number, gpsCell: string | null, date = new Date()): Promise<Blob> {
  const raw = Buffer.alloc(64 * 48 * 3);
  let x = seed * 2654435761;
  for (let i = 0; i < raw.length; i++) raw[i] = (x = (x * 1103515245 + 12345) >>> 0) >>> 24;
  const jpeg = new Uint8Array(await sharp(raw, { raw: { width: 64, height: 48, channels: 3 } }).resize(640, 480, { kernel: "nearest" }).jpeg().toBuffer());
  if (!gpsCell) return new Blob([jpeg], { type: "image/jpeg" });
  const [lat, lon] = cellToLatLng(gpsCell);
  return new Blob([insertExifSegment(jpeg, exifSegment(lat, lon, date))], { type: "image/jpeg" });
}

function upload(call: ReturnType<typeof client>, projectId: number, file: Blob, name = "photo.jpg") {
  const form = new FormData();
  form.append("projectId", String(projectId));
  form.append("file", file, name);
  return call("/api/evidence/upload", { method: "POST", body: form });
}

async function main() {
  console.log(`API checks against ${BASE}\n`);

  // --- Security headers and CSP (pages)
  const page = await client()("/fr");
  const csp = page.headers.get("content-security-policy") ?? "";
  check("page sends a nonce-based CSP", /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && csp.includes("frame-ancestors 'none'"), csp);
  check("page sends X-Frame-Options and nosniff", page.headers.get("x-frame-options") === "DENY" && page.headers.get("x-content-type-options") === "nosniff");

  // --- SIWE (F1)
  const { call: owner, res: login, message, signature } = await signIn(proponent);
  check("SIWE sign-in succeeds", login.status === 200 && login.body.address === proponent.address, login);
  const session = await owner("/api/auth/session");
  check("session holds the signed address", (session.body.session as { address?: string })?.address === proponent.address, session.body);
  const replay = await client()("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
  check("replayed signature is refused (single-use nonce)", replay.status === 401, replay);
  const csrf = await owner("/api/documents/retirement", { method: "POST", origin: "https://evil.example", headers: { "content-type": "application/json" }, body: JSON.stringify({ beneficiaryName: "x", reason: "x", language: "fr" }) });
  check("cross-origin POST is refused (CSRF)", csrf.status === 403 && csrf.body.error === "bad_origin", csrf);
  const anon = await client()("/api/documents/retirement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ beneficiaryName: "x", reason: "x", language: "fr" }) });
  check("unauthenticated write is refused", anon.status === 401, anon);

  // --- Documents (F2, F3, F10)
  const reason = await owner("/api/documents/retirement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ beneficiaryName: "Test API", reason: "Contrôle automatique des routes.", language: "fr" }) });
  check("retirement reason published with its hash", reason.status === 201 && /^0x[0-9a-f]{64}$/.test(String(reason.body.hash)), reason);
  const bad = await owner("/api/documents/retirement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ beneficiaryName: "", reason: "x", language: "de" }) });
  check("invalid document refused by the schema", bad.status === 400 && bad.body.error === "invalid_input", bad);
  const extra = await owner("/api/documents/retirement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ beneficiaryName: "a", reason: "b", language: "fr", schemaVersion: "evil", admin: true }) });
  check("unknown fields are refused (strict schema)", extra.status === 400 && extra.body.error === "invalid_input", extra);

  const project = (await client()("/api/projects/1")).body.project as { cells: string[] };
  const cells = project.cells;
  const overlap = await owner("/api/documents/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Overlap", description: "test", language: "fr", location: { place: "a", commune: "b", department: "c", country: "BJ" }, community: { name: "x" }, cells: cells.slice(0, 3) }),
  });
  check("overlapping zone refused before any transaction (F3)", overlap.status === 409 && (overlap.body.conflicts as unknown[])?.length === 3, overlap);
  const buyerSession = await signIn(buyer);
  const notProponent = await buyerSession.call("/api/documents/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X", description: "test", language: "fr", location: { place: "a", commune: "b", department: "c", country: "BJ" }, community: { name: "x" }, cells: [latLngToCell(6.3, 1.9, 10)] }),
  });
  check("wallet without PROPONENT_ROLE cannot publish a project", notProponent.status === 403 && notProponent.body.error === "not_proponent", notProponent);

  // --- Field evidence (F4)
  const seed = Date.now() % 100000;
  const inZone = await upload(owner, 1, await photo(seed, cells[0]!));
  const ev = inZone.body.evidence as { flags: string[]; cell: string; gps: number[] } | undefined;
  check("photo inside the zone accepted with no flag", inZone.status === 201 && ev?.flags.length === 0 && ev.cell === cells[0], inZone);
  const dup = await upload(owner, 1, await photo(seed, cells[0]!));
  check("same photo sent again is flagged as duplicate", dup.status === 201 && (dup.body.evidence as { flags: string[] }).flags.includes("duplicate"), dup);
  const outside = await upload(owner, 1, await photo(seed + 1, latLngToCell(6.45, 2.4, 10)));
  check("photo outside the zone is flagged out_of_zone", outside.status === 201 && (outside.body.evidence as { flags: string[] }).flags.includes("out_of_zone"), outside);
  const noGps = await upload(owner, 1, await photo(seed + 2, null));
  check("photo without GPS is flagged no_gps", noGps.status === 201 && (noGps.body.evidence as { flags: string[] }).flags.includes("no_gps"), noGps);
  const old = await upload(owner, 1, await photo(seed + 3, cells[1]!, new Date("2024-01-01T10:00:00")));
  check("old photo is flagged too_old", old.status === 201 && (old.body.evidence as { flags: string[] }).flags.includes("too_old"), old);
  const png = await upload(owner, 1, new Blob([new Uint8Array(readFileSync(root("public/icon.svg")))], { type: "image/jpeg" }), "fake.jpg");
  check("non-JPEG disguised as .jpg is refused and not stored", png.status === 422 && png.body.error === "invalid_file_type", png);
  const stranger = await upload(buyerSession.call, 1, await photo(seed + 4, cells[0]!));
  check("wallet that is not a project member cannot upload", stranger.status === 403 && stranger.body.error === "not_project_member", stranger);
  const noSession = await upload(client(), 1, await photo(seed + 5, cells[0]!));
  check("upload without session is refused", noSession.status === 401, noSession);

  // --- Private evidence access (F7, spec 10.5)
  const { call: v } = await signIn(validator);
  const list = await v("/api/evidence/list?project=1");
  const items = (list.body.evidence as { url: string; gps: unknown }[]) ?? [];
  check("validator sees the project's evidence with temporary links", list.status === 200 && items.length >= 5 && items.every((i) => i.url), list.status);
  const listStranger = await buyerSession.call("/api/evidence/list?project=1");
  check("other wallets cannot list private evidence", listStranger.status === 403, listStranger);
  const img = await v(items[0]!.url.replace(BASE, ""));
  check("validator can open a stored photo", img.status === 200 && img.headers.get("content-type") === "image/jpeg", img.status);
  const imgAnon = await client()(items[0]!.url.replace(BASE, ""));
  check("anonymous visitor cannot open a stored photo", imgAnon.status === 401, imgAnon.status);

  // --- AI report and anchoring (F6)
  const analyzeStranger = await buyerSession.call("/api/reports/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: 1, periodStart: 1, periodEnd: 2 }) });
  check("only the project owner can request an AI report", analyzeStranger.status === 403, analyzeStranger);
  const anchorOpen = await client()("/api/reports/anchor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportHash: `0x${"a".repeat(64)}` }) });
  check("anchor route is hidden without the server secret", anchorOpen.status === 404, anchorOpen);
  const submitForged = await owner("/api/reports/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "eyJhbGciOiJIUzI1NiJ9.eyJoYXNoIjoiMHgwMCJ9.forged-signature" }) });
  check("forged submit token is refused", submitForged.status === 403 && submitForged.body.error === "invalid_token", submitForged);

  // --- Public reads (F5, F10, F11)
  const projects = await client()("/api/projects");
  check("public project list rebuilt from events", projects.status === 200 && (projects.body.totals as { issued: number }).issued > 0, projects.body.totals);
  const sat = await client()("/api/satellite/1");
  const fileHash = `0x${createHash("sha256").update(readFileSync(root("scripts/satellite/data/sodome-grand-popo/ndvi-v1.json"))).digest("hex")}`;
  const servedHash = `0x${createHash("sha256").update(sat.text).digest("hex")}`;
  check("satellite series served byte for byte (sha256 = anchored hash)", sat.status === 200 && servedHash === fileHash && sat.headers.get("x-content-sha256") === fileHash, { servedHash, fileHash });
  const certTx = process.env.CERT_TX;
  if (certTx) {
    const cert = await client()(`/api/certificates/${certTx}`);
    check("certificate rebuilt from the transaction hash", cert.status === 200 && (cert.body as unknown as { amount: number }[])[0]?.amount === 250, cert);
  }
  const badCert = await client()("/api/certificates/0x1234");
  check("malformed transaction hash refused", badCert.status === 400, badCert);

  // --- Sign out
  await owner("/api/auth/session", { method: "DELETE" });
  const after = await owner("/api/auth/session");
  check("sign-out ends the session", (after.body as { session: unknown }).session === null, after.body);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
