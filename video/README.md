# Demo video

Builds the 3 to 5 minute hackathon video from code: slides, shots filmed from the app, narration,
burned-in captions. Everything is regenerated in a few minutes, so a wording change is a one-line edit
in `scenes.mjs`.

```bash
cd video
npm install            # ffmpeg (bundled binary)
npm run slides         # build/slides/*.png
npm run voice          # build/voice/*.wav, build/timeline.json, out/script.md
npm run cut            # build/cuts/*.mp4 from your screen recordings (REC_DIR, default ~/Videos/Captures)
npm run music          # build/music.wav, a generated ambient pad (slow: about 9 minutes)
APP_URL=https://... CERT_TX=0x... npm run capture   # build/captures/*.webm (app must be running)
npm run render         # out/blueroot-demo.mp4 + out/blueroot-demo.srt
```

| Source | Role |
|---|---|
| `scenes.mjs` | narration, picture and filming steps for each scene (single source) |
| `slides.html` | 1920×1080 slides with the app's design tokens |
| `voice/<id>.wav` | your own narration for a scene (overrides the synthetic draft) |
| `cut` in a scene | which parts of one of your screen recordings to keep, how fast, and what to blur |
| `assets/photos/` | photos from Wikimedia Commons (CC BY-SA 4.0, authors in `credits.json` and on the closing slide) |
| `clips/<id>.mp4` | your own screen recording for a scene, e.g. a MetaMask flow (overrides slide or capture) |

Shots are timed on the narration: run `voice` again after recording, then `cut`, `capture` and `render`.
`build/`, `out/`, `voice/` and `clips/` stay local (gitignored).
