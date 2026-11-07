# Attribution and what this game does not include

## Guns, avatars, and physics are not in the Grand-V repo

Checked again on 2026-11-07.

- `main` at `831c9aefba58aefe5b284106f06bfbf414da7b4a` is the launcher described below.
- Branch `launcher-build-2026-10-16` (`43bf0f383753b4c4900a0c6e94051af8c1b2efe8`) is the same launcher tree: Rust host, workflows, logo. No weapon code, no character mesh, no physics module.
- The GitHub releases list is empty.
- There is still no license.

The playable browser port associated with the Grand-V name is a reverse-engineered RAGE / GTA V build. That engine, its weapons, its character models, and its physics are not published in this repository, and this project does not download them.

What you can use here instead, all original and on the Sydney map:

- On-foot avatar: a generated capsule body. Press F to leave the coupe and F again beside it to drive.
- Weapon: a blocky sidearm that fires glowing pellets with their own gravity. J, a short click, or Fire. Orange buoys along the start road pop when hit.
- Physics: the coupe and the avatar both use this project's gravity. Leaving the bridge deck drops the car; Space jumps only while you are on foot.

## This is not Grand-V

Upstream considered: [https://github.com/SebasKitten/Grand-V](https://github.com/SebasKitten/Grand-V)

Inspected on 2026-11-07 via the public GitHub API. Default branch `main`, commit `831c9aefba58aefe5b284106f06bfbf414da7b4a` (2026-10-22, message "Remove README download links and unlink rea attribution"). The license API returned 404. The repository JSON `license` field is `null`. There is no `LICENSE` file.

Public tree at that commit:

- `README.md`
- `grand-logo-v2.png`
- `.github/` (issue spam filter and a Rust launcher build workflow)
- `LauncherApp/` — a native Rust desktop launcher (`Cargo.toml`, HTTP server, relay, settings UI), donation wallet JSON, and troubleshooting notes

The README describes Grand-V as a browser port of GTA V on a reverse-engineered RAGE engine and states that game assets are not in the repository. No WebAssembly engine, no Sydney map, and no runnable game runtime are in the public tree. The launcher expects a separate proprietary game folder.

Nothing from that repository is copied or executed here:

- There is no license that would allow reuse.
- The published code is a launcher, not an engine.
- This project does not download Rockstar or Take-Two game data.

`GTA: Sydney Psyco` is an original browser sandbox. The title is the name requested for this prototype. It is not affiliated with Rockstar Games, Take-Two, or Grand-V.

## Map and 3D data

Processed file: `public/data/harbour.json`

| Item | Source | Licence |
| --- | --- | --- |
| Harbour water, including OpenStreetMap relation 1252425 (Sydney Harbour), clipped to the play box | OpenStreetMap, via the Overpass API | ODbL 1.0 |
| Roads, pedestrian plazas, parks, gardens, piers | OpenStreetMap | ODbL 1.0 |
| Building footprints and tagged heights / `building:levels` | OpenStreetMap | ODbL 1.0 |
| Sydney Opera House footprint (relation 9596872) | OpenStreetMap | ODbL 1.0 |
| Sydney Harbour Bridge / Bradfield Highway road centerlines | OpenStreetMap | ODbL 1.0 |

Play box: longitude 151.195 to 151.228, latitude -33.869 to -33.842. That covers Circular Quay, the Opera House, the Harbour Bridge, Milsons Point, The Rocks, Barangaroo's north end, and the north-CBD waterfront. The retrieval time is `meta.retrieved` inside `harbour.json`.

Attribution required for the database and for this produced view:

**© OpenStreetMap contributors** — [https://www.openstreetmap.org/copyright](https://www.openstreetmap.org/copyright)

ODbL: [https://opendatacommons.org/licenses/odbl/1-0/](https://opendatacommons.org/licenses/odbl/1-0/)

`harbour.json` is a derived database. It stays under the ODbL. The game code is MIT (see `LICENSE`). Share-alike applies to the database, not to the original JavaScript.

Regenerate with network access:

```bash
npm run fetch-map
```

`node scripts/fetch-harbour.mjs --reprocess` rebuilds from the last Overpass cache under `/tmp/gta-sydney-psyco-osm` when that cache is present.

### Real geometry versus stylized models

Real, from OpenStreetMap, in plan (metres, local tangent at the box centre):

- Harbour water polygon and island holes (Fort Denison and similar inners when they fall in the box)
- Road centerlines and classes, including George Street, Alfred Street, the Cahill Expressway, and the Bradfield Highway
- Park and garden polygons, pier lines, pedestrian plazas
- Building footprints
- Building heights where OSM has `height` or `building:levels`

Stylized, original, and not survey models:

- White Opera House shells. They are generated sails sitting on the OSM footprint. They are not architectural plans and not photogrammetry.
- Harbour Bridge arch, hangers, pylons, lane stripes, and the sine-shaped deck. The deck peaks at 30 m and meets the ground at the mapped ends of the averaged roadway. That is not the real 49 m clearance or the real 134 m arch.
- Car, ferry hull, trees, water shader, sky, and road colours
- Untagged buildings are not given fake skyscraper heights. This extract already has more than 2,200 tagged heights, so untagged footprints were left out. Any estimate that does get included is marked `heightSource: "estimated"` and stays under 25 m.

Not used:

- Google photogrammetry and 3D tiles
- Bing / Maxar imagery
- Microsoft's Australia building-footprint dump
- OpenStreetMap raster tiles (the minimap is drawn from the vector extract)
- The ocean `natural=coastline` ways do not cross this inner-harbour crop, so `coastline` in the file is empty. The shore you drive is the clipped harbour polygon.

If `harbour.json` fails to load, or the page is opened with `?synthetic=1`, the game switches to `src/synthetic.js`. That basin is a rectangle with placeholder shells. A red banner states that it is not Sydney Harbour. It must not be read as sourced geography.

## Code

- Original game code: MIT, `LICENSE`
- [Three.js](https://github.com/threejs/three.js) 0.170.0: MIT, dependency only. No Three.js example assets are vendored.
