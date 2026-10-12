# BlueRoot web app

Next.js 16 (App Router), React 19, TypeScript, wagmi 3 and viem, MapLibre and h3-js, Tailwind CSS 4, next-intl (French and English). One deployment, no separate backend (spec 7.1). Design system: [design.md](design.md).

## Pages

| Route | Spec | Who | What |
|---|---|---|---|
| `/` | F11 | Public | Map of the zones on Sentinel-2 imagery, registry figures, projects, how a mangrove becomes a credit, limits |
| `/projects` | F11 | Public | Registered projects, then candidate zones (not on-chain, labelled as such) |
| `/projects/[id]` | F2, F5, F7, F12 | Public | Cells on the map, NDVI curve and its hash, verification files and votes, history rebuilt from events; owner panel for the proponent |
| `/projects/new` | F2, F3 | Proponent | Demo zone, drawing or GeoJSON import, overlap check, metadata on IPFS, `registerProject` then `addCells` in batches of 100 |
| `/field` | F4 | Owner, community, field agents | PWA: instant zone check in the phone, compression keeping EXIF, offline queue |
| `/validate` | F7, F8 | Validators (anyone can finalize) | Report, satellite series, private photos through temporary links, vote bound to the report hash, finalize |
| `/market` | F9, F10 | Buyers, holders | Listings with the contract's split shown before signing, exact allowance, list, cancel, retire |
| `/reports/[hash]` | F6 | Public | AI report served only if its bytes match the hash |
| `/certificates`, `/certificates/[tx]` | F10 | Public | Certificate rebuilt from the retirement transaction alone; works without JavaScript |

## API (route handlers)

| Route | Protection |
|---|---|
| `GET /api/auth/nonce`, `POST /api/auth/verify`, `GET/DELETE /api/auth/session` | SIWE (EIP-4361), single-use nonce, rate limit, same-origin |
| `POST /api/evidence/upload` | Session, owner/community/allowlisted agent, rate limit, real file type, size, EXIF, zone, duplicate checks |
| `GET /api/evidence/list` | Session, project members and validators only, temporary links |
| `POST /api/documents/project`, `POST /api/documents/retirement` | Session (+ proponent role on-chain), zod schemas, overlap pre-check |
| `POST /api/reports/analyze` | Session, project owner, quota 3 per project and 10 per wallet per day |
| `POST /api/reports/submit` | Session, owner, server-signed token naming the exact report |
| `POST /api/reports/anchor` | Server only: bearer secret, never called by the browser |
| `GET /api/projects`, `/api/projects/[id]`, `/api/satellite/[projectId]`, `/api/certificates/[txHash]` | Public, rate limited |

## Where the data comes from

- **Chain.** An incremental indexer reads the logs of the four contracts from the deployment block (`src/lib/registry/indexer.ts`). A pure reducer (`state.ts`, unit-tested) rebuilds projects, claims, votes, listings, retirements and totals. Every figure on screen comes from there.
- **Documents.** Project metadata, reports and retirement reasons are canonical JSON published on public IPFS. The on-chain bytes32 is their sha256, and a small JSON stored as one raw block has a CID derived from that digest (`cid.ts`): anyone can fetch a document from the on-chain hash alone. Every document read is re-hashed; a mismatch is treated as missing.
- **Satellite.** NDVI files from `scripts/satellite/data`, hashed from their bytes at runtime. `GET /api/satellite/[id]` serves the exact bytes, so `sha256sum` of the response equals the anchored hash.
- **Evidence.** Raw photos are re-encoded without metadata and stored on Pinata's private network. Check results live in the file's key-values: no database is needed. The uploader's identity is never stored, and the AI never sees a photo.

Until the contracts are deployed, pages render with the three candidate zones and say so in a banner (spec 11: demo availability).

## Security

- Content-Security-Policy with a per-request nonce and `strict-dynamic` (`src/proxy.ts`), HSTS, `nosniff`, `frame-ancestors 'none'`, strict referrer and permissions policies.
- Sessions are HS256-signed, httpOnly, `SameSite=Strict` cookies holding only an address; roles are read on-chain at each request.
- Every input is validated with zod on the server. Errors return a code, never internals. Logs exclude bodies, signatures and files.
- The anchoring key only holds `ANCHOR_ROLE`, and the server re-checks the stored report (score formula, threshold, satellite hash) before signing. The browser can only ask to anchor a report the server produced for that owner.
- AI (spec 10.4): fixed system prompt, submitted content wrapped as data, forced tool call, strict schema, model and date stored in the report, advisory only.

## Business rules and their limits

`src/lib/score.ts`: combined = 40 % satellite + 40 % field + 20 % AI consistency, threshold 70. The field score is half photo validity, half coverage (photos in at least 10 % of the cells, minimum 3). These are demonstration assumptions and the interface says so.

A claim covers a period that **starts at registration at the earliest** (`Verification`, anti double counting in time). A project registered today therefore earns credits for verified time from today on: about 0.06 ha-year per day for the 24-cell Sodomè zone at score 80.

## Commands

```bash
npm install                 # repository root
npm run app dev             # http://localhost:3000
npm run app test            # unit tests
npm run app typecheck
npm run app abi             # regenerate ABIs after `forge build`
```

Local chain: `anvil`, then deploy with the Foundry script on chain 31337 and set `NEXT_PUBLIC_CHAIN_ID=31337`.
