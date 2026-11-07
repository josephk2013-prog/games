# GTA: Sydney Psyco

A small third-person driving sandbox around the real Sydney Harbour shoreline. It is an original browser game. It does **not** run the Grand-V engine, and it does not use Rockstar or Take-Two assets.

The play area is Circular Quay, the Sydney Opera House, the Sydney Harbour Bridge, Milsons Point, and the north-CBD waterfront. One lap is the whole game.

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

1. Read the title card. Choose **Start the Quay Loop**.
2. You start in a red coupe at Circular Quay, facing the Opera House.
3. Drive through the four gold rings, in order:
   - Opera House forecourt
   - Harbour Bridge crest
   - Milsons Point
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
