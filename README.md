<p align="center"><img src="docs/assets/blueroot-logo.svg" alt="BlueRoot" width="420"></p>

<p align="center"><em>Chaque racine compte, chaque preuve aussi. · Every root counts, so does every proof.</em></p>

<p align="center">
  <a href="https://blueroot0.netlify.app"><strong>Live demo (Polygon Amoy)</strong></a> ·
  <a href="https://youtu.be/Xbzt9ZcUTaU">Demo video</a> ·
  <a href="docs/BlueRoot-cahier-des-charges-et-architecture.md">Specification</a> ·
  IEEE ClimateChain 2026, track: Carbon markets and emissions transparency
</p>

> **Testnet only.** BlueRoot credits are verified hectare-years of mangrove, not certified CO2 offsets.

## The problem

Community mangrove restoration in southern Benin is real, but it rarely reaches carbon finance. Third-party verification costs more than a small project earns, the same area can be sold twice, and evidence is hard for anyone outside the project to check. When money does arrive, nothing guarantees that the community gets its share.

## What BlueRoot does

BlueRoot is an open-source proof registry: **register a zone, prove it (field + satellite + AI), have two validators attest, issue, sell, retire with a public certificate.** Every trust rule is enforced by a contract, not by a promise.

| Guarantee | How |
|---|---|
| No double counting in space | The zone is a set of H3 cells (resolution 10, about 1.5 ha). `ProjectRegistry` refuses any cell already held by an active project. |
| No double counting in time | A claim period cannot start before registration or overlap a previous claim. |
| Two independent sources | Geotagged field photos (EXIF position in the project cells, date, duplicates) and a Sentinel-2 NDVI series computed only on the claimed cells. |
| AI that advises, never decides | A model reads the evidence metadata and the satellite series and returns a strict JSON report. It signs nothing; its output is schema-validated and its hash is anchored. |
| Humans decide | Two distinct validators must approve, each vote bound to the exact report hash. The proponent can never validate their own project. |
| Non-permanence risk | 20 % of every issuance goes to a non-transferable buffer pool. |
| Community share | The marketplace splits every payment atomically: at least 50 % to the community wallet (a contract constant), a platform fee capped at 5 % (2 % by default), the rest to the proponent. |
| Public proof | Retiring burns the credits; the certificate page is rebuilt from the transaction alone, without JavaScript and without a database. |

## Try it

