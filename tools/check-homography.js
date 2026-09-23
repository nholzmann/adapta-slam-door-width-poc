#!/usr/bin/env node
// Synthetic self-check for reference.js planar math. No OpenCV, no DOM.
// Card case uses a mild perspective. Letter case is a 45° pitch from nadir.

const path = require('path')
const ref = require(path.join(__dirname, '..', 'reference.js'))

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function nearly(actual, expected, tol, label) {
  const err = Math.abs(actual - expected)
  if (err > tol) fail(`${label}: got ${actual}, expected ${expected} ± ${tol} (err ${err})`)
  return err
}

// Known perspective taking millimetres on the card plane to pixels.
const FORWARD = [
  2.35, 0.18, 500,
  0.14, 2.20, 300,
  0.00035, 0.00055, 1,
]

const iso = [
  {x: 0, y: 0},
  {x: ref.CARD_LONG_MM, y: 0},
  {x: ref.CARD_LONG_MM, y: ref.CARD_SHORT_MM},
  {x: 0, y: ref.CARD_SHORT_MM},
]

const pixelCorners = iso.map((p) => {
  const q = ref.applyHomography(FORWARD, p.x, p.y)
  if (!q) fail('forward homography dropped an ISO corner')
  return q
})

const shuffled = [pixelCorners[2], pixelCorners[0], pixelCorners[3], pixelCorners[1]]
const ordered = ref.orderCorners(shuffled)
for (let i = 0; i < 4; i++) {
  nearly(ordered[i].x, pixelCorners[i].x, 1e-6, `orderCorners[${i}].x`)
  nearly(ordered[i].y, pixelCorners[i].y, 1e-6, `orderCorners[${i}].y`)
}

const H = ref.solveHomography(ordered, ref.isoDestinationMm(ordered))
if (!H) fail('solveHomography returned null')

let maxCornerErr = 0
for (let i = 0; i < 4; i++) {
  const back = ref.applyHomography(H, ordered[i].x, ordered[i].y)
  if (!back) fail(`reprojected corner ${i} is null`)
  const err = Math.hypot(back.x - iso[i].x, back.y - iso[i].y)
  if (err > maxCornerErr) maxCornerErr = err
}
if (maxCornerErr > 0.05) fail(`ISO corner reprojection ${maxCornerErr.toFixed(4)} mm > 0.05 mm`)

const TARGET_MM = 914.4
const floorA = {x: -400, y: 20}
const floorB = {x: floorA.x + TARGET_MM, y: 20}
const pixelA = ref.applyHomography(FORWARD, floorA.x, floorA.y)
const pixelB = ref.applyHomography(FORWARD, floorB.x, floorB.y)
const recoveredMm = ref.planarDistanceMm(H, pixelA, pixelB)
if (recoveredMm == null) fail('planarDistanceMm returned null')
const distanceErr = Math.abs(recoveredMm - TARGET_MM)
if (distanceErr > 0.5) {
  fail(`914.4 mm pair recovered ${recoveredMm.toFixed(4)} mm (err ${distanceErr.toFixed(4)} mm > 0.5 mm)`)
}

const identity = ref.solveHomography(iso, iso)
const identDist = ref.planarDistanceMm(identity, {x: 0, y: 0}, {x: TARGET_MM, y: 0})
nearly(identDist, TARGET_MM, 1e-6, 'identity 914.4 mm')

const cardQuad = ref.defaultQuadAt(200, 200, 1000, 1000)
nearly(cardQuad[1].x - cardQuad[0].x, 180, 1e-6, 'card manual quad width')
nearly(cardQuad[2].y - cardQuad[1].y, 113, 1e-6, 'card manual quad height')
const sheetQuad = ref.defaultQuadAt(400, 400, 2000, 2000, ref.LETTER_REF)
nearly(sheetQuad[1].x - sheetQuad[0].x, 300, 1e-6, 'letter manual quad width')
nearly(sheetQuad[2].y - sheetQuad[1].y, 232, 1e-6, 'letter manual quad height')

