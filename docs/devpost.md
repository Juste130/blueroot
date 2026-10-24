# Devpost submission: BlueRoot

Copy each section into the matching Devpost field.

## Project name

BlueRoot

## Elevator pitch (200 characters max)

An open-source registry that lets mangrove-restoring communities in Benin earn verifiable credits: no double counting, two-source evidence, human validation and a contract-enforced community share.

## About the project

### Inspiration

In southern Benin, communities around Grand-Popo and Ouidah replant and protect mangroves along the Bouche du Roy estuary and the lagoons towards Lake Ahémé. Mangroves are among the most carbon-dense ecosystems on Earth, yet these projects almost never reach carbon finance. A third-party verification costs more than a small project can earn. Buyers have no way to know whether an area was already sold. And when money does arrive, nothing guarantees that the people doing the work get their share.

We wanted to see how much of that trust could move from paperwork and intermediaries into code: rules that nobody, including us, can bend.

### What it does

BlueRoot follows one path: **register a zone, prove it, have two humans attest, issue, sell, retire with a public certificate.**

1. **Register.** A proponent draws or imports the zone. It becomes a set of H3 cells (resolution 10, about 1.5 ha each). The contract refuses any cell that already belongs to another active project, so **the same mangrove cannot be sold twice**. A claim also cannot cover time before registration or time already claimed.
2. **Prove, with two independent sources.**
   - *Field:* agents send photos from a PWA built for weak connections. The server checks the real file type, the EXIF position (it must fall inside the project's cells), the date and duplicates. Then it strips the metadata and stores the photo privately on IPFS.
   - *Satellite:* a pipeline computes NDVI from Copernicus Sentinel-2 Level-2A, only on the claimed cells. It masks clouds and water, compares the same season two years apart, and publishes a versioned JSON. Its sha256 is anchored on-chain, so anyone can recompute it.
3. **AI report, advisory only.** A model (Gemini, or Claude) reads the evidence metadata and the satellite series, never the photos. It returns a schema-validated JSON report: strengths, inconsistencies and a consistency score. The report goes to public IPFS and its hash is anchored on-chain by a server key that holds a single role.
4. **Humans decide.** Two distinct validators review the report, the satellite curve and the photos (through temporary links). Each vote is bound to the exact report hash. A proponent can never validate their own project.
5. **Issue.** On finalization, `Verification` mints ERC-1155 credits in units of 0.01 verified hectare-year. 20 % go to a non-transferable **buffer pool** against the risk of losing the mangrove.
6. **Sell.** The marketplace splits each payment atomically: **at least 50 % to the community wallet** (a contract constant), a platform fee capped at 5 %, the rest to the proponent. The split is shown before signing.
7. **Retire.** Retiring burns the credits and records a beneficiary and a reason hash. The public certificate is rebuilt from the transaction alone. It works without JavaScript and without our database, because there is no database.

Everything on screen comes from contract events or from a file whose hash is on-chain. The app is fully bilingual (French and English). It can be used with MetaMask or with an email login (Privy embedded wallet, sponsored gas), so a field agent does not need to understand crypto.

### How we built it

- **Smart contracts:** Solidity with OpenZeppelin 5 and Foundry. Four contracts: `ProjectRegistry`, `Verification`, `CarbonCredit` (ERC-1155) and `Marketplace`. They use role-based access, `Pausable`, `ReentrancyGuard`, `SafeERC20` and bounded loops, and they are non-upgradeable by design. There are 75 tests, including fuzz tests and 6 invariants: one active project per cell, a claim is finalized at most once, issued = buffer + net, the community share is never below the minimum, retired credits never move, and nobody validates their own project. All four are deployed on **Polygon Amoy**.
- **Satellite:** a TypeScript pipeline reads Sentinel-2 L2A Cloud-Optimized GeoTIFFs through the Earth Search STAC API with HTTP range requests, so no key and no full download are needed. It keeps only the pixels inside the project cells, masks clouds and water, then takes monthly medians.
- **App:** one Next.js 16 deployment on Netlify, with React 19, TypeScript, wagmi and viem, MapLibre and h3-js. An incremental indexer rebuilds all state from contract logs. Documents are canonical JSON on IPFS (Pinata), and their sha256 is both the on-chain bytes32 and the digest of the CID, so anyone can fetch a document from the on-chain hash alone.
- **Security:** SIWE sessions, zod validation on every input, rate limits and AI quotas, a strict CSP with per-request nonces, and an anchoring key that only holds `ANCHOR_ROLE` and recomputes the score before signing.

### Challenges we ran into

- **The Harmattan.** Our first NDVI windows used the dry season. Every February, NDVI dropped on all three zones. That was not mangrove loss: it was Saharan dust haze. We moved the comparison to March–May of each year, outside the Harmattan, and kept the full series public so the dip stays auditable. Without it, our satellite evidence would have penalized healthy mangroves.
- **Tides.** On mudflats, the water extent changes with each scene. We mask water pixels and measure scene quality against the expected pixel count of the zone, not against what happened to be visible.
- **Honest units.** NDVI measures vegetation vigour, not carbon. Instead of inventing tonnes of CO2, we issue *verified hectare-years* and say so everywhere.
- **Double counting in time, not only in space.** Unique cells were not enough. A claim also has to start after registration and after the last claimed period, which the contract now enforces.
- **Polygon Amoy specifics:** a minimum priority fee that wallets do not always respect, and log-range limits on public RPCs. We handled both in the app.

### Accomplishments that we're proud of

- Anti-double-counting, the buffer pool and the community share are **enforced by the contracts and covered by invariant tests**, not just written in a policy.
- An AI that is useful but cannot decide: schema-bound, advisory only, and its report hash-locked to the votes.
- Real satellite evidence on three real mangrove zones in Benin, reproducible by anyone from public data.
- A certificate that anyone can verify from a transaction hash, without trusting us.

### What we learned

Climate data is messy in very local ways: dust, tides, clouds, tile edges. The value of a blockchain here is not speed or tokens. It is making the rules and the evidence impossible to change quietly. We also learned to keep claims modest: a credible small registry is worth more than an impressive but unverifiable one.

### What's next for BlueRoot

- **Beyond Benin.** Nothing in the contracts or the satellite pipeline is specific to Benin: H3 cells cover the globe, Sentinel-2 covers every coastline, and the pipeline handles any UTM zone. Only the season windows and the score weights are local settings. The natural next step is the Gulf of Guinea mangrove belt (Togo, Nigeria, Ghana), then Senegal's Saloum delta and Guinea-Bissau, each with a local partner organization and local validators, because trust in the field cannot be deployed by code alone.
- Field pilots with local communities and NGOs in Grand-Popo and Ouidah, to calibrate the weights, thresholds and buffer rate with mangrove experts.
- Validator reputation, and reversal reports that draw on the buffer pool when mangrove loss is detected.
- A multisig for administration, an external audit, then a mainnet deployment.
- A path towards recognized methodologies, using BlueRoot as the transparent evidence layer.

## Built with

solidity, openzeppelin, foundry, polygon, ethereum, erc-1155, next.js, react, typescript, wagmi, viem, privy, maplibre, h3, sentinel-2, copernicus, stac, ipfs, pinata, gemini, tailwindcss, netlify

## Try it out links

- Live demo: https://blueroot0.netlify.app
- Source code: https://github.com/Juste130/blueroot
- Demo video: https://youtu.be/Xbzt9ZcUTaU

## Notes for the jury

- Testnet only (Polygon Amoy). The contract addresses, with Polygonscan links, are in the README.
- The full lifecycle (registration → validation → issuance → sale → retirement → certificate) runs on a local chain in about 2 minutes with `npm run demo`. Its reports are labelled fixtures, and the server refuses to anchor them on Amoy. On Amoy, a report can only come from photos taken inside a zone, which needs a field visit.
