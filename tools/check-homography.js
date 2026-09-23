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
// Principal point is the image centre, so the aspect check can run.
const letterFit = ref.homographyPixelsToMm(letterShuffled, letter, principal.x * 2, principal.y * 2)
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

const Hls = ref.solveHomographyLeastSquares(ordered, ref.isoDestinationMm(ordered))
if (!Hls) fail('solveHomographyLeastSquares returned null')
const lsRecovered = ref.planarDistanceMm(Hls, pixelA, pixelB)
if (lsRecovered == null) fail('least-squares planarDistanceMm returned null')
const lsErr = Math.abs(lsRecovered - TARGET_MM)
if (lsErr > 0.5) {
  fail(`least-squares 914.4 mm pair recovered ${lsRecovered.toFixed(4)} mm (err ${lsErr.toFixed(4)} mm > 0.5 mm)`)
}

// Jambs are parallel. B's taps sit 150 mm further along the jamb than A's,
// so the A1–B1 chord is the hypotenuse, not the door width.
const jambA1 = {x: 0, y: 0}
const jambA2 = {x: 0, y: 400}
const jambB1 = {x: TARGET_MM, y: 150}
const jambB2 = {x: TARGET_MM, y: 550}
const jambPx = [
  ref.applyHomography(FORWARD, jambA1.x, jambA1.y),
  ref.applyHomography(FORWARD, jambA2.x, jambA2.y),
  ref.applyHomography(FORWARD, jambB1.x, jambB1.y),
  ref.applyHomography(FORWARD, jambB2.x, jambB2.y),
]
const jambMm = jambPx.map((p) => ref.applyHomography(H, p.x, p.y))
if (jambMm.some((p) => !p)) fail('offset jamb point fell off the homography')
const jambLines = ref.perpendicularLinesDistanceMm(jambMm[0], jambMm[1], jambMm[2], jambMm[3])
if (!jambLines) fail('perpendicularLinesDistanceMm returned null')
const jambErr = Math.abs(jambLines.meanMm - TARGET_MM)
if (jambErr > 0.5) {
  fail(`line-to-line 914.4 mm with 150 mm jamb offset recovered ${jambLines.meanMm.toFixed(4)} mm (err ${jambErr.toFixed(4)} mm > 0.5 mm)`)
}
const rawChord = ref.planarDistanceMm(H, jambPx[0], jambPx[2])
const chordErr = Math.abs(rawChord - 926.6)
if (chordErr > 0.05) {
  fail(`offset A1–B1 chord ${rawChord.toFixed(4)} mm, expected 926.6 mm`)
}

// Floor, 45° from nadir and 20° yaw. Cards lie on the door line, outer short
// edges on the jambs (x = 0 and x = 914.4).
const yawCameraHeight = 800
const yawLook = {x: TARGET_MM / 2, y: ref.CARD_SHORT_MM / 2, z: 0}
const yawRad = 20 * Math.PI / 180
const yawHoriz = yawCameraHeight
const yawCamera = {
  x: yawLook.x + yawHoriz * Math.sin(yawRad),
  y: yawLook.y - yawHoriz * Math.cos(yawRad),
  z: yawLook.z + yawCameraHeight,
}
const yawForward = vecNorm({
  x: yawLook.x - yawCamera.x,
  y: yawLook.y - yawCamera.y,
  z: yawLook.z - yawCamera.z,
})
const yawRight = vecNorm(vecCross(yawForward, {x: 0, y: 0, z: 1}))
const yawDown = vecCross(yawForward, yawRight)
const yawFocal = 2400
const yawPrincipal = {x: 960, y: 720}

function projectYawed(worldX, worldY) {
  const delta = {
    x: worldX - yawCamera.x,
    y: worldY - yawCamera.y,
    z: 0 - yawCamera.z,
  }
  const camX = vecDot(yawRight, delta)
  const camY = vecDot(yawDown, delta)
  const camZ = vecDot(yawForward, delta)
  if (camZ <= 1) fail(`two-ref point (${worldX}, ${worldY}) is behind the yawed camera`)
  return {
    x: yawFocal * (camX / camZ) + yawPrincipal.x,
    y: yawFocal * (camY / camZ) + yawPrincipal.y,
  }
}

