# Research findings — 8th Wall engine binary for door-width measurement

Verified 2026-09-22 against the live npm package, the engine binary itself, and 8thwall.org docs.

## Engine facts (verified)

- **Package:** `@8thwall/engine-binary` 1.0.0 on npm, served by jsDelivr. Files: `dist/xr.js` (1.0 MB core),
  `dist/xr-slam.js` (5.5 MB SLAM chunk, lazy-loaded), `dist/xr-face.js`, `dist/resources/*`, `dist/LICENSE`.
- **Load:** one script tag, no build step:
  `<script src="https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js" async crossorigin="anonymous" data-preload-chunks="slam"></script>`
  The engine fires a `window` event `xrloaded` when `window.XR8` is ready.
- **No app key.** The binary runs in "standalone mode" (its own error string: "Platform token is not available in
  standalone mode"). The old `appKey` attribute is read but unused. The 8th Wall hosted platform shut down 2026-02-28.
- **Script tag naming matters:** the binary locates itself with the regex `/(xrweb|xr\.js)(\?.*)?$/` over `document.scripts`
  and throws "Missing xrweb script tag" otherwise. Keep the file name `xr.js`.
- **SLAM is only in the binary.** The MIT open-source `@8thwall/engine` has no SLAM module.
- **XRExtras** (`@8thwall/xrextras` 1.0.0, MIT) is still published and on jsDelivr:
  `https://cdn.jsdelivr.net/npm/@8thwall/xrextras@1/dist/xrextras.js`. It provides `Loading` (start-up screen, iOS motion
  permission prompt flow), `AlmostThere` (unsupported-browser hints), `FullWindowCanvas`, `RuntimeError`.
- **three.js:** `XR8.Threejs.pipelineModule()` expects `window.THREE`. three.js ≥ r160 is ESM-only, so use an import map
  and assign `window.THREE` (pattern from 8thwall/web `examples/threejs/placeground`). Verified URL:
  `https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.min.js`.

## API surface we rely on

- `XR8.XrController.configure({scale: 'absolute'})` — MUST be called before `XR8.XrController.pipelineModule()` and
  `XR8.run()`. `'responsive'` (default) is NOT metric. `'absolute'` returns camera/world positions in **meters**; the
  camera's y-position becomes its physical height above the detected ground plane once scale is estimated.
- `XR8.run({canvas})` — opens the back camera and starts the run loop. SLAM is back-camera only. HTTPS required.
- `XR8.addCameraPipelineModules([...])` — order used by the official example: `GlTextureRenderer`, `Threejs`,
  `XrController`, XRExtras modules, then the app module.
- `XR8.XrController.hitTest(x, y, includedTypes)` — x,y in [0,1] from the top-left of the camera feed. Returns
  `[{type, position:{x,y,z}, rotation:{x,y,z,w}, distance}]`, type ∈ `FEATURE_POINT | ESTIMATED_SURFACE | DETECTED_SURFACE`.
- `XR8.Threejs.xrScene()` → `{scene, camera, renderer}` after the Threejs module's `onStart`.
- `XR8.XrController.updateCameraProjectionMatrix({origin, facing})` — set the starting pose in `onStart`.
- `XR8.XrController.recenter()` — resets tracking (official examples bind it to a two-finger tap).
- Per-frame `onUpdate({processCpuResult})` exposes `processCpuResult.reality.trackingStatus`
  (`INITIALIZING | LIMITED | NORMAL | NOT_AVAILABLE`) and `trackingReason` (`INSUFFICIENT_FEATURES | EXCESSIVE_MOTION | ...`).
- The engine tracks **one dynamic ground plane at y = 0**; there is no vertical-plane detection.
- `XR8.XrDevice.isDeviceBrowserCompatible()` / `incompatibleReasons()` for device gating.

## License / attribution (required)

Exact notice, from the 8th Wall Attribution Guidelines (https://8thwall.org/docs/open-source):

> Copyright © 2026 Niantic Spatial, Inc. All rights reserved. License: https://github.com/8thwall/engine/blob/main/LICENSE

For web projects it may live in `index.html` source, but this spike puts it visibly on the page (about/credits line),
which satisfies the stricter reading in BRIEF.md. A copy of the LICENSE text is kept in the repo as
`LICENSE-8thwall-engine.txt` (the license itself, not our code's license).

## Locked implementation decisions

1. **Static site:** `index.html` + `app.js` only. No bundler, no framework, no backend. Hosted on GitHub Pages from `main`.
2. **Absolute scale** is mandatory. The UI must show whether tracking is `NORMAL` and the estimated camera height
   (meters and inches) as a live sanity check: if absolute scale is right, the height should look like a real
   hand-held height (roughly 1.1–1.6 m). Testers record this next to every measurement.
3. **Measurement method (primary): floor-plane taps.** The user taps where each door jamb meets the floor. Each tap is
   converted to a ray from the three.js camera and intersected with the ground plane y = 0. The distance between the
   two points, in meters, ×39.3701 = inches. This is robust because the engine's only detected plane is the floor.
4. **Measurement method (secondary, displayed smaller):** `XR8.XrController.hitTest(x, y, ['FEATURE_POINT',
   'ESTIMATED_SURFACE', 'DETECTED_SURFACE'])`, nearest result. Shown as a second number so the test report can compare
   the two. If no hit is returned, show "no feature hit".
5. **Markers:** a small sphere at each placed point and a line between them, rendered in the three.js scene so testers
   can see whether the points stay anchored while the phone moves (drift check).
6. **Controls:** Reset (clears both points), Recenter (calls `recenter()`), plus a session-only list of measurements
   taken (in memory, no persistence) with a "Copy results" button that copies the list as tab-separated text.
7. **Permissions/unsupported browsers:** use XRExtras `Loading`, `AlmostThere`, `FullWindowCanvas`, `RuntimeError`.
   iOS Safari needs the motion permission tap that `Loading` handles; Android Chrome works with the same code.
8. **Out of scope:** styling beyond legibility, persistence, auth, Adapta data model, vertical-plane tricks.

## Known risks to watch in testing

- ±0.5 in on a ~36 in door is ~1.4 % error; monocular visual-inertial scale estimation may not reach that. Record raw
  deltas and judge at both ±0.5 in and ±1 in.
- Scale needs a few seconds of deliberate phone motion after start; measuring before `NORMAL` will be wrong.
- Low-texture floors (plain carpet, glossy tile) degrade tracking. Note the floor type per door in the protocol.

## Reference method (credit card)

A second tab, `reference.html`, measures from a still photo using a US credit card or a US Letter sheet as the scale reference. No 8th Wall engine or SLAM is loaded on that page.

### ISO/IEC 7810 ID-1

A US credit card is **85.60 mm × 53.98 mm**, corner radius **3.18 mm**. Because the corners are rounded, detection fits the four **edges** as lines (`Canny` pixels in a 4 px band, excluding the 8 % nearest each end, then `cv.fitLine`) and intersects those lines to recover the virtual sharp corners. Corner pixels themselves are not a stable feature.

### Homography

Once the four virtual corners are known, they are ordered top-left, top-right, bottom-right, bottom-left (angle about the centroid). The long pair of opposite edges is identified by average pixel length, and `cv.getPerspectiveTransform` (exactly 4 points) maps image pixels onto the ISO rectangle in millimetres — either 85.60 × 53.98 or 53.98 × 85.60. A standalone 4-point DLT (`solveHomography`) is the fallback if `cv` is missing. Two taps are mapped through that homography; the Euclidean distance in the card's plane is the measurement.

- **Floor mode:** card flat on the floor at the threshold; taps at the two jamb bases (door width).
- **Wall mode:** card held flat against the wall; taps at the floor line and a height mark (for example floor to handrail).

Everything is a still-image, planar-homography measurement: no SLAM, so no scale drift from the engine's camera-height estimate.

The level gate was removed because a planar homography is exact for any camera angle; the accuracy driver is how many pixels the reference spans, not tilt, so tilt is only recorded. A US Letter sheet (279.4 mm × 215.9 mm) is the alternative reference because it is about 3.3× longer than the ID-1 card, which makes the same 1 px edge error a smaller fraction of the measurement.

### Error budget

With a full-resolution frame and the card at chest height over the floor, the card spans ~150–250 px. A 1 px edge-fit error is ~0.5 % of scale → ~0.2 in on a 36 in door. Finger taps are the larger error, so the UI uses a 3× loupe and 28 px draggable handles. The page warns when the card's long edge is under 120 px.

A small reference off the measurement line is unstable: the homography learns the recession rate from the reference's depth-direction edges, and on a credit card those edges were only about 35 px, so a 2 px edge error is several percent of that rate. Extrapolating it across a step of depth between the card and the jamb taps turned a 32 in door into a 98 in reading. Two references, each with one edge flush against a jamb, remove that extrapolation — both ends of the gap are anchored to a known length, and the width is the perpendicular distance between those edges.

The two-reference fit does not assume which edge spans the doorway: it tries all four long/short pairings and keeps the lowest eight-corner reprojection, because a card with its long edge along the jamb is a 53.98 mm span, not 85.60 mm, and that assumption stretched a 32 in door to about 51 in. In one-reference mode the two jamb taps are mapped into the sheet's axis-aligned frame and the width is the larger metric component, so a tap that slides along the jamb changes the chord but not the perpendicular width.

Vision library: OpenCV.js (Apache-2.0) from `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4/dist/opencv.min.js`. Capture draws the live video frame onto an offscreen canvas at intrinsic size (no downscale) and measures on that image. OpenCV.js CDN builds do not ship the ArUco module, so marker detection uses **js-aruco2** (MIT) from jsDelivr (`src/cv.js`, `src/aruco.js`, `src/dictionaries/aruco_mip_36h12.js`). js-aruco2's global is `CV`; OpenCV's is `cv`. They do not collide in JavaScript; the page still snapshots `window.JSARUCO = {CV, AR}` before OpenCV loads.

### Printed ArUco template (Letter v1)

A dark credit card in shadow lost to a larger, sharper shadow/plank region: the quad scorer rewards area and has no notion of what a card is. Fiducials fix that. Four **ARUCO_MIP_36h12** markers (ids 0–3) give the sheet an identity, js-aruco2's adaptive threshold copes with uneven lighting, and sixteen corners (four per marker) overdetermine the plane so one occluded marker can be synthesised from the others.

The printable page is US Letter landscape. Each marker's outer black square is 2.00 in. The measurement rectangle is the outermost corner of each marker: 9.80 × 7.30 in. That quad plugs into the existing 1-ref and 2-ref solvers unchanged.

Print-scale checksum, three layers:

1. A credit-card outline (ISO ID-1) on the sheet — a physical card must line up, or the print is scaled.
2. A 6.00 in bar — a tape measure, typed into **Bar measured (in)**. That value wins.
3. Automatic paper-edge: the Letter stock stays 11 × 8.5 when the printer “fits to page”; only the ink shrinks. Mapped through the unscaled-marker homography, a 97 % print makes the paper look 1/0.97 too large, so `s = 279.4 / measuredPaperLongMm` is 0.97. Apply `s` to the template millimetres. Long and short ratios must agree within 1 %, else `print_scale = unverified`.

Lens calibration from the template is not this round.

### Two-reference warning thresholds (cards)

A two-card reading of 22.5 in on a 23.0 in door was flagged “references disagree” with `scale_drift` 2.36. The drift check extrapolates a single ~300 px card across the whole gap, so it is noisy when both long edges are small. `SCALE_DRIFT_WARN` is 0.15 when both long edges are under 400 px, and 0.05 otherwise. `FIT_RMS_WARN_MM` is 3 mm (was 2 mm) for the same reason.

### Plain-paper aspect from perspective

Assigning long and short by pixel length fails when the long edge points away from the camera. A Letter sheet with its 11 in edge perpendicular to a 36 in door (that edge foreshortened until it was shorter in the image than the 8.5 in edge) read **48.4 in**. The scale ratio at the tap was 1.468, just under the old 1.5 warning, so the bad width was not flagged. The warning threshold is now 1.3.

The replacement is the rectangle aspect recovery in Zhang and He, "Whiteboard scanning and image enhancement", *Digital Signal Processing* 17 (2007). For image corners ordered TL, TR, BR, BL, with the principal point at the image centre, homogeneous points are `m_i = (x_i − u0, y_i − v0, 1)`. BR, the corner opposite TL, is the auxiliary point of the two pencils. With `k_tr`, `k_bl` the coefficients that put `n_tr = k_tr·m_tr − m_tl` and `n_bl = k_bl·m_bl − m_tl` on those edge directions,

`f² = −(n_tr.x·n_bl.x + n_tr.y·n_bl.y) / (n_tr.z·n_bl.z)`

when both `|k − 1| > 1e-3` (neither edge pair is parallel in the image). The estimate is kept only if `f² > 0` and `f` is between 0.45 and 1.6 times the longer image side. Otherwise `f = 0.72 × max(imageW, imageH)`, a typical phone main camera (~70° horizontal). The physical ratio of TL→TR to TL→BL is

`whRatio² = (n_tr.x² + n_tr.y² + n_tr.z²·f²) / (n_bl.x² + n_bl.y² + n_bl.z²·f²)`.

The edge pair whose ratio is closer in log space to the sheet's long/short than to its reciprocal is the long side. The same `whRatio`, taken door-edge over jamb-edge, breaks orientation ties in the two-reference fit. If the quad is degenerate the pixel-length rule remains. A synthetic 45° view of that 36 in failure is about 1.29× too wide under the old rule and 914.4 mm under the new one, including when the focal length is estimated and when the fallback focal length is 20% off. The meta line records the recovered long/short (`aspect`, Letter ≈ 1.29 either way the sheet is laid) and whether `f` was estimated or the fallback.

Printed markers are tried on every tap before the picker's outline search. Two or more template markers use the outer-marker quad regardless of the picker (`reference` `template:letter-v2`, `auto_markers` `y`). The picker still selects the plain-paper size. A Printed-template picker with no markers falls back to plain Letter.

### Why this tab exists (SLAM field test)

A taped **32.0 in** door read **21.1 in** on the SLAM tab, with the engine's camera-height estimate at **0.81 m** (it wandered 0.47–1.76 m across the session). Scale drift is confirmed. That is not viable at the ±0.5 in success line, which is why this still-image planar method exists as a second measurement.

## 2026-09-24 — Guided flow (round 14)

Removed from the product, not from this history:

- **SLAM / 8th Wall.** The engine is no longer loaded. `index.html` is the still-photo flow; `app.js` and `LICENSE-8thwall-engine.txt` are deleted. Scale drift on the SLAM tab is already documented above (32.0 in taped, 21.1 in read, camera height wandering 0.47–1.76 m).
- **Credit card and the other paper presets** (legal pad, notepad, A4, custom size). A card is too small: the homography learned recession from edges about 35 px tall and a 32 in door read 98 in. That error budget is already documented above.
- **Two-reference layout, the reference picker popover, and the top tab bar.** The measuring page is one guided flow. The printed Adapta template is the primary reference; plain US Letter is the fallback.

Line-length memory: the taped 6 in line is stored in `localStorage` under `adapta.lineLengthIn` (every read/write in try/catch). It used to be session-only and cleared on reload. The recovered print-scale factor from the paper edge is still session-only.

The measurement math is unchanged: marker positions, template geometry, homography, perspective aspect recovery, `choosePrintScale`, paper-edge checksum, axis projection, and warning thresholds. measure.js still exports the card / two-ref / custom symbols used by `tools/check-homography.js`.