// Letter sheet on the floor, camera pitched 45° from nadir (straight down).
// The sheet's long axis runs across the view so foreshortening does not
// swap the long and short edges. A 914.4 mm span on the same plane must
// come back through referenceDestinationMm.
function vecNorm(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return {x: v.x / len, y: v.y / len, z: v.z / len}
}

function vecCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function vecDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

const cameraHeightMm = 1200
const camera = {x: 0, y: -cameraHeightMm, z: cameraHeightMm}
const forward = vecNorm({x: -camera.x, y: -camera.y, z: -camera.z})
const right = vecNorm(vecCross(forward, {x: 0, y: 0, z: 1}))
const down = vecCross(forward, right)
const focalPx = 1500
const principal = {x: 1000, y: 750}

function projectFloor(worldX, worldY) {
  const delta = {
    x: worldX - camera.x,
    y: worldY - camera.y,
    z: 0 - camera.z,
  }
  const camX = vecDot(right, delta)
  const camY = vecDot(down, delta)
  const camZ = vecDot(forward, delta)
  if (camZ <= 1) fail(`letter point (${worldX}, ${worldY}) is behind the 45° camera`)
  return {
    x: focalPx * (camX / camZ) + principal.x,
    y: focalPx * (camY / camZ) + principal.y,
  }
}

const letter = ref.LETTER_REF
const halfLong = letter.longMm / 2
const halfShort = letter.shortMm / 2
const letterWorld = [
  {x: -halfLong, y: -halfShort},
  {x: halfLong, y: -halfShort},
  {x: halfLong, y: halfShort},
  {x: -halfLong, y: halfShort},
]
const letterPixels = letterWorld.map((p) => projectFloor(p.x, p.y))
const letterShuffled = [letterPixels[2], letterPixels[0], letterPixels[3], letterPixels[1]]
const letterFit = ref.homographyPixelsToMm(letterShuffled, letter)
if (!letterFit || !letterFit.H) fail('letter homographyPixelsToMm returned null')

const letterFloorA = {x: -TARGET_MM / 2, y: 30}
const letterFloorB = {x: TARGET_MM / 2, y: 30}
const letterPixelA = projectFloor(letterFloorA.x, letterFloorA.y)
const letterPixelB = projectFloor(letterFloorB.x, letterFloorB.y)
const letterRecovered = ref.planarDistanceMm(letterFit.H, letterPixelA, letterPixelB)
if (letterRecovered == null) fail('letter planarDistanceMm returned null')
const letterErr = Math.abs(letterRecovered - TARGET_MM)
if (letterErr > 0.5) {
  fail(`letter 914.4 mm span at 45° recovered ${letterRecovered.toFixed(4)} mm (err ${letterErr.toFixed(4)} mm > 0.5 mm)`)
}

console.log('orderCorners: TL/TR/BR/BL recovered from shuffled pixels')
console.log(`ISO corner reprojection max error: ${maxCornerErr.toExponential(3)} mm`)
console.log(`card long edge in synthetic image: ${ref.meanLongEdgePx(ordered).toFixed(1)} px`)
console.log(`card recovered distance: ${recoveredMm.toFixed(4)} mm (target ${TARGET_MM} mm)`)
console.log(`card distance error: ${distanceErr.toExponential(3)} mm (limit 0.5 mm)`)
console.log(`letter sheet ${letter.longMm}×${letter.shortMm} mm, camera pitch 45° from nadir`)
console.log(`letter long edge in synthetic image: ${letterFit.cardLongPx.toFixed(1)} px`)
console.log(`letter recovered distance: ${letterRecovered.toFixed(4)} mm (target ${TARGET_MM} mm)`)
console.log(`letter distance error: ${letterErr.toExponential(3)} mm (limit 0.5 mm)`)
console.log('PASS')