**Online (Polygon Amoy).** Open the [live demo](https://blueroot0.netlify.app): the map shows the three real mangrove zones on Sentinel-2 imagery, their NDVI curves and the on-chain registry. Each figure on screen comes from contract events or from a file whose sha256 is anchored on-chain. You can sign in with a wallet (MetaMask on Amoy) or with an email (Privy embedded wallet, gas sponsored).

**Full lifecycle (local chain, 2 minutes).** The whole cycle, from registration to certificate, runs against the real contracts on Anvil. It registers the 3 zones, rejects a double-counting attempt, anchors a file, collects two approvals and finalizes it (credits plus buffer), lists 1,000 credits, buys 600 with the enforced split, and retires 250 with a public certificate:

```bash
npm install && (cd contracts && make deps)
anvil                                                   # terminal 1
cd contracts
eval "$(node ../scripts/demo.ts roles)"
PROPONENTS=$PROPONENTS VALIDATORS=$VALIDATORS ANCHOR_ADDRESS=$ANCHOR_ADDRESS \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # public Anvil key
cd .. && npm run demo
echo NEXT_PUBLIC_CHAIN_ID=31337 > .env.local && npm run dev   # http://localhost:3000
```

The local demo uses **fixture reports** (`provider: "fixture"`): no AI call and no real photo. The app labels them as such, and the server refuses to anchor them on a public network. On Amoy, a report can only come from the real pipeline: photos taken inside the zone, the AI call, then two validators.

**Tests.**

```bash
cd contracts && make test     # 75 Foundry tests: unit, fuzz and 6 invariants
cd .. && npm test             # app unit tests (score, state reducer, evidence checks...)
```

## Deployed contracts (Polygon Amoy, chain 80002)

| Contract | Address |
|---|---|
| ProjectRegistry | [`0xF56e11F580Db0ecF94a64D03Ca10d276d1c90C3E`](https://amoy.polygonscan.com/address/0xF56e11F580Db0ecF94a64D03Ca10d276d1c90C3E) |
| Verification | [`0x058Fab5c9D33f1595c32c8a60a0704a3373AaEA3`](https://amoy.polygonscan.com/address/0x058Fab5c9D33f1595c32c8a60a0704a3373AaEA3) |
| CarbonCredit (ERC-1155, BRHY) | [`0x5d9E0E9d9C1BEEBbD983633BB374Acaa4160F90f`](https://amoy.polygonscan.com/address/0x5d9E0E9d9C1BEEBbD983633BB374Acaa4160F90f) |
| Marketplace | [`0xac20b8353f017DCeeCd66ae5cAdAb6CCBfC0078d`](https://amoy.polygonscan.com/address/0xac20b8353f017DCeeCd66ae5cAdAb6CCBfC0078d) |
| Payment token (test stablecoin) | [`0x0b1ba45AB9C8540de69F824796Fbd7F9b3888fAf`](https://amoy.polygonscan.com/address/0x0b1ba45AB9C8540de69F824796Fbd7F9b3888fAf) |

Deployment block: 50718534. Source of truth: [contracts/deployments/80002.json](contracts/deployments/80002.json).

## Architecture

```
 Field agent (PWA)          Sentinel-2 L2A (STAC, no key)
   photos + EXIF                 NDVI on the project cells
        │                                │
        ▼                                ▼
 ┌──────────────────── Next.js app (one deployment) ────────────────────┐
 │ checks: type, size, EXIF position in cells, date, duplicates         │
 │ AI report (Gemini or Claude): strict JSON schema, advisory only      │
 │ canonical JSON on IPFS, sha256 = on-chain bytes32 = CID digest       │
 └──────┬───────────────────────────────────┬───────────────────────────┘
        │ private photos (Pinata)           │ anchor key: ANCHOR_ROLE only
        ▼                                   ▼
 ProjectRegistry ──► Verification ──► CarbonCredit ──► Marketplace
 H3 cells, unique    2 validators,     ERC-1155, 20 %    split: community ≥ 50 %,
                     report hash,      buffer, retire    fee ≤ 5 %, proponent
                     score ≥ 70        + certificate
```

- **Minimum on-chain:** trust rules and hashes only, never raw or personal data.
- **No backend database:** an incremental indexer rebuilds projects, claims, votes, listings and retirements from contract events; documents are fetched from IPFS by their on-chain hash and re-hashed on read.
- **Score:** combined = 40 % satellite + 40 % field + 20 % AI consistency, threshold 70; quantity = hectares × years × score / 100. These weights are demonstration assumptions and the interface says so.

## Security

- **Contracts:** OpenZeppelin 5, role-based access, `Pausable`, `ReentrancyGuard`, `SafeERC20`, custom errors, bounded loops, non-upgradeable by design. Foundry unit, fuzz and invariant tests; Slither config included.
- **App:** SIWE sessions (single-use nonce, httpOnly `SameSite=Strict` cookie holding only an address, roles re-read on-chain), zod validation on every input, rate limits and AI quotas, strict CSP with a per-request nonce, HSTS.
- **AI:** fixed system prompt, submitted content wrapped as data, schema-constrained output, model and date stored in the report. The AI never sees a photo.
- **Anchoring key:** holds only `ANCHOR_ROLE`; the server recomputes the score, threshold and satellite hash before signing.

## Beyond Benin

Nothing in the contracts or the satellite pipeline is specific to Benin: H3 cells cover the globe, Sentinel-2 covers every coastline, and the pipeline handles any UTM zone, north or south. Only the season windows (here March–May, outside the Harmattan) and the score weights are local settings. The natural next step is the Gulf of Guinea mangrove belt (Togo, Nigeria, Ghana), then Senegal's Saloum delta and Guinea-Bissau, each with a local partner organization and local validators, because trust in the field cannot be deployed by code alone.

## Honest limits

- Credits measure **verified hectare-years of mangrove**. NDVI measures vegetation vigour, not carbon, so BlueRoot never claims tonnes of CO2.
- The three zones are real mapped mangroves (OpenStreetMap) in Grand-Popo and Ouidah. Using them as restoration projects must be validated in the field with local communities.
- Weights, thresholds and the buffer rate are example values to calibrate with experts. There is no Verra or Gold Standard certification.
- Testnet only, single-signer admin for the demo (a multisig is planned).

## Repository

| Folder | Content |
|---|---|
| `contracts/` | Solidity + Foundry: registry, verification, credits, marketplace ([docs](docs/contracts.md)) |
| `scripts/satellite/` | Sentinel-2 NDVI pipeline and versioned data for the 3 zones ([docs](docs/satellite.md)) |
| `src/`, `public/`, `content/` | Next.js 16 app: registry, field PWA, AI report, validation, market, certificates ([docs](docs/app.md)) |
| `scripts/demo.ts` | Full lifecycle on Anvil |
| `docs/` | Specification, contract design, deployment ([Amoy and Netlify](docs/deploy-amoy.md)), design system |
| `video/` | Scripted pipeline for the demo video |

Stack: Solidity 0.8, OpenZeppelin 5, Foundry, Polygon Amoy, Next.js 16, React 19, TypeScript, wagmi 3, viem, Privy, MapLibre, h3-js, Tailwind CSS 4, next-intl (French and English), Pinata IPFS, Gemini API, Netlify.

## FR, en bref

BlueRoot est un registre de preuve du carbone bleu pour la restauration communautaire des mangroves au sud du Bénin. Les garanties sont appliquées par les contrats :
- unicité des zones (cellules H3) ;
- preuve à deux sources, terrain et satellite Sentinel-2 ;
- rapport IA uniquement consultatif ;
- deux validateurs humains distincts ;
- réserve tampon de 20 % ;
- au moins 50 % de chaque vente pour la communauté ;
- certificat de retrait public.

C'est un projet de démonstration sur testnet. Les crédits sont des hectares-années de mangrove vérifiés, et non des tonnes de CO2 certifiées. L'interface existe en français et en anglais.

## Credits

Contains modified Copernicus Sentinel data. Zone polygons © OpenStreetMap contributors (ODbL). Photos in the demo video, from Wikimedia Commons under CC BY-SA 4.0: Padonou Dotou, Ji-Elle, Dagnon, Kijoe and EGOUNLETY Eudoxie ([details](video/assets/photos/credits.json)). Built by HOUEZO Sènami Juste for the IEEE ClimateChain 2026 hackathon.

## License

MIT
