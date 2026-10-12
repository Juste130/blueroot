# BlueRoot design system

The app is a **public registry of proofs**. Its users are a community agent with a mid-range phone on a weak 3G link in Grand-Popo, an independent validator reviewing a file, a buyer who wants a certificate, and a jury member who has five minutes. The design has one job: make every figure traceable to its proof.

## Principles

1. **Every number links to its proof.** A figure on screen is either read from the chain or from a file whose hash is shown and checkable. If it is a demonstration assumption, the interface says so next to it.
2. **Gold means anchored.** The four gold nodes of the logo are the proofs at the end of the roots. In the interface, gold (`#F2C14E`) is reserved for one meaning: *this fact is anchored on-chain*. It is never used for decoration, warnings or calls to action.
3. **The cell is the unit.** H3 hexagons appear where they carry information (zones, cells, evidence positions) and nowhere as ornament.
4. **The lifecycle is a root.** A project's history (registration, evidence, satellite, report, votes, issuance, sales, retirements) is a real sequence, drawn as a single root line with a node per event. It is the one memorable visual element; everything around it stays quiet.
5. **Weak networks first.** Pages render on the server, the map loads after the content, images are compressed on the phone before upload, and the field form works offline.

## Colour

| Token | Hex | Role |
|---|---|---|
| `tide` | `#0B3C5D` | Ink for text and headings, primary buttons, dark surfaces |
| `mangrove` | `#3FB37F` | Vegetation and "verified" states; `mangrove-ink #1E7A50` for text (AA on white) |
| `lagoon` | `#6EC6E8` | Water and satellite data, map accents; `lagoon-ink #1B6E8F` for text |
| `gold` | `#F2C14E` | Anchored on-chain, nothing else; `gold-ink #8A6410` for text |
| `roots` | `#C9E4DE` | Quiet surfaces, cell fills, dividers |
| `paper` | `#F5F9F8` | Page background (cool, never cream) |

Danger uses `#B4412F` (rejection, out-of-zone evidence). Contrast is checked for every text pair (WCAG AA, 4.5:1 for body text). The dark theme swaps paper and tide and keeps the semantic colours.

## Type

Inter only (spec section 16), loaded as a variable font with `next/font` (self-hosted, no request to Google at runtime).

- Scale (ratio 1.25): 14, 16, 20, 25, 31, 39, 49 px. Body 16 px, line height 1.55, line length below 70 characters.
- Headings 700, tracking −0.02 em above 25 px. Figures use `tabular-nums` so columns align.
- Hashes and addresses stay in Inter with the slashed zero (`zero`) and tabular figures, shortened in the middle (`0x5064…62b4`) with a copy button and the full value available to screen readers.
- Sentence case everywhere; no all-caps labels.

## Layout

- Left-aligned content, 72 rem maximum width, 16 px gutters on phones.
- Home: the real map of the mangrove zones fills the first screen, with the tagline and the two ledger figures that matter (verified hectare-years, retired credits).
- Project page: header facts, then the map and the NDVI curve, then the root-line history.
- Radii follow hierarchy: 4 px for chips, 8 px for controls, 12 px for panels; the map frame has none.
- Motion: only in answer to an action (opening a panel, confirming a transaction) and disabled under `prefers-reduced-motion`.

## Accessibility

Keyboard navigation with a visible focus ring, a skip link, landmarks, labelled forms with inline errors, `aria-live` for transaction states, text alternatives for the map (the list of cells and a data table under every chart), French and English.
