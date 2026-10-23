// Single source of the demo video: every scene's narration, its picture, and how the app is filmed.
//
// A scene's picture is resolved in this order (render.mjs):
//   1. clips/<id>.(mp4|mov|webm|mkv)   your own screen recording (MetaMask flows)
//   2. build/captures/<id>.webm        filmed by capture.mjs from the running app
//   3. build/slides/<id>.png           rendered by slides.mjs (capture scenes get a placeholder card)
// Narration: voice/<id>.(wav|mp3|m4a) recorded by you, else a synthetic draft from voice.mjs.

/** @typedef {{ goto(path: string): Promise<void>; hold(s: number): Promise<void>; scrollTo(fraction: number, s: number): Promise<void>;
 *   scrollToText(text: string, s: number): Promise<void>; hover(selector: string, s: number): Promise<void>; href(pattern: RegExp): Promise<string | undefined> }} Act */

export const scenes = [
  {
    id: "s01",
    kind: "slide",
    title: "Title",
    narration:
      "This is BlueRoot: an open registry that turns community mangrove restoration in southern Benin into credits that anyone can verify.",
  },
  {
    id: "s02",
    kind: "slide",
    title: "The problem",
    narration:
      "Mangroves are among the most carbon-rich forests on Earth, and coastal villages in Benin replant them. Yet they rarely reach climate finance, because the market has a trust problem: the same land sold twice, verification reports nobody can check, and communities that see little of the money.",
  },
  {
    id: "s03",
    kind: "slide",
    title: "Five guarantees",
    narration:
      "BlueRoot answers with five guarantees written into smart contracts. A piece of land can be claimed only once. Every claim rests on two independent sources: field photos and satellite data. An AI report advises, and two human validators decide. Twenty percent of every issuance is locked in a buffer against loss. And at least half of every sale goes straight to the community.",
  },
  {
    id: "s04",
    kind: "capture",
    title: "Live registry",
    live: true,
    narration:
      "This is the live registry on Polygon Amoy. Three real mapped mangrove zones in Grand-Popo and Ouidah are registered on chain, as hexagonal H3 cells of about one hectare. The proponent signed in with an email, and the platform paid the gas.",
    /** @param {Act} act @param {number} s */
    async capture(act, s) {
      await act.goto("/en");
      await act.hold(s * 0.35);
      await act.hover("a[href*='/projects/']", s * 0.25);
      await act.scrollTo(0.35, s * 0.25);
      await act.hold(s * 0.15);
    },
  },
  {
    id: "s05",
    kind: "capture",
    title: "Project page",
    live: true,
    narration:
      "A project page shows its cells, its community wallet and its satellite series: Sentinel-2 vegetation index, computed only over the claimed cells, compared season to season so that Harmattan dust is not mistaken for loss. We never claim tonnes of CO2. One credit is one hundredth of a verified hectare-year.",
    /** @param {Act} act @param {number} s */
    async capture(act, s) {
      await act.goto("/en/projects/1");
      await act.hold(s * 0.3);
      await act.scrollToText("NDVI", s * 0.25);
      await act.hold(s * 0.3);
      await act.scrollTo(0.7, s * 0.15);
    },
  },
  {
    id: "s06",
    kind: "slide",
    title: "Double counting refused",
    narration:
      "What if a second project tries to claim a cell that is already registered? The app warns before anything is signed, and the contract itself would revert with CellAlreadyClaimed. Not a policy, not a manual review: double counting is refused by code.",
  },
  {
    id: "s07",
    kind: "slide",
    title: "Field evidence",
    narration:
      "Field agents upload geotagged photos from their phones. The server checks that each photo was taken inside the zone and during the period, rejects near-duplicates, then removes all metadata before storing it, so no one's exact location or device is exposed.",
  },
  {
    id: "s08",
    kind: "capture",
    title: "AI report",
    narration:
      "To show the whole cycle in a few minutes, the next scenes run the same contracts on a local chain, with a sample report labelled as such. In production, an AI model reviews the whole file: photo checks, coverage of the cells and the satellite trend. It writes a structured report in French for the communities and in English for buyers. It is advisory only. The report's hash is anchored on chain, so validators approve exactly what was analysed.",
    /** @param {Act} act @param {number} s */
    async capture(act, s) {
      await act.goto("/en/projects/1");
      const report = await act.href(/\/reports\/0x[0-9a-f]{64}/i);
      if (report) await act.goto(report);
      await act.hold(s * 0.3);
      await act.scrollTo(0.45, s * 0.3);
      await act.hold(s * 0.15);
      await act.scrollTo(0.9, s * 0.25);
    },
  },
  {
    id: "s09",
    kind: "slide",
    title: "Validation and issuance",
    narration:
      "Two distinct validators attest. The score combines satellite, field and AI evidence, weighted forty, forty and twenty. Below seventy, the file goes back. Once finalized, the contract mints the credits: eighty percent to the project, twenty percent to a buffer pool that no one can move.",
  },
  {
    id: "s10",
    kind: "capture",
    title: "Marketplace",
    narration:
      "Credits are sold on the marketplace for a test stablecoin. On every purchase, the contract splits the payment: at least half to the community wallet, a two percent platform fee, the rest to the seller.",
    /** @param {Act} act @param {number} s */
    async capture(act, s) {
      await act.goto("/en/market");
      await act.hold(s * 0.45);
      await act.scrollTo(0.5, s * 0.3);
      await act.hold(s * 0.25);
    },
  },
  {
    id: "s11",
    kind: "capture",
    title: "Retirement certificate",
    narration:
      "When a buyer retires credits, they are burned for good, and a public certificate is built from the transaction itself. Anyone can check it against the zone, the verification report and the block explorer.",
    /** @param {Act} act @param {number} s */
    async capture(act, s) {
      const tx = process.env.CERT_TX;
      await act.goto(tx ? `/en/certificates/${tx}` : "/en/certificates");
      await act.hold(s * 0.4);
      await act.scrollTo(0.6, s * 0.35);
      await act.hold(s * 0.25);
    },
  },
  {
    id: "s12",
    kind: "slide",
    title: "Architecture",
    narration:
      "Under the hood: four Solidity contracts built with Foundry and OpenZeppelin, covered by seventy-five unit, fuzz and invariant tests. A reproducible satellite pipeline whose output hash is anchored on chain. One Next.js app with wallet sign-in, IPFS for public documents, and Gemini or Claude for the report.",
  },
  {
    id: "s13",
    kind: "slide",
    title: "What comes next",
    narration:
      "Cooperatives can already join without holding crypto: email sign-in, fees paid by the platform. Next, we will run field pilots with local partners, calibrate the scoring with mangrove experts, move administration to a multisig, and open more sites along the Gulf of Guinea.",
  },
  {
    id: "s14",
    kind: "slide",
    title: "Close",
    narration: "BlueRoot. Mangroves you can verify. The code is open, and the demo is live.",
  },
];
