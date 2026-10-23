// Single source of the demo video: every scene's narration, its picture, and how the app is filmed.
//
// A scene's picture is resolved in this order (render.mjs):
//   1. clips/<id>.(mp4|mov|webm|mkv)   a finished clip of your own, used as is
//   2. build/cuts/<id>.mp4             your screen recording edited by cut.mjs (scene.cut)
//   3. build/captures/<id>.webm        filmed by capture.mjs from the running app
//   4. build/slides/<id>.png           rendered by slides.mjs (other scenes get a placeholder card)
// `zoom` slides get a slow push-in; music.mjs lays a quiet pad under the whole video.
// Narration: voice/<id>.(wav|mp3|m4a) recorded by you, else a synthetic draft from voice.mjs.

/** @typedef {{ goto(path: string): Promise<void>; hold(s: number): Promise<void>; scrollTo(fraction: number, s: number): Promise<void>;
 *   scrollToText(text: string, s: number): Promise<void>; hover(selector: string, s: number): Promise<void>; href(pattern: RegExp): Promise<string | undefined> }} Act */

export const scenes = [
  {
    id: "s01",
    kind: "slide",
    zoom: true,
    title: "Title",
    narration:
      "This is BlueRoot: an open registry that turns community mangrove restoration in southern Benin into credits that anyone can verify.",
  },
  {
    id: "s02",
    kind: "slide",
    zoom: true,
    title: "The problem",
    narration:
      "Mangroves are among the most carbon-rich forests on Earth, and coastal villages in Benin replant them. Yet they rarely reach climate finance, because the market has a trust problem: the same land sold twice, verification reports nobody can check, and communities that see little of the money.",
  },
  {
    id: "s03",
    kind: "slide",
    title: "Five guarantees",
    narration:
      "BlueRoot answers with five guarantees, written into smart contracts. Land can be claimed only once. Every claim rests on field photos and satellite data. An AI report advises, and two human validators decide. Twenty percent of every issuance is locked in a buffer against loss. And at least half of every sale goes to the community.",
  },
  {
    id: "s04a",
    kind: "cut",
    title: "Register a project",
    narration:
      "Here, a cooperative registers a real zone on the live deployment, on Polygon Amoy. It signs in with just an email: no wallet to install, no crypto to buy. It picks a mapped mangrove zone, describes the project, and approves the transactions. The platform pays the gas.",
    // Recorded on blueroot0.netlify.app. The Privy dialog still shows another app name: that frame is blurred.
    cut: {
      src: "Projects · BlueRoot - Google Chrome 2026-10-23 01-18-19.mp4",
      crop: [1620, 911, 150, 121],
      parts: [
        { from: 0, to: 8.5, speed: 1.25 },
        { from: 9, to: 224, speed: "fit" },
        { from: 225.5, to: 229.5, speed: 1.5 },
        { from: 240, to: 243, speed: 1 },
        { from: 244, to: 249.8, speed: 1.5, hold: 0.8 },
      ],
      blur: [
        { x: 798, y: 438, w: 80, h: 30, from: 239.9, to: 243.1 },
        { x: 1024, y: 575, w: 86, h: 30, from: 239.9, to: 243.1 },
      ],
    },
  },
  {
    id: "s04",
    kind: "capture",
    title: "Live registry",
    live: true,
    narration:
      "The live registry now holds three real mangrove zones in Grand-Popo and Ouidah, each claimed on chain as hexagonal H3 cells of about one hectare.",
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
      "Each project page shows its cells, its community wallet and its Sentinel-2 vegetation index, computed only over the claimed cells and compared season to season, so that Harmattan dust is not mistaken for loss. We never claim tonnes of CO2: one credit is one hundredth of a verified hectare-year.",
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
    kind: "cut",
    title: "Double counting refused",
    narration:
      "What if a second project claims the same mangroves? Here, we import the exact outline of Sodomè, which is already registered. Before anything is signed, the app finds twenty-four cells that belong to an active project, and blocks the form. Bypass the app, and the contract itself reverts with CellAlreadyClaimed. Double counting is refused by code, not by policy.",
    cut: {
      src: "Projects · BlueRoot - Google Chrome 2026-10-23 02-09-23.mp4",
      crop: [1620, 911, 150, 121],
      parts: [
        { from: 0, to: 3.6, speed: 1 },
        { from: 3.6, to: 8.6, speed: 1.5 },
        { from: 51, to: 62, speed: "fit" },
      ],
    },
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
      "To show the whole cycle in a few minutes, the next scenes run the same contracts on a local chain, with a sample report labelled as such. An AI model reviews the whole file: photo checks, cell coverage and the satellite trend. Its report, in French for communities and in English for buyers, is advisory only. Its hash is anchored on chain, so validators approve exactly what was analysed.",
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
    zoom: true,
    title: "Close",
    narration: "BlueRoot. Mangroves you can verify. The code is open, and the demo is live.",
  },
];