const cardLong = ref.CARD_LONG_MM
const cardShort = ref.CARD_SHORT_MM
const cardBOrigin = TARGET_MM - cardLong
const worldCardA = [
  {x: 0, y: 0},
  {x: cardLong, y: 0},
  {x: cardLong, y: cardShort},
  {x: 0, y: cardShort},
]
const worldCardB = [
  {x: cardBOrigin, y: 0},
  {x: cardBOrigin + cardLong, y: 0},
  {x: cardBOrigin + cardLong, y: cardShort},
  {x: cardBOrigin, y: cardShort},
]
const pixelsA = worldCardA.map((p) => projectYawed(p.x, p.y))
const pixelsB = worldCardB.map((p) => projectYawed(p.x, p.y))
const yawImageW = yawPrincipal.x * 2
const yawImageH = yawPrincipal.y * 2
const twoRef = ref.twoReferenceDestinationMm(pixelsA, pixelsB, ref.CARD_REF, 'floor', yawImageW, yawImageH)
if (!twoRef) fail('two-reference measurement returned null')
const twoRefErr = Math.abs(twoRef.widthMm - TARGET_MM)
if (twoRefErr > 0.5) {
  fail(`two-ref 45°+yaw 914.4 mm recovered ${twoRef.widthMm.toFixed(4)} mm (err ${twoRefErr.toFixed(4)} mm > 0.5 mm)`)
}
if (twoRef.orientA !== 'long-across' || twoRef.orientB !== 'long-across') {
  fail(`two-ref floor orientation ${twoRef.orientA}/${twoRef.orientB}, expected long-across/long-across`)
}

