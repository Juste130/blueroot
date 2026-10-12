import "server-only";

/**
 * Minimal Pinata v3 client (files API). Only the server calls it: PINATA_JWT never reaches the browser.
 * https://docs.pinata.cloud/api-reference
 */
const API = "https://api.pinata.cloud/v3";
const UPLOADS = "https://uploads.pinata.cloud/v3/files";

export interface PinataFile {
  id: string;
  cid: string;
  name: string;
  size: number;
  mime_type: string;
  keyvalues: Record<string, string>;
  created_at: string;
}

function jwt(): string {
  const value = process.env.PINATA_JWT;
  if (!value) throw new Error("PINATA_JWT is not configured");
  return value;
}

export async function uploadFile(
  bytes: Uint8Array<ArrayBuffer>,
  options: { name: string; type: string; network: "public" | "private"; keyvalues?: Record<string, string> },
): Promise<PinataFile> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: options.type }), options.name);
  form.append("network", options.network);
  form.append("name", options.name);
  if (options.keyvalues) form.append("keyvalues", JSON.stringify(options.keyvalues));
  const res = await fetch(UPLOADS, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt()}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Pinata upload failed (${res.status})`);
  return ((await res.json()) as { data: PinataFile }).data;
}

/** Files whose keyvalues match all of `metadata` (deepObject query: metadata[key]=value). */
export async function listFiles(network: "public" | "private", metadata: Record<string, string>, max = 1_000): Promise<PinataFile[]> {
  const files: PinataFile[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ limit: "500", order: "ASC" });
    for (const [k, v] of Object.entries(metadata)) query.set(`metadata[${k}]`, v);
    if (pageToken) query.set("pageToken", pageToken);
    const res = await fetch(`${API}/files/${network}?${query}`, {
      headers: { Authorization: `Bearer ${jwt()}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Pinata list failed (${res.status})`);
    const { data } = (await res.json()) as { data: { files: PinataFile[]; next_page_token?: string } };
    files.push(...data.files);
    pageToken = data.next_page_token || undefined;
  } while (pageToken && files.length < max);
  return files;
}

/**
 * Temporary signed link to a private file (F7: validators get time-limited access to raw evidence).
 */
export async function privateLink(cid: string, expiresSeconds = 15 * 60): Promise<string> {
  const gateway = process.env.PINATA_GATEWAY;
  if (!gateway) throw new Error("PINATA_GATEWAY is not configured");
  const res = await fetch(`${API}/files/private/download_link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `https://${gateway}/files/${cid}`,
      expires: expiresSeconds,
      date: Math.floor(Date.now() / 1000),
      method: "GET",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Pinata link failed (${res.status})`);
  return ((await res.json()) as { data: string }).data;
}
