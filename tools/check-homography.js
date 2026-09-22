#!/usr/bin/env node
// Synthetic-card self-check for reference.js planar math. No OpenCV, no DOM.

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

console.log('orderCorners: TL/TR/BR/BL recovered from shuffled pixels')
console.log(`ISO corner reprojection max error: ${maxCornerErr.toExponential(3)} mm`)
console.log(`card long edge in synthetic image: ${ref.meanLongEdgePx(ordered).toFixed(1)} px`)
console.log(`recovered distance: ${recoveredMm.toFixed(4)} mm (target ${TARGET_MM} mm)`)
console.log(`distance error: ${distanceErr.toExponential(3)} mm (limit 0.5 mm)`)
console.log('PASS')