function makeRng(seed) {
  let state = seed >>> 0
  return function () {
    state = (state + 0x6D2B79F5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussianish(rng) {
  let u = rng()
  let v = rng()
  if (u < 1e-9) u = 1e-9
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const noiseRng = makeRng(8)
function noisify(corners) {
  return corners.map((p) => ({
    x: p.x + 0.5 * gaussianish(noiseRng),
    y: p.y + 0.5 * gaussianish(noiseRng),
  }))
}
const noisy = ref.twoReferenceDestinationMm(noisify(pixelsA), noisify(pixelsB), ref.CARD_REF, 'floor', yawImageW, yawImageH)
if (!noisy) fail('noisy two-reference measurement returned null')
const noisyErr = Math.abs(noisy.widthMm - TARGET_MM)
if (noisyErr > 5) {
  fail(`two-ref ±0.5 px noise recovered ${noisy.widthMm.toFixed(4)} mm (err ${noisyErr.toFixed(4)} mm > 5 mm)`)
}

// Wall, orthographic: A's bottom long edge at y = 1000, B's top long edge
// 914.4 mm above it. Image y grows downward, so the height mark is smaller y.
const wallShort = ref.CARD_SHORT_MM
const wallA = [
  {x: 100, y: 1000},
  {x: 100 + cardLong, y: 1000},
  {x: 100 + cardLong, y: 1000 - wallShort},
  {x: 100, y: 1000 - wallShort},
]
const wallTop = 1000 - TARGET_MM
const wallB = [
  {x: 100, y: wallTop},
  {x: 100 + cardLong, y: wallTop},
  {x: 100 + cardLong, y: wallTop + wallShort},
  {x: 100, y: wallTop + wallShort},
]
const wallRef = ref.twoReferenceDestinationMm(wallA, wallB, ref.CARD_REF, 'wall')
if (!wallRef) fail('wall two-reference measurement returned null')
const wallErr = Math.abs(wallRef.widthMm - TARGET_MM)
if (wallErr > 0.5) {
  fail(`wall two-ref 914.4 mm recovered ${wallRef.widthMm.toFixed(4)} mm (err ${wallErr.toFixed(4)} mm > 0.5 mm)`)
}
if (wallRef.orientA !== 'short-across' || wallRef.orientB !== 'short-across') {
  fail(`wall orientation ${wallRef.orientA}/${wallRef.orientB}, expected short-across/short-across`)
}

// Long edge along the jamb: the short edge spans the doorway. Same camera.
function cardOnFloor(x0, alongDoor, alongJamb) {
  return [
    {x: x0, y: 0},
    {x: x0 + alongDoor, y: 0},
    {x: x0 + alongDoor, y: alongJamb},
    {x: x0, y: alongJamb},
  ].map((p) => projectYawed(p.x, p.y))
}

function expectOrient(measured, label, orientA, orientB) {
  if (!measured) fail(`${label} returned null`)
  const err = Math.abs(measured.widthMm - TARGET_MM)
  if (err > 0.5) {
    fail(`${label} recovered ${measured.widthMm.toFixed(4)} mm (err ${err.toFixed(4)} mm > 0.5 mm)`)
  }
  if (measured.orientA !== orientA || measured.orientB !== orientB) {
    fail(`${label} orientation ${measured.orientA}/${measured.orientB}, expected ${orientA}/${orientB}`)
  }
  return err
}

const turned = ref.twoReferenceDestinationMm(
  cardOnFloor(0, cardShort, cardLong),
  cardOnFloor(TARGET_MM - cardShort, cardShort, cardLong),
  ref.CARD_REF,
  'floor',
  yawImageW,
  yawImageH
)
const turnedErr = expectOrient(turned, 'two-ref both long-along-jamb', 'short-across', 'short-across')

const mixed = ref.twoReferenceDestinationMm(
  cardOnFloor(0, cardShort, cardLong),
  cardOnFloor(TARGET_MM - cardLong, cardLong, cardShort),
  ref.CARD_REF,
  'floor',
  yawImageW,
  yawImageH
)
const mixedErr = expectOrient(mixed, 'two-ref A turned, B not', 'short-across', 'long-across')

// 1-ref: sheet edges are axis-aligned in its metric frame. A 150 mm slide
// along the jamb must not change the perpendicular width. The rotated sheet
// puts that doorway on the other metric axis (long edge along the jamb).
function roundTripSeparation(sheetCorners, mmA, mmB) {
  const pxCorners = sheetCorners.map((p) => ref.applyHomography(FORWARD, p.x, p.y))
  if (pxCorners.some((p) => !p)) fail('sheet forward dropped a corner')
  const fit = ref.homographyPixelsToMm(pxCorners, ref.LETTER_REF)
  if (!fit || !fit.H) fail('sheet homographyPixelsToMm returned null')
  const pxA = ref.applyHomography(FORWARD, mmA.x, mmA.y)
  const pxB = ref.applyHomography(FORWARD, mmB.x, mmB.y)
  if (!pxA || !pxB) fail('sheet-axis tap fell off the forward homography')
  const backA = ref.applyHomography(fit.H, pxA.x, pxA.y)
  const backB = ref.applyHomography(fit.H, pxB.x, pxB.y)
  if (!backA || !backB) fail('sheet-axis tap fell off the recovered homography')
  const sep = ref.sheetAxisSeparationMm(backA, backB)
  if (!sep) fail('sheetAxisSeparationMm returned null')
  return sep
}

const sheetLong = ref.LETTER_LONG_MM
const sheetShort = ref.LETTER_SHORT_MM
const sheetAlongDoor = [
  {x: 0, y: 0},
  {x: sheetLong, y: 0},
  {x: sheetLong, y: sheetShort},
  {x: 0, y: sheetShort},
]
const alignedSep = roundTripSeparation(sheetAlongDoor, {x: 0, y: 0}, {x: TARGET_MM, y: 150})
const alignedWidthErr = Math.abs(alignedSep.widthMm - TARGET_MM)
if (alignedWidthErr > 0.5) {
  fail(`sheet-axis width ${alignedSep.widthMm.toFixed(4)} mm (err ${alignedWidthErr.toFixed(4)} mm > 0.5 mm)`)
}
const alignedChordErr = Math.abs(alignedSep.chordMm - 926.6)
if (alignedChordErr > 0.5) {
  fail(`sheet-axis chord ${alignedSep.chordMm.toFixed(4)} mm, expected 926.6 mm`)
}
if (alignedSep.axis !== 'x') fail(`aligned sheet used axis ${alignedSep.axis}, expected x`)

// Same sheet turned so its long edge lies along the jamb. The doorway is then
// the short edge, which this corner order puts on metric y.
const sheetAlongJamb = [
  {x: 0, y: 0},
  {x: sheetLong, y: 0},
  {x: sheetLong, y: sheetShort},
  {x: 0, y: sheetShort},
]
const rotatedSep = roundTripSeparation(sheetAlongJamb, {x: 0, y: 0}, {x: 150, y: TARGET_MM})
const rotatedWidthErr = Math.abs(rotatedSep.widthMm - TARGET_MM)
if (rotatedWidthErr > 0.5) {
  fail(`rotated-sheet width ${rotatedSep.widthMm.toFixed(4)} mm (err ${rotatedWidthErr.toFixed(4)} mm > 0.5 mm)`)
}
const rotatedChordErr = Math.abs(rotatedSep.chordMm - 926.6)
if (rotatedChordErr > 0.5) {
  fail(`rotated-sheet chord ${rotatedSep.chordMm.toFixed(4)} mm, expected 926.6 mm`)
}
if (rotatedSep.axis !== 'y') fail(`rotated sheet used axis ${rotatedSep.axis}, expected y`)

const customPad = ref.customReference(11.75, 8.5)
if (ref.referenceToken(customPad) !== 'custom:11.75x8.5') {
  fail(`custom token ${ref.referenceToken(customPad)}, expected custom:11.75x8.5`)
}
if (ref.referenceToken(ref.LEGAL_REF) !== 'legal:11.75x8.5') {
  fail(`legal token ${ref.referenceToken(ref.LEGAL_REF)}, expected legal:11.75x8.5`)
}
if (ref.referenceToken(ref.NOTEPAD_REF) !== 'notepad:11.5x8.5') {
  fail(`notepad token ${ref.referenceToken(ref.NOTEPAD_REF)}, expected notepad:11.5x8.5`)
}
if (ref.referenceToken(ref.A4_REF) !== 'a4:11.69x8.27') {
  fail(`a4 token ${ref.referenceToken(ref.A4_REF)}, expected a4:11.69x8.27`)
}
if (ref.referenceToken(ref.templateReference(0.97)) !== 'template:letter-v2') {
  fail(`template token ${ref.referenceToken(ref.templateReference(0.97))}, expected template:letter-v2`)
}
if (ref.FIT_RMS_WARN_MM !== 3) fail(`FIT_RMS_WARN_MM ${ref.FIT_RMS_WARN_MM}, expected 3`)
if (ref.scaleDriftWarn(300, 280) !== 0.15) fail('scaleDriftWarn should be 0.15 when both long edges are under 400 px')
if (ref.scaleDriftWarn(500, 300) !== 0.05) fail('scaleDriftWarn should be 0.05 when either long edge is 400 px or more')

const PRINT_S = 0.97
const pageOrigin = {x: -ref.LETTER_LONG_MM / 2, y: -ref.LETTER_SHORT_MM / 2}

function inkWorld(xin, yin, originX, originY, printS) {
  return {
    x: originX + xin * ref.MM_PER_INCH * printS,
    y: originY + yin * ref.MM_PER_INCH * printS,
  }
}

function shuffledMarkerPixels(originX, originY, printS, projectFn) {
  const cornersById = {}
  for (let i = 0; i < ref.TEMPLATE_LETTER_V1.ids.length; i++) {
    const id = ref.TEMPLATE_LETTER_V1.ids[i]
    const inches = ref.templateMarkerOuterCornersIn(id)
    const pixels = inches.map((p) => {
      const w = inkWorld(p.x, p.y, originX, originY, printS)
      return projectFn(w.x, w.y)
    })
    cornersById[id] = [pixels[2], pixels[0], pixels[3], pixels[1]]
  }
  return cornersById
}

const templatePixels = shuffledMarkerPixels(pageOrigin.x, pageOrigin.y, PRINT_S, projectFloor)
const aligned = ref.alignTemplateMarkerCorners(templatePixels)
if (!aligned || aligned.ids.length !== 4) fail('template marker align returned null')
if (!(aligned.markerRmsMm < 0.05)) {
  fail(`template marker rms ${aligned.markerRmsMm} mm, expected < 0.05 mm`)
}
const built = ref.templateQuadFromAlignedMarkers(aligned)
if (!built || built.synthesized) fail('template outer quad should use all four markers')

const templateFloorA = {x: -TARGET_MM / 2, y: 40}
const templateFloorB = {x: TARGET_MM / 2, y: 40}
const templatePixelA = projectFloor(templateFloorA.x, templateFloorA.y)
const templatePixelB = projectFloor(templateFloorB.x, templateFloorB.y)

const uncorrectedFit = ref.homographyPixelsToMm(built.cardCorners, ref.templateReference(1))
if (!uncorrectedFit || !uncorrectedFit.H) fail('uncorrected template homography returned null')
const uncorrectedMm = ref.planarDistanceMm(uncorrectedFit.H, templatePixelA, templatePixelB)
const uncorrectedTarget = TARGET_MM / PRINT_S
if (Math.abs(uncorrectedMm - uncorrectedTarget) > 0.5) {
  fail(`uncorrected 0.97 print recovered ${uncorrectedMm.toFixed(4)} mm, expected ~${uncorrectedTarget.toFixed(1)} mm`)
}

const paperWorld = ref.templatePageCornersMm().map((p) => ({
  x: pageOrigin.x + p.x,
  y: pageOrigin.y + p.y,
}))
const paperPixels = paperWorld.map((p) => projectFloor(p.x, p.y))
const paperSize = ref.paperMappedSizeMm(paperPixels, aligned.H)
if (!paperSize || !ref.paperSizePlausible(paperSize.longMm, paperSize.shortMm)) {
  fail(`paper mapped size ${paperSize && paperSize.longMm} × ${paperSize && paperSize.shortMm} mm not in band`)
}
const paperScale = ref.recoverPrintScaleFromPaper(paperSize.longMm, paperSize.shortMm)
if (!paperScale.printScale || Math.abs(paperScale.printScale - PRINT_S) > 0.002) {
  fail(`paper print scale ${paperScale.printScale}, expected ${PRINT_S}`)
}
if (paperScale.source !== 'paper') fail(`print scale source ${paperScale.source}, expected paper`)

const barWins = ref.choosePrintScale(5.82, paperSize.longMm, paperSize.shortMm)
if (barWins.source !== 'bar' || Math.abs(barWins.printScale - 5.82 / 6) > 1e-9) {
  fail(`bar override lost to paper: ${JSON.stringify(barWins)}`)
}

const correctedFit = ref.homographyPixelsToMm(built.cardCorners, ref.templateReference(paperScale.printScale))
if (!correctedFit || !correctedFit.H) fail('corrected template homography returned null')
const correctedMm = ref.planarDistanceMm(correctedFit.H, templatePixelA, templatePixelB)
const correctedErr = Math.abs(correctedMm - TARGET_MM)
if (correctedErr > 0.5) {
  fail(`corrected 0.97 print recovered ${correctedMm.toFixed(4)} mm (err ${correctedErr.toFixed(4)} mm > 0.5 mm)`)
}

const three = {}
three[0] = templatePixels[0]
three[1] = templatePixels[1]
three[3] = templatePixels[3]
const alignedThree = ref.alignTemplateMarkerCorners(three)
const builtThree = alignedThree && ref.templateQuadFromAlignedMarkers(alignedThree)
if (!builtThree || !builtThree.synthesized || builtThree.markersFound !== 3) {
  fail('three-marker template should synthesise the missing outer corner')
}
const threeFit = ref.homographyPixelsToMm(builtThree.cardCorners, ref.templateReference(PRINT_S))
const threeMm = ref.planarDistanceMm(threeFit.H, templatePixelA, templatePixelB)
if (Math.abs(threeMm - TARGET_MM) > 0.5) {
  fail(`3-marker template recovered ${threeMm.toFixed(4)} mm, expected ${TARGET_MM} mm`)
}

function projectTemplateQuad(originX, originY, printS, projectFn) {
  const pixels = shuffledMarkerPixels(originX, originY, printS, projectFn)
  const fit = ref.alignTemplateMarkerCorners(pixels)
  const quad = fit && ref.templateQuadFromAlignedMarkers(fit)
  if (!quad) fail('two-ref template quad failed')
  return quad.cardCorners
}

function templateExtentFromTable() {
  const ids = ref.TEMPLATE_LETTER_V1.ids
  const squares = ref.TEMPLATE_LETTER_V1.outerSquaresIn
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < ids.length; i++) {
    const square = squares[ids[i]]
    if (square[0] < minX) minX = square[0]
    if (square[1] < minY) minY = square[1]
    if (square[2] > maxX) maxX = square[2]
    if (square[3] > maxY) maxY = square[3]
  }
  return {minX, minY, maxX, maxY}
}

const templateExtent = templateExtentFromTable()
if (Math.abs(ref.TEMPLATE_OUTER_LONG_IN - (templateExtent.maxX - templateExtent.minX)) > 1e-9) {
  fail(`TEMPLATE_OUTER_LONG_IN ${ref.TEMPLATE_OUTER_LONG_IN} drifted from the marker table`)
}
if (Math.abs(ref.TEMPLATE_OUTER_SHORT_IN - (templateExtent.maxY - templateExtent.minY)) > 1e-9) {
  fail(`TEMPLATE_OUTER_SHORT_IN ${ref.TEMPLATE_OUTER_SHORT_IN} drifted from the marker table`)
}
const outerAtFull = ref.templateOuterQuadMm(1)
if (Math.abs(outerAtFull[0].x - templateExtent.minX * ref.MM_PER_INCH) > 1e-6) {
  fail('outer quad min x is not the marker table')
}
if (Math.abs(outerAtFull[0].y - templateExtent.minY * ref.MM_PER_INCH) > 1e-6) {
  fail('outer quad min y is not the marker table')
}
if (Math.abs(outerAtFull[1].x - templateExtent.maxX * ref.MM_PER_INCH) > 1e-6) {
  fail('outer quad max x is not the marker table')
}
if (Math.abs(outerAtFull[2].y - templateExtent.maxY * ref.MM_PER_INCH) > 1e-6) {
  fail('outer quad max y is not the marker table')
}
if (Math.abs(outerAtFull[3].x - templateExtent.minX * ref.MM_PER_INCH) > 1e-6) {
  fail('outer quad BL x is not the marker table')
}

const frameInset = 0.4
const pageIn = ref.TEMPLATE_LETTER_V1.pageIn
const frameClearX = templateExtent.minX - frameInset
const frameClearY = templateExtent.minY - frameInset
const frameClearRight = pageIn[0] - templateExtent.maxX - frameInset
const frameClearBottom = pageIn[1] - templateExtent.maxY - frameInset
if (Math.abs(frameClearX - frameClearRight) > 1e-9 || Math.abs(frameClearY - frameClearBottom) > 1e-9) {
  fail('marker clearance to the clip frame is not symmetric')
}
if (Math.abs(frameClearX - 0.45) > 1e-9 || Math.abs(frameClearY - 0.45) > 1e-9) {
  fail(`markers should sit 0.45 in inside the clip frame, got ${frameClearX} × ${frameClearY}`)
}

function layoutBoxes(layout) {
  const boxes = [layout.card, layout.cardCaption, layout.barLine, layout.barCaption]
  for (let i = 0; i < layout.ticks.length; i++) boxes.push(layout.ticks[i])
  for (let i = 0; i < layout.nums.length; i++) boxes.push(layout.nums[i])
  return boxes
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const templateLayout = ref.templateInteriorLayoutIn()
if (templateLayout.card.y !== 2 || Math.abs(templateLayout.card.y + templateLayout.card.h - 4.125) > 1e-9) {
  fail(`card should run y 2–4.125, got ${templateLayout.card.y}–${templateLayout.card.y + templateLayout.card.h}`)
}
if (templateLayout.barLine.y !== 5.2) fail(`bar line y ${templateLayout.barLine.y}, expected 5.2`)
if (Math.abs(templateLayout.card.x * 2 + templateLayout.card.w - pageIn[0]) > 1e-9) fail('card is not centred')
if (Math.abs(templateLayout.barLine.x * 2 + templateLayout.barLine.w - pageIn[0]) > 1e-9) fail('bar is not centred')
if (Math.abs(templateLayout.barLine.w - ref.TEMPLATE_LETTER_V1.barIn) > 1e-12) fail('bar width drifted from the table')

const expandedMarkers = ref.TEMPLATE_LETTER_V1.ids.map((id) => {
  const square = ref.TEMPLATE_LETTER_V1.outerSquaresIn[id]
  return {
    id,
    x: square[0] - 0.25,
    y: square[1] - 0.25,
    w: (square[2] - square[0]) + 0.5,
    h: (square[3] - square[1]) + 0.5,
  }
})
const interiorBoxes = layoutBoxes(templateLayout)
for (let i = 0; i < interiorBoxes.length; i++) {
  const box = interiorBoxes[i]
  if (box.y < 1.1 - 1e-9 || box.y + box.h > 7.4 + 1e-9) {
    fail(`${box.name} leaves y [1.10, 7.40]`)
  }
  const outsideX = box.x < 3.1 - 1e-9 || box.x + box.w > 7.9 + 1e-9
  if (outsideX && (box.y <= 3.1 || box.y + box.h >= 5.4)) {
    fail(`${box.name} leaves the x-band without staying in the y-gap between markers`)
  }
  for (let k = 0; k < expandedMarkers.length; k++) {
    if (boxesOverlap(box, expandedMarkers[k])) {
      fail(`${box.name} intersects marker ${expandedMarkers[k].id} expanded by 0.25 in`)
    }
  }
  for (let j = i + 1; j < interiorBoxes.length; j++) {
    if (boxesOverlap(box, interiorBoxes[j])) fail(`${box.name} overlaps ${interiorBoxes[j].name}`)
  }
}

const originA = {x: -outerAtFull[0].x * PRINT_S, y: 0}
const originB = {x: TARGET_MM - outerAtFull[1].x * PRINT_S, y: 0}
const twoTemplate = ref.twoReferenceDestinationMm(
  projectTemplateQuad(originA.x, originA.y, PRINT_S, projectYawed),
  projectTemplateQuad(originB.x, originB.y, PRINT_S, projectYawed),
  ref.templateReference(PRINT_S),
  'floor',
  yawImageW,
  yawImageH
)
if (!twoTemplate) fail('two-ref templates returned null')
const twoTemplateErr = Math.abs(twoTemplate.widthMm - TARGET_MM)
if (twoTemplateErr > 0.5) {
  fail(`two-ref templates recovered ${twoTemplate.widthMm.toFixed(4)} mm (err ${twoTemplateErr.toFixed(4)} mm > 0.5 mm)`)
}

// Letter with the 11 in edge along depth (away from the camera). At 45°
// that edge is shorter in pixels than the 8.5 in edge, so the old
// pixel-length rule scales a 36 in door by about 11/8.5.
function projectLookAtOrigin(cam, focal, principalPt, worldX, worldY) {
  const look = vecNorm({x: -cam.x, y: -cam.y, z: -cam.z})
  const camRight = vecNorm(vecCross(look, {x: 0, y: 0, z: 1}))
  const camDown = vecCross(look, camRight)
  const delta = {x: worldX - cam.x, y: worldY - cam.y, z: -cam.z}
  const camX = vecDot(camRight, delta)
  const camY = vecDot(camDown, delta)
  const camZ = vecDot(look, delta)
  if (camZ <= 1) fail(`depth-letter point (${worldX}, ${worldY}) is behind the camera`)
  return {
    x: focal * (camX / camZ) + principalPt.x,
    y: focal * (camY / camZ) + principalPt.y,
  }
}

function normSheetAspect(aspect) {
  if (!aspect || !(aspect.ratio > 0)) fail('rectangleAspectFromPerspective returned null')
  return aspect.ratio >= 1 ? aspect.ratio : 1 / aspect.ratio
}

function depthLetterScene(cam, imageW, imageH, focalArg) {
  const sceneFocal = 1500
  const principalPt = {x: imageW / 2, y: imageH / 2}
  const halfLong = ref.LETTER_LONG_MM / 2
  const halfShort = ref.LETTER_SHORT_MM / 2
  const world = [
    {x: -halfShort, y: -halfLong},
    {x: halfShort, y: -halfLong},
    {x: halfShort, y: halfLong},
    {x: -halfShort, y: halfLong},
  ]
  const pixels = world.map((p) => projectLookAtOrigin(cam, sceneFocal, principalPt, p.x, p.y))
  const shuffled = [pixels[2], pixels[0], pixels[3], pixels[1]]
  const ordered = ref.orderCorners(shuffled)
  const aspect = ref.rectangleAspectFromPerspective(ordered, imageW, imageH, focalArg)
  const fit = ref.homographyPixelsToMm(shuffled, ref.LETTER_REF, imageW, imageH, focalArg)
  if (!fit || !fit.H) fail('depth-letter homographyPixelsToMm returned null')
  const pxA = projectLookAtOrigin(cam, sceneFocal, principalPt, -TARGET_MM / 2, 0)
  const pxB = projectLookAtOrigin(cam, sceneFocal, principalPt, TARGET_MM / 2, 0)
  const mm = ref.planarDistanceMm(fit.H, pxA, pxB)
  if (mm == null) fail('depth-letter planarDistanceMm returned null')
  const oldFit = ref.homographyPixelsToMm(shuffled, ref.LETTER_REF)
  if (!oldFit || !oldFit.H) fail('depth-letter old-rule homography returned null')
  const oldMm = ref.planarDistanceMm(oldFit.H, pxA, pxB)
  if (oldMm == null) fail('depth-letter old-rule distance returned null')
  const pairA = (Math.hypot(ordered[0].x - ordered[1].x, ordered[0].y - ordered[1].y)
    + Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y)) / 2
  const pairB = (Math.hypot(ordered[1].x - ordered[2].x, ordered[1].y - ordered[2].y)
    + Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y)) / 2
  return {mm, oldMm, aspect, pairA, pairB}
}

const letterRatio = ref.LETTER_LONG_MM / ref.LETTER_SHORT_MM
const depthCam = {x: 0, y: -1200, z: 1200}
const knownDepth = depthLetterScene(depthCam, 2000, 1500, 1500)
if (!(knownDepth.pairA > knownDepth.pairB)) {
  fail(`11 in edge was not the shorter pixel pair (${knownDepth.pairA.toFixed(1)} vs ${knownDepth.pairB.toFixed(1)})`)
}
nearly(normSheetAspect(knownDepth.aspect), letterRatio, 0.01, 'known-f Letter aspect')
if (knownDepth.aspect.focalSource !== 'given') {
  fail(`known-f focalSource ${knownDepth.aspect.focalSource}, expected given`)
}
const knownDepthErr = Math.abs(knownDepth.mm - TARGET_MM)
if (knownDepthErr > 0.5) {
  fail(`known-f depth Letter recovered ${knownDepth.mm.toFixed(4)} mm (err ${knownDepthErr.toFixed(4)} mm > 0.5 mm)`)
}

const estimatedDepth = depthLetterScene({x: 400, y: -1200, z: 1200}, 2000, 1500, null)
if (!estimatedDepth.aspect || estimatedDepth.aspect.focalSource !== 'estimated') {
  fail(`estimated focalSource ${estimatedDepth.aspect && estimatedDepth.aspect.focalSource}`)
}
nearly(estimatedDepth.aspect.focalPx, 1500, 1, 'estimated focal px')
nearly(normSheetAspect(estimatedDepth.aspect), letterRatio, 0.01, 'estimated Letter aspect')
const estimatedDepthErr = Math.abs(estimatedDepth.mm - TARGET_MM)
if (estimatedDepthErr > 0.5) {
  fail(`estimated-f depth Letter recovered ${estimatedDepth.mm.toFixed(4)} mm (err ${estimatedDepthErr.toFixed(4)} mm > 0.5 mm)`)
}

// Centred sheet: the across edges are parallel, so f is not observable and
// the fallback is used. Image width 2500 makes 0.72 × max side = 1800,
// 20% above the true 1500 px focal length.
const fallbackDepth = depthLetterScene(depthCam, 2500, 1600, null)
if (!fallbackDepth.aspect || fallbackDepth.aspect.focalSource !== 'fallback') {
  fail(`20% fallback focalSource ${fallbackDepth.aspect && fallbackDepth.aspect.focalSource}`)
}
nearly(fallbackDepth.aspect.focalPx, 0.72 * 2500, 1e-6, 'fallback focal 20% high')
const fallbackDepthErr = Math.abs(fallbackDepth.mm - TARGET_MM)
if (fallbackDepthErr > 20) {
  fail(`20% fallback orientation failed: width ${fallbackDepth.mm.toFixed(4)} mm (err ${fallbackDepthErr.toFixed(4)} mm)`)
}

const oldFactor = knownDepth.oldMm / TARGET_MM
nearly(oldFactor, letterRatio, 0.02, 'old pixel-length scale factor')
const appRule = depthLetterScene(depthCam, 2000, 1500, null)
const appRuleErr = Math.abs(appRule.mm - TARGET_MM)
if (appRuleErr > 0.5) {
  fail(`new rule (null focal) recovered ${appRule.mm.toFixed(4)} mm (err ${appRuleErr.toFixed(4)} mm > 0.5 mm)`)
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
console.log(`least-squares distance error: ${lsErr.toExponential(3)} mm (limit 0.5 mm)`)
console.log(`line-to-line offset error: ${jambErr.toExponential(3)} mm (limit 0.5 mm); A1–B1 chord ${rawChord.toFixed(4)} mm`)
console.log(`two-ref 45° pitch + 20° yaw error: ${twoRefErr.toExponential(3)} mm (limit 0.5 mm); drift ${twoRef.scaleDrift.toFixed(4)}; rms ${twoRef.fitRmsMm.toExponential(3)} mm; angle ${twoRef.linesAngleDeg.toFixed(3)}°; ${twoRef.orientA}/${twoRef.orientB}`)
console.log(`two-ref ±0.5 px noise error: ${noisyErr.toFixed(4)} mm (limit 5 mm); width ${noisy.widthMm.toFixed(4)} mm`)
console.log(`wall two-ref error: ${wallErr.toExponential(3)} mm (limit 0.5 mm); ${wallRef.orientA}/${wallRef.orientB}`)
console.log(`two-ref both short-across error: ${turnedErr.toExponential(3)} mm (limit 0.5 mm); ${turned.orientA}/${turned.orientB}`)
console.log(`two-ref mixed orientation error: ${mixedErr.toExponential(3)} mm (limit 0.5 mm); ${mixed.orientA}/${mixed.orientB}`)
console.log(`sheet-axis offset error: ${alignedWidthErr.toExponential(3)} mm (limit 0.5 mm); chord ${alignedSep.chordMm.toFixed(4)} mm; axis ${alignedSep.axis}; angle ${alignedSep.axisAngleDeg.toFixed(2)}°`)
console.log(`sheet-axis rotated error: ${rotatedWidthErr.toExponential(3)} mm (limit 0.5 mm); axis ${rotatedSep.axis}`)
console.log(`template 0.97 print uncorrected: ${uncorrectedMm.toFixed(4)} mm (target ${uncorrectedTarget.toFixed(1)} mm)`)
console.log(`template 0.97 print corrected: ${correctedMm.toFixed(4)} mm (err ${correctedErr.toExponential(3)} mm); paper s=${paperScale.printScale.toFixed(4)}`)
console.log(`template 3-marker recovered: ${threeMm.toFixed(4)} mm`)
console.log(`two-ref templates error: ${twoTemplateErr.toExponential(3)} mm (limit 0.5 mm); ${twoTemplate.orientA}/${twoTemplate.orientB}`)
console.log(`depth-letter known f: aspect ${normSheetAspect(knownDepth.aspect).toFixed(4)} (wh ${knownDepth.aspect.ratio.toFixed(4)}, ${knownDepth.aspect.focalSource}); width err ${knownDepthErr.toExponential(3)} mm`)
console.log(`depth-letter estimated f: aspect ${normSheetAspect(estimatedDepth.aspect).toFixed(4)} (f ${estimatedDepth.aspect.focalPx.toFixed(1)} ${estimatedDepth.aspect.focalSource}); width err ${estimatedDepthErr.toExponential(3)} mm`)
console.log(`depth-letter fallback f 20% high: f ${fallbackDepth.aspect.focalPx.toFixed(1)} vs true 1500; aspect ${normSheetAspect(fallbackDepth.aspect).toFixed(4)}; width ${fallbackDepth.mm.toFixed(4)} mm; err ${fallbackDepthErr.toFixed(4)} mm`)
console.log(`depth-letter old pixel rule: ${knownDepth.oldMm.toFixed(4)} mm (${oldFactor.toFixed(3)}×); new rule: ${appRule.mm.toFixed(4)} mm (err ${appRuleErr.toExponential(3)} mm)`)
console.log('PASS')
