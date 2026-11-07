# Grand Theft Auto: Harboursville

An unofficial browser sandbox. The city is called Harboursville. The streets are real Sydney geography: Circular Quay and the harbour, Milsons Point on the north shore, North Ryde further north, and Redfern south of the CBD. It does **not** run Grand-V or GTA3Web, and it does not use Rockstar or Take-Two assets.

[GTA3Web](https://github.com/woahhcrackers/GTA3Web) was inspected. It is an unlicensed Emscripten build of re3 that downloads packed GTA III game data before it can start. Those assets are not in this repository. A legally owned copy of GTA III and a licence from that author would still be required to run that runtime. See [ATTRIBUTION.md](ATTRIBUTION.md).

This page is a low-poly browser sandbox. It is not GTA V graphics, and Three.js cannot be shaded into that look without a separate art production. The engine choice and the missing assets are written in [GRAPHICS.md](GRAPHICS.md). GTA V models and textures are not used.

The player mesh is the supplied Sean O'Shea FBX. That file has no skeleton and no embedded textures, so the game adds a generated rig and original idle, walk, run, jump, and enter-car poses. His voice is original formant synthesis, with subtitles. Talk plays it after you click. Mute and the voice slider apply. If a clip cannot decode, the browser's own stock voice is used and the subtitle says so. Cesium Man stands nearby under CC BY 4.0.

CGTrader Sydney models were not downloaded. Their royalty-free licence does not allow publishing the raw download in a public repository, and this environment has no CGTrader login. Listings and the required sign-in step are in [ATTRIBUTION.md](ATTRIBUTION.md).

## Play

From this directory:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). WebGL is required. No account, no network call at play time, and no paid host.

The shipped chart is `public/data/harbour.json`. If that file is missing or fails validation, the page stays playable on a **synthetic basin** and a red banner says it is not Sydney. Add `?synthetic=1` to force that basin.

A production build, still local:

```bash
npm run build
npm run preview
```

Preview listens on [http://localhost:4173](http://localhost:4173).

## How to play

1. Read the title card. Choose **Start in Harboursville**.
2. You start in a red coupe at Circular Quay, facing the Opera House.
3. Drive the gold rings in order. The roads between them are real OpenStreetMap centerlines. Redfern is south of the CBD, not west. North Ryde is north, along Lane Cove Road. This is a long drive at the coupe's top speed, not a teleport.
   - Opera House forecourt
   - Harbour Bridge crest
   - Milsons Point
   - North Ryde
   - Redfern
   - Circular Quay finish
4. The timer stops when the last ring is taken. **Drive it again** restarts the lap.

| Action | Keyboard | On screen |
| --- | --- | --- |
| Accelerate | W or ↑ | Gas |
| Brake / reverse | S or ↓ | Brake |
| Steer left | A or ← | Left |
| Steer right | D or → | Right |
| Handbrake while driving, jump on foot | Space | Hold |
| Leave the car, or get back in beside it | F | On foot |
| Fire the pellet sidearm | J or a short click | Fire |
| Reset to the last ring (or the start) | R | Reset |
| Camera distance | C | — |
| Top-down view | V | — |
| Mute the synthesized engine | M | Sound on / Sound off |
| Orbit the camera | Drag on the view | — |
| Pause | Esc | — |

Driving into the harbour resets the car. Leaving the bridge deck drops it under gravity, then resets when it hits the water. Buildings block the coupe and the avatar. The bridge deck is a road in the air; streets that pass underneath stay on the ground. Orange buoys near the start are targets for the sidearm. They are not required to finish the lap.

The minimap is north-up. The red arrow is you. Gold is the current ring. Orange dots are buoys.

Roads use a CC0 asphalt photo. Low buildings use CC0 brick. Taller buildings and the ground use CC0 concrete. Parks use a CC0 grass photo. The list, with the exact ambientCG page and zip URL for each file, is `public/textures/manifest.json`. Google Images was not used as the file source.

Harbour water is a procedural surface on the OpenStreetMap polygon: large swells, smaller chop, view-dependent sky reflection, a sun glint, and a shallow-to-deep colour toward the shore. `?water=low` reduces the ripple detail. It is not a photo of the harbour.

Sketchfab models of the Opera House, the bridge, and a Sydney bay are CC BY 4.0 and downloadable only after a Sketchfab login. They are listed in [ATTRIBUTION.md](ATTRIBUTION.md) and are not bundled. The attached skyline DAE had no licence and missing textures, so it was not used as geometry.

Grand-V's GitHub repository does not contain guns, avatars, or a physics engine. Both public branches are an unlicensed launcher and the releases page is empty. The avatar, sidearm, and gravity in this lap are original. They are not the RAGE engine and not GTA assets. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Checks

```bash
npm test
npm run build
```

`npm test` checks the projection, the car, the checkpoint order, collision, the bundled harbour chart, and that this package does not vendor a GTA runtime. Refreshing the chart from OpenStreetMap needs a network and is optional:

```bash
npm run fetch-map
```

## Sources, in one paragraph

Harbour water, roads, parks, piers, building footprints, tagged heights, the Opera House outline, and the bridge road centerlines are simplified OpenStreetMap (ODbL). **© OpenStreetMap contributors.** The shells, bridge arch, car, water, and lighting are original stylized models. There is no photogrammetry and no aerial imagery. Grand-V's public repository is an unlicensed launcher with no engine source, so it is not integrated. Details, the commit that was inspected, and the real-versus-stylized split are in [ATTRIBUTION.md](ATTRIBUTION.md).

## Limits

This is a short harbour lap, not a city-sized GTA. The bridge deck is a 30 m stylized arch so both ends meet the mapped roads. Shells are not a measured model of the Opera House. Untagged building footprints are left out once 2,200 tagged buildings are in the scene. The map stops at the bounding box; driving past it resets the car.
