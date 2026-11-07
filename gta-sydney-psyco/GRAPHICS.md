# Graphics feasibility

This note answers a direct request for GTA V-level graphics. It does not claim the current build is that, and it does not start an engine rewrite.

## What is running now

The game is a browser page: Vite, Three.js 0.170.0, WebGL. Buildings are extruded OpenStreetMap footprints with tiled CC0 photos (asphalt, brick, concrete, grass). The Opera House is generated shells on the OSM footprint. The bridge is a generated truss. The deck uses a stylized sine that peaks at 30 m. Water is a shader on the OSM harbour polygon. There is one shadow-casting sun. No Unreal Engine, Unity, or other desktop engine is installed in this environment.

Measured from the current chart, not from a new survey:

- Distance between the published Opera House coordinate and the published bridge coordinate, in this project's local metre projection: 648.5 m.
- Opera House footprint extent in that projection: 135.3 m east-west, 179.7 m north-south. Centroid is 40.0 m from the published point.
- Bridge roadway polyline: 1149.6 m, stored as 6 points. The in-game crest is a stylized 30 m hump, not a surveyed deck height.
- OSM height tags kept for some towers, for example Salesforce Tower 263 m, Governor Phillip Tower 227 m, Aurora Place 160 m. The Opera House podium in the game is forced to 7 m and marked `stylized-podium`.

Those figures show a map with some real plan coordinates and some real tagged heights. They do not show a photographed city.

## What "GTA V-level" actually requires

GTA V's look is a finished art production on the RAGE engine: unique landmark models, unique facade and prop textures, dense street dressing, authored lighting, levels of detail, and a vehicle and character set built for that world. It is not a material setting.

Two separate jobs are easy to mix up:

- An original realistic game can aim at that *kind* of image. It still needs its own models, textures, and lighting. It cannot use Rockstar meshes, textures, characters, or the RAGE runtime. Grand-V's public repo does not contain that runtime. GTA3Web is an unlicensed GTA III web build and is not a GTA V graphics pack.
- Reusing GTA V assets would be copying their intellectual property. That is not available here and is not a planned path.

## Could this browser stack get there?

Three.js can do physically based materials, image-based lighting, post-processing, instancing, and level-of-detail. A browser can show a much denser scene than this prototype. It still cannot invent the missing art.

To approach a modern open-world look for even the quay, Circular Quay, and the bridge approach, the missing pieces are:

- Hero models of the Opera House and Harbour Bridge, not extruded footprints or a 30 m generated arch.
- Unique building faces for that block, not one brick tile and one concrete tile on every footprint.
- Street props, kerbs, wharves, trees, and vehicles at a consistent art standard.
- A lighting setup built around those assets (HDR environment, local lights, stable shadows). A better water shader does not supply that.

That is an art pipeline. It is not a weekend change to `world.js`. No timeframe is promised. The current page should keep being described as a low-poly sandbox.

## Would Unreal Engine 5 be required?

Not required to improve the browser scene. It is the practical desktop choice if the goal is Lumen-style global illumination, Nanite-scale meshes, and a shipping-game lighting model. Nanite and Lumen do not create Sydney. They light and draw assets you still have to model or license.

This machine does not have Unreal installed. Installing it is a large toolchain and was not started. Megascans-quality scans are tied to Epic's Unreal licence terms and are not dropped into this Three.js page. The owner has not chosen browser or desktop. Until that choice is explicit, the prototype stays in Three.js.

## Data that would feed a realistic quay, and what is blocked

Checked sources, not assumed open:

- City of Sydney's own 3D city model is supplied by AAM under a licence that the City told an FOI applicant does not extend to third parties. It is not a free download. https://www.righttoknow.org.au/request/3d_models_for_city_of_sydney
- NSW Spatial Services' 7.5 cm Greater Sydney aerial mosaic is an all-of-government product with restricted terms accepted before supply. It is not an open texture we can ship. https://www.surveyors.org.au/news-item/14295/dcs-spatial-services-imagery-release
- ELVIS and Geoscience Australia publish elevation, much of it Creative Commons Attribution, including a public WCS named `DEM_LiDAR_5m_2025`. A capabilities document was retrieved. A Sydney Harbour sample was not extracted in this pass, so coverage and resolution at the quay are not claimed here. https://elevation.fsdf.org.au/ and https://services.ga.gov.au/gis/services/DEM_LiDAR_5m_2025/MapServer/WCSServer
- Sketchfab models already identified (Opera House by Nick Reinhardt, bridge by ParaPup, Sydney by joselitojnior) are CC BY 4.0 and stylized or low-poly. They are not GTA V-quality scans. Download still needs a logged-in Sketchfab account. Anonymous download returned 401.
- The attached `Sydney_City Skyline.dae` has no licence and no textures. It is not used.

OpenStreetMap footprints and tagged heights remain the only geometry actually in the game. That can be metrically useful. It does not look like GTA V.

## Recommended next step

Do not rewrite the engine yet. The owner picks one platform:

1. Stay in the browser. Commission or supply original, licensed hero models and unique textures for one quay block, then this Three.js scene can be rebuilt around those files. Expect a high-end browser scene, not GTA V.
2. Move to desktop Unreal later, only after an explicit yes to install it. Still original or properly licensed art. Still not GTA files.

Until one of those asset sets exists, further shader and tiling-texture passes will not close the gap the screenshot shows.
