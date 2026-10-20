/**
 * The bytes32 anchored on-chain is the sha256 of a document. A small file pinned on IPFS as a single
 * raw block (CIDv1, codec raw 0x55, multihash sha2-256) has exactly that digest in its CID, so anyone
 * can derive the IPFS address from the on-chain hash alone, with no index:
 *   CID = "b" + base32(0x01 0x55 0x12 0x20 <digest>)
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

export function cidFromSha256(hash: string): string {
  const hex = hash.replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Expected a sha256 hex digest");
  const bytes = new Uint8Array(36);
  bytes.set([0x01, 0x55, 0x12, 0x20]);
  for (let i = 0; i < 32; i++) bytes[4 + i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return `b${base32(bytes)}`;
}
