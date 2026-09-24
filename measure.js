// Still-image measurement, in millimetres. No SLAM.
// One reference maps two jamb points through a homography; the width is the
// component along the sheet's own axis. Two references sit on the jambs; the
// width is the perpendicular gap between their outer edges, and each card may
// lie with either edge across the doorway. Pure geometry is at the top so
// Node can require this file without a browser. The guided UI lives in
// bootReferenceApp(); two-ref and card math stay exported for the self-check.

const CARD_LONG_MM = 85.60
const CARD_SHORT_MM = 53.98
const LETTER_LONG_MM = 279.4
const LETTER_SHORT_MM = 215.9
const MM_PER_INCH = 25.4
const HANDLE_HIT_RADIUS_PX = 44
const LOUPE_SIZE_PX = 160
const LOUPE_OFFSET_Y = 110
const LOUPE_MAGNIFY = 4
const SMALL_CARD_PX = 120
const MANUAL_DRAG_PX = 3
const DIAGNOSTIC_CAP = 60
const FLASH_HOLD_MS = 1100
const MESSAGE_HOLD_MS = 1700
const DETECT_MESSAGE_HOLD_MS = 2600
// Dashed live guide: long edge is this many capture-image pixels, drawn
// through the same contain-fit as the preview so the box is a real size.
const GUIDE_LONG_EDGE_PX = 150
// Mean gap / mean edge at which straightness scores 0. Keeps that term on
// a 0–1 scale beside the aspect score and the area rank.
const STRAIGHTNESS_GAP_FRACTION = 0.06
// Field failures: an 8-corner fit worse than 3 mm (was 2; a ~300 px card
// extrapolated across the doorway is noisy), jamb lines opening more than
// 3°, or a tap whose local scale is 1.3× the reference centre. 1.5 missed a
// 36 in door that read 48.4 in with scale_ratio_a 1.468.
const FIT_RMS_WARN_MM = 3
const SCALE_DRIFT_WARN_TIGHT = 0.05
const SCALE_DRIFT_WARN_LOOSE = 0.15
const SCALE_DRIFT_LOOSE_PX = 400
const LINES_ANGLE_WARN_DEG = 3
const SCALE_RATIO_WARN = 1.3
const MARKER_RMS_WARN_MM = 1.5
const PRINT_SCALE_AGREE = 0.01
const PRINT_SCALE_REMEMBER_SHIFT = 0.015
const PRINT_PAPER_BAND = 0.15
const TEMPLATE_DETECT_MAX_SIDE = 1800
const TEMPLATE_FLAT_WARNING = 'Template is not flat or is printed unevenly.'
const PRINT_SCALE_UNVERIFIED_WARNING = 'Print scale unverified — home printers often shrink to ~97 %. Tape the 6 in bar on your printout and enter it in step 1, or photograph the sheet on a darker surface so the paper edge can be found.'
const PRINT_SCALE_NUDGE = 'Tape the printed 6 in line and enter its length in step 1 — it corrects every reading.'
// 1-ref: taps this far off the sheet's edge direction are not a clean
// perpendicular. The raw chord stays on screen so the tester can compare.
const AXIS_ANGLE_WARN_DEG = 12

// ratio is long/short. Foreshortening is scored, not tightly gated:
// accept ratio × 0.6 … ratio × 3 (a steep angle can stretch either axis).
// defaultLongPx/defaultShortPx is the manual quad when auto-detect misses.
const CARD_REF = {
  name: 'card',
  longMm: CARD_LONG_MM,
  shortMm: CARD_SHORT_MM,
  ratio: CARD_LONG_MM / CARD_SHORT_MM,
  defaultLongPx: 180,
  defaultShortPx: 113,
}
const LETTER_REF = {
  name: 'letter',
  longMm: LETTER_LONG_MM,
  shortMm: LETTER_SHORT_MM,
  ratio: LETTER_LONG_MM / LETTER_SHORT_MM,
  defaultLongPx: 300,
  defaultShortPx: 232,
}

// Inches in, millimetres stored. Named presets keep their own TSV token;
// a measured page is name 'custom'.
function sizedReference(name, longIn, shortIn) {
  const longMm = longIn * MM_PER_INCH
  const shortMm = shortIn * MM_PER_INCH
  return {
    name,
    longMm,
    shortMm,
    ratio: longMm / shortMm,
    defaultLongPx: 300,
    defaultShortPx: 300 * (shortMm / longMm),
    longIn,
    shortIn,
  }
}

const LEGAL_REF = sizedReference('legal', 11.75, 8.5)
const NOTEPAD_REF = sizedReference('notepad', 11.5, 8.5)
const A4_REF = sizedReference('a4', 11.69, 8.27)

function formatInchesToken(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000
  if (!Number.isFinite(rounded)) return '0'
  return String(rounded)
}

function customReference(longIn, shortIn) {
  return sizedReference('custom', longIn, shortIn)
}

function referenceToken(spec) {
  if (!spec || spec.name === 'card') return 'card'
  if (spec.name === 'letter') return 'letter'
  // The printable sheet is the v2 margin (0.85 in). Readings name that sheet.
  if (spec.name === 'template') return 'template:letter-v2'
  const longIn = spec.longIn != null ? spec.longIn : spec.longMm / MM_PER_INCH
  const shortIn = spec.shortIn != null ? spec.shortIn : spec.shortMm / MM_PER_INCH
  const size = `${formatInchesToken(longIn)}x${formatInchesToken(shortIn)}`
  if (spec.name === 'legal' || spec.name === 'notepad' || spec.name === 'a4') {
    return `${spec.name}:${size}`
  }
  return `custom:${size}`
}

// Two ~300 px cards disagreeing at 5% is mostly extrapolation noise of a
// single-card H across the gap. Loosen that gate when both long edges are
// under 400 px; keep 5% once either reference is large enough to trust.
function scaleDriftWarn(refAPx, refBPx) {
  if (refAPx < SCALE_DRIFT_LOOSE_PX && refBPx < SCALE_DRIFT_LOOSE_PX) return SCALE_DRIFT_WARN_LOOSE
  return SCALE_DRIFT_WARN_TIGHT
}

// Letter landscape, origin top-left, inches. Outer black of each marker is
// 2.00 in. Shared by the printable page and the detector. v2 pulls the
// markers in to a 0.85 in margin so a home printer's unprintable top strip
// cannot clip the bottom row. Marker ids and size are unchanged.
const TEMPLATE_LETTER_V1 = {
  ids: [0, 1, 2, 3],
  markerSizeIn: 2.0,
  outerSquaresIn: {
    0: [0.85, 0.85, 2.85, 2.85],
    1: [8.15, 0.85, 10.15, 2.85],
    2: [8.15, 5.65, 10.15, 7.65],
    3: [0.85, 5.65, 2.85, 7.65],
  },
  pageIn: [11, 8.5],
  cardOutlineIn: [3.370, 2.125],
  barIn: 6.0,
  cardYIn: 2,
  barLineYIn: 5.2,
}

// Outermost marker corners. Long is the x span, short the y span.
function templateOuterExtentIn() {
  const ids = TEMPLATE_LETTER_V1.ids
  const squares = TEMPLATE_LETTER_V1.outerSquaresIn
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

const TEMPLATE_OUTER_EXTENT_IN = templateOuterExtentIn()
const TEMPLATE_OUTER_LONG_IN = TEMPLATE_OUTER_EXTENT_IN.maxX - TEMPLATE_OUTER_EXTENT_IN.minX
const TEMPLATE_OUTER_SHORT_IN = TEMPLATE_OUTER_EXTENT_IN.maxY - TEMPLATE_OUTER_EXTENT_IN.minY

// Interior ink, in page inches. Marker squares expanded by 0.25 in are
//   id0 [0.60, 3.10] × [0.60, 3.10], id1 [7.90, 10.40] × [0.60, 3.10],
//   id2 [7.90, 10.40] × [5.40, 7.90], id3 [0.60, 3.10] × [5.40, 7.90].
// x ∈ (3.10, 7.90) misses all four; y ∈ (3.10, 5.40) misses all four.
// Card x = (11 − 3.370) / 2 = 3.815, so [3.815, 7.185] × [2, 4.125]
//   is inside the x-gap and inside y [1.10, 7.40].
// Card caption is 4.60 in centred: [3.20, 7.80] × [4.210, 4.570]
//   (top = 4.125 + 0.085). Inside the x-gap, below the card.
// Bar line x = (11 − 6) / 2 = 2.50, stroke 1.2 pt = 1.2/72 in:
//   [2.50, 8.50] × [5.200, 5.217]. Inside the y-gap, 0.433 in above the
//   bottom marker tops at 5.65.
// Ticks sit on the line from above: y [5.020, 5.200], including the end
//   ticks at x = 2.50 and x = 8.50. 8 pt labels (8/72 in) start 0.02 in
//   under the stroke: y [5.237, 5.348], still below 5.40, so the end
//   labels at x [2.30, 2.70] and [8.30, 8.70] miss id3 and id2.
// Bar caption is the same 4.60 in centred band, 0.07 in under the labels:
//   [3.20, 7.80] × [5.418, 5.578]. Inside the x-gap and under y 7.40.
// Those boxes are pairwise disjoint (gaps 0.085, 0.450, 0.020, 0.070 in;
// ticks meet the line only on the shared edge) and none meets an expanded
// marker. The 6.00 in line cannot fit in the 4.80 in x-band; only its
// ends, ticks, and end labels leave x [3.10, 7.90], and those stay in
// the y-gap.
function templateInteriorLayoutIn() {
  const spec = TEMPLATE_LETTER_V1
  const cardW = spec.cardOutlineIn[0]
  const cardH = spec.cardOutlineIn[1]
  const cardX = (spec.pageIn[0] - cardW) / 2
  const cardY = spec.cardYIn
  const barW = spec.barIn
  const barX = (spec.pageIn[0] - barW) / 2
  const lineY = spec.barLineYIn
  const strokeIn = 1.2 / 72
  const numH = 8 / 72
  const captionW = 4.6
  const captionX = (spec.pageIn[0] - captionW) / 2
  const tickH = 0.18
  const numY = lineY + strokeIn + 0.02
  const ticks = []
  const nums = []
  for (let inch = 0; inch <= 6; inch++) {
    const x = barX + inch
    ticks.push({
      name: `tick${inch}`,
      x: x - 0.5 / 72,
      y: lineY - tickH,
      w: 1 / 72,
      h: tickH,
    })
    nums.push({
      name: `num${inch}`,
      x: x - 0.2,
      y: numY,
      w: 0.4,
      h: numH,
      label: String(inch),
    })
  }
  return {
    card: {name: 'card', x: cardX, y: cardY, w: cardW, h: cardH},
    cardCaption: {
      name: 'cardCaption',
      x: captionX,
      y: cardY + cardH + 0.085,
      w: captionW,
      h: 0.36,
    },
    barLine: {name: 'barLine', x: barX, y: lineY, w: barW, h: strokeIn},
    ticks,
    nums,
    barCaption: {
      name: 'barCaption',
      x: captionX,
      y: numY + numH + 0.07,
      w: captionW,
      h: 0.16,
    },
  }
}

function templatePrintScale(printScale) {
  if (printScale > 0 && Number.isFinite(printScale)) return printScale
  return 1
}

// s multiplies the nominal ink size. A 97% print has s = 0.97: the markers
// are physically smaller, so an unscaled (s = 1) homography reads the world
// 1/0.97 too large. Paper stock stays 11 × 8.5; only the ink shrinks.
function templateReference(printScale) {
  const s = templatePrintScale(printScale)
  const longIn = TEMPLATE_OUTER_LONG_IN
  const shortIn = TEMPLATE_OUTER_SHORT_IN
  return {
    name: 'template',
    longMm: longIn * MM_PER_INCH * s,
    shortMm: shortIn * MM_PER_INCH * s,
    ratio: longIn / shortIn,
    defaultLongPx: 400,
    defaultShortPx: 400 * (shortIn / longIn),
    longIn,
    shortIn,
    printScale: s,
  }
}

function templateMarkerOuterCornersIn(id) {
  const square = TEMPLATE_LETTER_V1.outerSquaresIn[id]
  if (!square) return null
  const x0 = square[0]
  const y0 = square[1]
  const x1 = square[2]
  const y1 = square[3]
  return [
    {x: x0, y: y0},
    {x: x1, y: y0},
    {x: x1, y: y1},
    {x: x0, y: y1},
  ]
}

function templateMarkerOuterCornersMm(id, printScale) {
  const inches = templateMarkerOuterCornersIn(id)
  if (!inches) return null
  const s = templatePrintScale(printScale) * MM_PER_INCH
  const out = []
  for (let i = 0; i < 4; i++) out.push({x: inches[i].x * s, y: inches[i].y * s})
  return out
}

function templateOuterQuadMm(printScale) {
  const s = templatePrintScale(printScale) * MM_PER_INCH
  const extent = TEMPLATE_OUTER_EXTENT_IN
  return [
    {x: extent.minX * s, y: extent.minY * s},
    {x: extent.maxX * s, y: extent.minY * s},
    {x: extent.maxX * s, y: extent.maxY * s},
    {x: extent.minX * s, y: extent.maxY * s},
  ]
}

function templatePageCornersMm() {
  return [
    {x: 0, y: 0},
    {x: LETTER_LONG_MM, y: 0},
    {x: LETTER_LONG_MM, y: LETTER_SHORT_MM},
    {x: 0, y: LETTER_SHORT_MM},
  ]
}

function templateMarkerCentroidIn(id) {
  const square = TEMPLATE_LETTER_V1.outerSquaresIn[id]
  if (!square) return null
  return {x: (square[0] + square[2]) / 2, y: (square[1] + square[3]) / 2}
}

// Which of TL,TR,BR,BL of that marker is the template's outer corner.
function templateOuterCornerIndex(id) {
  if (id === 1) return 1
  if (id === 2) return 2
  if (id === 3) return 3
  return 0
}

function cyclicShiftPoints(pts, shift) {
  const out = []
  const n = pts.length
  for (let i = 0; i < n; i++) out.push(pts[(i + shift) % n])
  return out
}

function templateIdList(cornersById) {
  const ids = []
  for (let i = 0; i < TEMPLATE_LETTER_V1.ids.length; i++) {
    const id = TEMPLATE_LETTER_V1.ids[i]
    if (cornersById[id] && cornersById[id].length === 4) ids.push(id)
  }
  return ids
}

function homographyFromMarkerCorners(cornersById, printScale) {
  const ids = templateIdList(cornersById)
  const src = []
  const dst = []
  for (let i = 0; i < ids.length; i++) {
    const img = cornersById[ids[i]]
    const nom = templateMarkerOuterCornersMm(ids[i], printScale)
    if (!nom) continue
    for (let k = 0; k < 4; k++) {
      src.push(img[k])
      dst.push(nom[k])
    }
  }
  if (src.length < 8) return null
  const H = solveHomographyLeastSquares(src, dst)
  if (!H) return null
  const rms = metricReprojectionRms(H, src, dst)
  return {H, src, dst, rms, ids}
}

function centroidBootstrapH(cornersById) {
  const ids = templateIdList(cornersById)
  const src = []
  const dst = []
  for (let i = 0; i < ids.length; i++) {
    src.push(centroidOf(cornersById[ids[i]]))
    const centre = templateMarkerCentroidIn(ids[i])
    dst.push({x: centre.x * MM_PER_INCH, y: centre.y * MM_PER_INCH})
  }
  if (ids.length >= 4) return solveHomography(src, dst)
  if (ids.length >= 3) return affineHomography(src, dst)
  return umeyamaSimilarityH(src, dst)
}

function affineHomography(src, dst) {
  if (!src || !dst || src.length < 3 || src.length !== dst.length) return null
  const A = []
  const b = []
  for (let i = 0; i < src.length; i++) {
    A.push([src[i].x, src[i].y, 1, 0, 0, 0])
    b.push(dst[i].x)
    A.push([0, 0, 0, src[i].x, src[i].y, 1])
    b.push(dst[i].y)
  }
  const h = solveLinearSystem(A, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], 0, 0, 1]
}

// 2D similarity (scale, rotation, translation). Used when only 2–3 marker
// centroids are available, so a full 4-point homography is underdetermined.
function umeyamaSimilarityH(src, dst) {
  if (!src || !dst || src.length < 2 || src.length !== dst.length) return null
  const n = src.length
  let scx = 0
  let scy = 0
  let dcx = 0
  let dcy = 0
  for (let i = 0; i < n; i++) {
    scx += src[i].x
    scy += src[i].y
    dcx += dst[i].x
    dcy += dst[i].y
  }
  scx /= n
  scy /= n
  dcx /= n
  dcy /= n
  let dot = 0
  let cross = 0
  let varSrc = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i].x - scx
    const sy = src[i].y - scy
    const dx = dst[i].x - dcx
    const dy = dst[i].y - dcy
    dot += sx * dx + sy * dy
    cross += sx * dy - sy * dx
    varSrc += sx * sx + sy * sy
  }
  if (!(varSrc > 1e-12)) return null
  const scale = Math.hypot(dot, cross) / varSrc
  const ang = Math.atan2(cross, dot)
  const c = scale * Math.cos(ang)
  const s = scale * Math.sin(ang)
  const tx = dcx - (c * scx - s * scy)
  const ty = dcy - (s * scx + c * scy)
  return [c, -s, tx, s, c, ty, 0, 0, 1]
}

function assignMarkerCornersWithH(cornersById, H) {
  if (!H) return null
  const ids = templateIdList(cornersById)
  const assignment = {}
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const img = cornersById[id]
    const nom = templateMarkerOuterCornersMm(id, 1)
    const slots = [null, null, null, null]
    const used = [false, false, false, false]
    for (let c = 0; c < 4; c++) {
      const mapped = applyHomography(H, img[c].x, img[c].y)
      if (!mapped) return null
      let best = -1
      let bestD = Infinity
      for (let k = 0; k < 4; k++) {
        if (used[k]) continue
        const dx = mapped.x - nom[k].x
        const dy = mapped.y - nom[k].y
        const dist = dx * dx + dy * dy
        if (dist < bestD) {
          bestD = dist
          best = k
        }
      }
      if (best < 0) return null
      used[best] = true
      slots[best] = copyPoint(img[c])
    }
    if (slots.some((p) => !p)) return null
    assignment[id] = slots
  }
  return assignment
}

function markerCornerSequences(pts) {
  const cw = orderCorners(pts)
  const ccw = [cw[0], cw[3], cw[2], cw[1]]
  const seq = []
  for (let shift = 0; shift < 4; shift++) {
    seq.push(cyclicShiftPoints(cw, shift))
    seq.push(cyclicShiftPoints(ccw, shift))
  }
  return seq
}

function bruteAlignTemplateCorners(cornersById) {
  const ids = templateIdList(cornersById)
  const options = []
  for (let i = 0; i < ids.length; i++) options.push(markerCornerSequences(cornersById[ids[i]]))
  let best = null
  const assignment = {}
  function rec(k) {
    if (best && best.markerRmsMm < 1e-6) return
    if (k === ids.length) {
      const fit = homographyFromMarkerCorners(assignment, 1)
      if (!fit) return
      if (!best || fit.rms < best.rms) {
        const copy = {}
        for (let i = 0; i < ids.length; i++) copy[ids[i]] = assignment[ids[i]]
        best = {cornersById: copy, H: fit.H, markerRmsMm: fit.rms, ids: fit.ids}
      }
      return
    }
    const seqs = options[k]
    for (let i = 0; i < seqs.length; i++) {
      assignment[ids[k]] = seqs[i]
      rec(k + 1)
    }
  }
  rec(0)
  return best
}

// js-aruco2 applies rotate2 internally so corners start at canonical TL when
// the decode rotation is known, but that rotation is not a public field, and
// image Y can flip the winding versus the page. Bootstrap a page-frame H from
// marker centroids, assign each image corner to the nearest outer-square
// corner (TL,TR,BR,BL), then iterate once on the full 8–16 point H. With
// fewer than four markers the centroid H is underdetermined, so try windings.
function alignTemplateMarkerCorners(cornersById) {
  const ids = templateIdList(cornersById)
  if (ids.length < 2) return null
  const H0 = centroidBootstrapH(cornersById)
  let fit = null
  if (H0) {
    const assignment = assignMarkerCornersWithH(cornersById, H0)
    if (assignment) {
      fit = homographyFromMarkerCorners(assignment, 1)
      if (fit) {
        const again = assignMarkerCornersWithH(cornersById, fit.H)
        if (again) {
          const refit = homographyFromMarkerCorners(again, 1)
          if (refit && (fit.rms == null || refit.rms <= fit.rms)) fit = refit
        }
      }
    }
  }
  if (fit && fit.rms != null && fit.rms < MARKER_RMS_WARN_MM) {
    return {
      cornersById: fit.src ? assignmentFromFit(fit, ids) : assignMarkerCornersWithH(cornersById, fit.H),
      H: fit.H,
      markerRmsMm: fit.rms,
      ids: fit.ids,
    }
  }
  const brute = bruteAlignTemplateCorners(cornersById)
  if (brute && (!fit || brute.markerRmsMm < fit.rms)) return brute
  if (!fit) return brute
  const assigned = assignMarkerCornersWithH(cornersById, fit.H)
  if (!assigned) return brute
  return {
    cornersById: assigned,
    H: fit.H,
    markerRmsMm: fit.rms,
    ids: fit.ids,
  }
}

function assignmentFromFit(fit, ids) {
  const assignment = {}
  let offset = 0
  for (let i = 0; i < ids.length; i++) {
    assignment[ids[i]] = fit.src.slice(offset, offset + 4)
    offset += 4
  }
  return assignment
}

function templateQuadFromAlignedMarkers(aligned) {
  if (!aligned || !aligned.H) return null
  const outer = {}
  const missing = []
  for (let i = 0; i < TEMPLATE_LETTER_V1.ids.length; i++) {
    const id = TEMPLATE_LETTER_V1.ids[i]
    const cornerIndex = templateOuterCornerIndex(id)
    if (aligned.cornersById[id]) {
      outer[id] = copyPoint(aligned.cornersById[id][cornerIndex])
    } else {
      missing.push(id)
    }
  }
  if (missing.length > 0) {
    const inv = invertHomography(aligned.H)
    if (!inv) return null
    for (let i = 0; i < missing.length; i++) {
      const id = missing[i]
      const nom = templateMarkerOuterCornersMm(id, 1)
      if (!nom) return null
      const img = applyHomography(inv, nom[templateOuterCornerIndex(id)].x, nom[templateOuterCornerIndex(id)].y)
      if (!img) return null
      outer[id] = img
    }
  }
  const quad = [outer[0], outer[1], outer[2], outer[3]]
  if (quad.some((p) => !p)) return null
  return {
    cardCorners: quad,
    synthesized: missing.length > 0,
    markersFound: aligned.ids.length,
    missingIds: missing,
  }
}

function convexQuadContains(quad, p) {
  if (!quad || quad.length !== 4 || !p) return false
  const ordered = orderCorners(quad)
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = ordered[i]
    const b = ordered[(i + 1) % 4]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(cross) < 1e-9) continue
    const next = cross > 0 ? 1 : -1
    if (sign === 0) sign = next
    else if (next !== sign) return false
  }
  return true
}

function convexQuadContainsAll(quad, pts) {
  if (!pts || pts.length === 0) return false
  for (let i = 0; i < pts.length; i++) {
    if (!convexQuadContains(quad, pts[i])) return false
  }
  return true
}

function paperMappedSizeMm(paperImageCorners, markerH) {
  const mapped = mapPoints(markerH, paperImageCorners)
  if (!mapped) return null
  const ordered = orderCorners(mapped)
  const pairA = (edgeLength(ordered[0], ordered[1]) + edgeLength(ordered[2], ordered[3])) / 2
  const pairB = (edgeLength(ordered[1], ordered[2]) + edgeLength(ordered[3], ordered[0])) / 2
  return {
    longMm: Math.max(pairA, pairB),
    shortMm: Math.min(pairA, pairB),
  }
}

function paperSizePlausible(longMm, shortMm) {
  if (!(longMm > 0) || !(shortMm > 0)) return false
  const lo = 1 - PRINT_PAPER_BAND
  const hi = 1 + PRINT_PAPER_BAND
  return longMm >= LETTER_LONG_MM * lo && longMm <= LETTER_LONG_MM * hi
    && shortMm >= LETTER_SHORT_MM * lo && shortMm <= LETTER_SHORT_MM * hi
}

// Paper stock is always Letter; ink is what the printer scaled. Mapped through
// the unscaled-marker H, a 97% print makes the paper look 1/0.97 too large, so
// s = 279.4 / measuredLong is 0.97 — the factor to apply to template dimensions.
function recoverPrintScaleFromPaper(measuredLongMm, measuredShortMm) {
  if (!(measuredLongMm > 0) || !(measuredShortMm > 0)) {
    return {printScale: null, source: 'none', status: 'unverified'}
  }
  const sLong = LETTER_LONG_MM / measuredLongMm
  const sShort = LETTER_SHORT_MM / measuredShortMm
  const mean = (sLong + sShort) / 2
  if (!(mean > 0)) return {printScale: null, source: 'none', status: 'unverified'}
  const rel = Math.abs(sLong - sShort) / mean
  if (rel > PRINT_SCALE_AGREE) {
    return {printScale: null, source: 'none', status: 'unverified', sLong, sShort}
  }
  return {printScale: mean, source: 'paper', status: mean, sLong, sShort}
}

function recoverPrintScaleFromBar(measuredBarIn) {
  if (!(measuredBarIn > 0) || !Number.isFinite(measuredBarIn)) {
    return {printScale: null, source: 'none', status: 'unverified'}
  }
  const s = measuredBarIn / TEMPLATE_LETTER_V1.barIn
  if (!(s > 0)) return {printScale: null, source: 'none', status: 'unverified'}
  return {printScale: s, source: 'bar', status: s}
}

function choosePrintScale(barIn, paperLongMm, paperShortMm) {
  const bar = recoverPrintScaleFromBar(barIn)
  if (bar.source === 'bar' && Math.abs(barIn - TEMPLATE_LETTER_V1.barIn) > 1e-6) return bar
  if (paperLongMm > 0 && paperShortMm > 0) return recoverPrintScaleFromPaper(paperLongMm, paperShortMm)
  return {printScale: null, source: 'none', status: 'unverified'}
}

const FLOOR_LIVE_INSTRUCTION = 'Lay a plain sheet of printer paper on the floor on the line between the jambs. Either orientation is fine. Step back so both jambs and the sheet are in view, then Capture.'
const WALL_LIVE_INSTRUCTION = 'Hold a plain sheet of printer paper flat on the wall, on the line between the floor and the height mark. Get both in view, then Capture.'
const CAMERA_DENIED_INSTRUCTION = 'Camera permission was denied. Reload the page and allow camera access.'
const NEED_POINTS_INSTRUCTION = 'Place both points before saving.'
const NEED_REFS_INSTRUCTION = 'Confirm both references before saving.'
const NEED_SAVED_INSTRUCTION = 'Save a measurement to the list first.'
const MODE_LOCKED_INSTRUCTION = 'Mode can only be changed before Capture.'
const LAYOUT_LOCKED_INSTRUCTION = 'Layout can only be changed before Capture.'
const REFERENCE_LOCKED_INSTRUCTION = 'Reference can only be changed before Capture.'
const DISAGREE_WARNING = 'References disagree — check that both lie flat on the same surface, then Retake.'
const FLUSH_WARNING = 'The outer edges are not parallel — re-seat each reference so one edge is flush against the jamb or the mark, then Retake.'
const SCALE_WARNING = 'Unreliable: reference is far from the points or too small. Put it on the line between the points, or use 2 refs.'
const AXIS_MISALIGN_WARNING = 'Points do not run along the sheet\'s edge direction — the sheet may not be square to the door, or a tap is off the jamb. Raw chord shown.'

function point(x, y) {
  return {x, y}
}

function copyPoint(p) {
  return {x: p.x, y: p.y}
}

function hypot2(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

function edgeLength(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function centroidOf(points) {
  let x = 0
  let y = 0
  for (let i = 0; i < points.length; i++) {
    x += points[i].x
    y += points[i].y
  }
  const n = points.length || 1
  return {x: x / n, y: y / n}
}

// Image y is down, but increasing atan2 still yields TL, TR, BR, BL
// when the list is rotated to start at the smallest x+y (top-left).
function orderCorners(corners) {
  const pts = corners.map(copyPoint)
  const c = centroidOf(pts)
  pts.sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x))
  let start = 0
  let minSum = Infinity
  for (let i = 0; i < pts.length; i++) {
    const sum = pts[i].x + pts[i].y
    if (sum < minSum) {
      minSum = sum
      start = i
    }
  }
  const ordered = []
  for (let i = 0; i < pts.length; i++) ordered.push(pts[(start + i) % pts.length])
  return ordered
}

function meanLongEdgePx(ordered) {
  const pairA = (edgeLength(ordered[0], ordered[1]) + edgeLength(ordered[2], ordered[3])) / 2
  const pairB = (edgeLength(ordered[1], ordered[2]) + edgeLength(ordered[3], ordered[0])) / 2
  return Math.max(pairA, pairB)
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

// Zhang & He, "Whiteboard scanning and image enhancement", Digital Signal
// Processing 17 (2007). Corners are TL, TR, BR, BL as orderCorners returns.
// whRatio is the physical length of edge TL→TR over edge TL→BL.
//
// BR is opposite TL, so it is the auxiliary corner of the two pencils.
// Using BL there instead makes n follow the diagonal and the ratio is not
// an edge ratio. m_i = (x_i − u0, y_i − v0, 1), (u0, v0) = (W/2, H/2):
//   k_tr = ((m_tl × m_br) · m_bl) / ((m_tr × m_br) · m_bl)
//   k_bl = ((m_tl × m_br) · m_tr) / ((m_bl × m_br) · m_tr)
//   n_tr = k_tr · m_tr − m_tl
//   n_bl = k_bl · m_bl − m_tl
// If focalPx is null and both |k − 1| > 1e-3 (neither edge pair is parallel
// in the image, so both vanishing points are finite),
//   f² = −(n_tr.x·n_bl.x + n_tr.y·n_bl.y) / (n_tr.z·n_bl.z)
// Accept f only when f² > 0 and f ∈ [0.45, 1.6] × max(W, H). Otherwise
//   f = 0.72 × max(W, H)
// which is a phone main camera, about 70° horizontal. Then
//   whRatio² = (n_tr.x² + n_tr.y² + n_tr.z²·f²) / (n_bl.x² + n_bl.y² + n_bl.z²·f²)
// focalSource is 'given' when the caller passed focalPx, else 'estimated'
// or 'fallback'. Null when the quad is degenerate.
function rectangleAspectFromPerspective(cornersOrdered, imageW, imageH, focalPx) {
  if (!cornersOrdered || cornersOrdered.length !== 4) return null
  if (!(imageW > 0) || !(imageH > 0)) return null
  if (!Number.isFinite(imageW) || !Number.isFinite(imageH)) return null
  const u0 = imageW / 2
  const v0 = imageH / 2
  const m = []
  for (let i = 0; i < 4; i++) {
    const corner = cornersOrdered[i]
    if (!corner || !Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return null
    m.push({x: corner.x - u0, y: corner.y - v0, z: 1})
  }
  const mTl = m[0]
  const mTr = m[1]
  const mBr = m[2]
  const mBl = m[3]
  function triple(a, b, c) {
    return dot3(cross3(a, b), c)
  }
  const denTr = triple(mTr, mBr, mBl)
  const denBl = triple(mBl, mBr, mTr)
  if (Math.abs(denTr) < 1e-9 || Math.abs(denBl) < 1e-9) return null
  const kTr = triple(mTl, mBr, mBl) / denTr
  const kBl = triple(mTl, mBr, mTr) / denBl
  if (!Number.isFinite(kTr) || !Number.isFinite(kBl)) return null
  const nTr = {
    x: kTr * mTr.x - mTl.x,
    y: kTr * mTr.y - mTl.y,
    z: kTr * mTr.z - mTl.z,
  }
  const nBl = {
    x: kBl * mBl.x - mTl.x,
    y: kBl * mBl.y - mTl.y,
    z: kBl * mBl.z - mTl.z,
  }
  const maxSide = Math.max(imageW, imageH)
  let fUsed = focalPx
  let focalSource = 'given'
  const supplied = focalPx > 0 && Number.isFinite(focalPx)
  if (!supplied) {
    fUsed = 0.72 * maxSide
    focalSource = 'fallback'
    const bothConverge = Math.abs(kTr - 1) > 1e-3 && Math.abs(kBl - 1) > 1e-3
    const zDen = nTr.z * nBl.z
    if (bothConverge && Math.abs(zDen) > 1e-12) {
      const f2 = -(nTr.x * nBl.x + nTr.y * nBl.y) / zDen
      if (f2 > 0 && Number.isFinite(f2)) {
        const fEst = Math.sqrt(f2)
        if (fEst >= 0.45 * maxSide && fEst <= 1.6 * maxSide) {
          fUsed = fEst
          focalSource = 'estimated'
        }
      }
    }
  }
  if (!(fUsed > 0) || !Number.isFinite(fUsed)) return null
  const f2Used = fUsed * fUsed
  const num = nTr.x * nTr.x + nTr.y * nTr.y + nTr.z * nTr.z * f2Used
  const den = nBl.x * nBl.x + nBl.y * nBl.y + nBl.z * nBl.z * f2Used
  if (!(num > 0) || !(den > 0) || !Number.isFinite(num) || !Number.isFinite(den)) return null
  const whRatio = Math.sqrt(num / den)
  if (!(whRatio > 0) || !Number.isFinite(whRatio)) return null
  return {ratio: whRatio, focalPx: fUsed, focalSource: focalSource}
}

// Pair A (edges 0–1 and 2–3, TL–TR and BR–BL) is the long side when the
// perspective ratio is closer in log space to long/short than to short/long.
// Pixel length is only the fallback when the aspect cannot be recovered
// (no image size, or a degenerate quad). imageW/imageH omitted keeps the
// old rule, which is what isoDestinationMm and the early self-checks use.
function referenceDestinationMm(ordered, ref, imageW, imageH, focalPx) {
  const spec = ref || CARD_REF
  const pairA = (edgeLength(ordered[0], ordered[1]) + edgeLength(ordered[2], ordered[3])) / 2
  const pairB = (edgeLength(ordered[1], ordered[2]) + edgeLength(ordered[3], ordered[0])) / 2
  let pairAIsLong = pairA >= pairB
  let aspect = null
  if (imageW > 0 && imageH > 0) {
    aspect = rectangleAspectFromPerspective(ordered, imageW, imageH, focalPx == null ? null : focalPx)
    if (aspect && aspect.ratio > 0 && spec.ratio > 0) {
      const wh = aspect.ratio
      const r = spec.ratio
      pairAIsLong = Math.abs(Math.log(wh / r)) < Math.abs(Math.log(wh * r))
    }
  }
  const dst = pairAIsLong
    ? [
      point(0, 0),
      point(spec.longMm, 0),
      point(spec.longMm, spec.shortMm),
      point(0, spec.shortMm),
    ]
    : [
      point(0, 0),
      point(spec.shortMm, 0),
      point(spec.shortMm, spec.longMm),
      point(0, spec.longMm),
    ]
  dst.aspect = aspect
  return dst
}

function isoDestinationMm(ordered) {
  return referenceDestinationMm(ordered, CARD_REF)
}

function solveLinearSystem(matrix, rhs) {
  const n = rhs.length
  const rows = []
  for (let i = 0; i < n; i++) {
    const row = matrix[i].slice()
    row.push(rhs[i])
    rows.push(row)
  }
  for (let k = 0; k < n; k++) {
    let pivot = k
    let best = Math.abs(rows[k][k])
    for (let i = k + 1; i < n; i++) {
      const value = Math.abs(rows[i][k])
      if (value > best) {
        best = value
        pivot = i
      }
    }
    if (best < 1e-12) return null
    if (pivot !== k) {
      const swap = rows[k]
      rows[k] = rows[pivot]
      rows[pivot] = swap
    }
    const diag = rows[k][k]
    for (let i = k + 1; i < n; i++) {
      const factor = rows[i][k] / diag
      for (let j = k; j <= n; j++) rows[i][j] -= factor * rows[k][j]
    }
  }
  const x = new Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let sum = rows[i][n]
    for (let j = i + 1; j < n; j++) sum -= rows[i][j] * x[j]
    const diag = rows[i][i]
    if (Math.abs(diag) < 1e-12) return null
    x[i] = sum / diag
  }
  return x
}

// 4-point DLT with h22 = 1. Runtime fallback when cv.getPerspectiveTransform
// is missing; the Node self-check uses this directly.
function solveHomography(src, dst) {
  if (!src || !dst || src.length !== 4 || dst.length !== 4) return null
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const x = src[i].x
    const y = src[i].y
    const u = dst[i].x
    const v = dst[i].y
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solveLinearSystem(A, b)
  if (!h) return null
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

function applyHomography(H, x, y) {
  if (!H || H.length < 9) return null
  const w = H[6] * x + H[7] * y + H[8]
  if (Math.abs(w) < 1e-12) return null
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  }
}

function planarDistanceMm(H, a, b) {
  const pa = applyHomography(H, a.x, a.y)
  const pb = applyHomography(H, b.x, b.y)
  if (!pa || !pb) return null
  return Math.hypot(pa.x - pb.x, pa.y - pb.y)
}

function mat3Mul(a, b) {
  const out = new Array(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += a[r * 3 + k] * b[k * 3 + c]
      out[r * 3 + c] = sum
    }
  }
  return out
}

function invertHomography(H) {
  if (!H || H.length < 9) return null
  const a = H[0]
  const b = H[1]
  const c = H[2]
  const d = H[3]
  const e = H[4]
  const f = H[5]
  const g = H[6]
  const h = H[7]
  const i = H[8]
  const A = e * i - f * h
  const B = f * g - d * i
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-14) return null
  const s = 1 / det
  return [
    A * s, (c * h - b * i) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, (c * d - a * f) * s,
    C * s, (b * g - a * h) * s, (a * e - b * d) * s,
  ]
}

// Cyclic Jacobi on a symmetric matrix. Returns the eigenvector for the
// smallest eigenvalue — the null-vector of a DLT Gram matrix.
function smallestEigenvectorSymmetric(matrix) {
  const n = matrix.length
  const a = []
  const v = []
  for (let i = 0; i < n; i++) {
    a.push(matrix[i].slice())
    const basis = new Array(n).fill(0)
    basis[i] = 1
    v.push(basis)
  }
  for (let sweep = 0; sweep < 24; sweep++) {
    let maxOff = 0
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q]
        const mag = Math.abs(apq)
        if (mag > maxOff) maxOff = mag
        if (mag < 1e-15) continue
        const app = a[p][p]
        const aqq = a[q][q]
        const tau = (aqq - app) / (2 * apq)
        const denom = Math.abs(tau) + Math.sqrt(1 + tau * tau)
        const t = (tau >= 0 ? 1 : -1) / denom
        const c = 1 / Math.sqrt(1 + t * t)
        const s = t * c
        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq
        a[p][q] = 0
        a[q][p] = 0
        for (let i = 0; i < n; i++) {
          if (i === p || i === q) continue
          const aip = a[i][p]
          const aiq = a[i][q]
          a[i][p] = a[p][i] = c * aip - s * aiq
          a[i][q] = a[q][i] = s * aip + c * aiq
        }
        for (let i = 0; i < n; i++) {
          const vip = v[i][p]
          const viq = v[i][q]
          v[i][p] = c * vip - s * viq
          v[i][q] = s * vip + c * viq
        }
      }
    }
    if (maxOff < 1e-14) break
  }
  let minIndex = 0
  for (let i = 1; i < n; i++) {
    if (a[i][i] < a[minIndex][minIndex]) minIndex = i
  }
  const vec = new Array(n)
  let norm = 0
  for (let i = 0; i < n; i++) {
    vec[i] = v[i][minIndex]
    norm += vec[i] * vec[i]
  }
  if (!(norm > 0)) return null
  return vec
}

function normalizingTransform(pts) {
  const n = pts.length
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    cx += pts[i].x
    cy += pts[i].y
  }
  cx /= n
  cy /= n
  let dist = 0
  for (let i = 0; i < n; i++) dist += Math.hypot(pts[i].x - cx, pts[i].y - cy)
  dist /= n
  if (!(dist > 1e-9)) return null
  const scale = Math.SQRT2 / dist
  const normalized = []
  for (let i = 0; i < n; i++) {
    normalized.push({
      x: scale * (pts[i].x - cx),
      y: scale * (pts[i].y - cy),
    })
  }
  return {normalized, cx, cy, scale}
}

// Hartley DLT: normalise, 2n×9 system, smallest eigenvector of AᵀA.
function solveHomographyDlt(srcPts, dstPts) {
  const srcN = normalizingTransform(srcPts)
  const dstN = normalizingTransform(dstPts)
  if (!srcN || !dstN) return null
  const rows = []
  for (let i = 0; i < srcN.normalized.length; i++) {
    const x = srcN.normalized[i].x
    const y = srcN.normalized[i].y
    const u = dstN.normalized[i].x
    const v = dstN.normalized[i].y
    rows.push([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
  }
  const gram = []
  for (let i = 0; i < 9; i++) gram.push(new Array(9).fill(0))
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let i = 0; i < 9; i++) {
      const ri = row[i]
      if (ri === 0) continue
      for (let j = i; j < 9; j++) gram[i][j] += ri * row[j]
    }
  }
  for (let i = 0; i < 9; i++) {
    for (let j = i + 1; j < 9; j++) gram[j][i] = gram[i][j]
  }
  const h = smallestEigenvectorSymmetric(gram)
  if (!h) return null
  for (let i = 0; i < 9; i++) {
    if (!Number.isFinite(h[i])) return null
  }
  const Tsrc = [
    srcN.scale, 0, -srcN.scale * srcN.cx,
    0, srcN.scale, -srcN.scale * srcN.cy,
    0, 0, 1,
  ]
  const TdstInv = [
    1 / dstN.scale, 0, dstN.cx,
    0, 1 / dstN.scale, dstN.cy,
    0, 0, 1,
  ]
  return mat3Mul(mat3Mul(TdstInv, h), Tsrc)
}

// n ≥ 4. Pure JS so the self-check runs in Node. cv.findHomography (method 0,
// every point) is only the fallback when the pure solve fails.
function solveHomographyLeastSquares(srcPts, dstPts) {
  if (!srcPts || !dstPts || srcPts.length < 4 || srcPts.length !== dstPts.length) return null
  const pure = solveHomographyDlt(srcPts, dstPts)
  if (pure) return pure
  if (typeof cv !== 'undefined' && cv && typeof cv.findHomography === 'function') {
    try {
      return cvFindHomographyArray(srcPts, dstPts)
    } catch (err) {
      return null
    }
  }
  return null
}

// Infinite line, not the segment. An offset tap's foot can fall past the
// other reference's edge and must still count.
function distancePointToLine(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

function linesAngleDeg(a1, a2, b1, b2) {
  const ax = a2.x - a1.x
  const ay = a2.y - a1.y
  const bx = b2.x - b1.x
  const by = b2.y - b1.y
  const na = Math.hypot(ax, ay)
  const nb = Math.hypot(bx, by)
  if (na < 1e-9 || nb < 1e-9) return null
  let cos = (ax * bx + ay * by) / (na * nb)
  if (cos < 0) cos = -cos
  if (cos > 1) cos = 1
  return Math.acos(cos) * 180 / Math.PI
}

// Reference edges are axis-aligned in this frame. The doorway is whichever
// metric axis carries more of B−A; the other component is slide along the
// jamb. Width is the doorway component, so that slide does not inflate it.
// Misalignment is the angle between B−A and that axis.
function sheetAxisSeparationMm(a, b) {
  if (!a || !b) return null
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const alongX = adx >= ady
  const along = alongX ? adx : ady
  const perp = alongX ? ady : adx
  return {
    widthMm: along,
    chordMm: Math.hypot(dx, dy),
    axisAngleDeg: Math.atan2(perp, along) * 180 / Math.PI,
    axis: alongX ? 'x' : 'y',
  }
}

// Mean of the four endpoint-to-other-line distances. Spread is max − min.
function perpendicularLinesDistanceMm(a1, a2, b1, b2) {
  if (!a1 || !a2 || !b1 || !b2) return null
  const dists = [
    distancePointToLine(a1, b1, b2),
    distancePointToLine(a2, b1, b2),
    distancePointToLine(b1, a1, a2),
    distancePointToLine(b2, a1, a2),
  ]
  let sum = 0
  let lo = dists[0]
  let hi = dists[0]
  for (let i = 0; i < 4; i++) {
    if (!Number.isFinite(dists[i])) return null
    sum += dists[i]
    if (dists[i] < lo) lo = dists[i]
    if (dists[i] > hi) hi = dists[i]
  }
  return {
    meanMm: sum / 4,
    spreadMm: hi - lo,
    angleDeg: linesAngleDeg(a1, a2, b1, b2),
  }
}

// Geometric-mean mm/px from ±1 px finite differences. Isotropic enough to
// compare the reference centre with a far tap.
function localScaleMmPerPx(H, x, y) {
  const xp = applyHomography(H, x + 1, y)
  const xm = applyHomography(H, x - 1, y)
  const yp = applyHomography(H, x, y + 1)
  const ym = applyHomography(H, x, y - 1)
  if (!xp || !xm || !yp || !ym) return null
  const sx = Math.hypot(xp.x - xm.x, xp.y - xm.y) / 2
  const sy = Math.hypot(yp.x - ym.x, yp.y - ym.y) / 2
  if (!(sx > 0) || !(sy > 0)) return null
  return Math.sqrt(sx * sy)
}

function mapPoints(H, pts) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const mapped = applyHomography(H, pts[i].x, pts[i].y)
    if (!mapped) return null
    out.push(mapped)
  }
  return out
}

function metricPoint(measurement, transverse, mode) {
  if (mode === 'wall') return {x: transverse, y: measurement}
  return {x: measurement, y: transverse}
}

function axisOf(point, mode) {
  if (mode === 'wall') return {m: point.y, t: point.x}
  return {m: point.x, t: point.y}
}

function normalizeVec(x, y) {
  const len = Math.hypot(x, y) || 1
  return {x: x / len, y: y / len}
}

// Slots: outerLow, outerHigh, innerLow, innerHigh. The measurement edges are
// the pair perpendicular to A→B — the edges that can sit flush on the jambs
// or the marks. Outer is the one farther from the other reference. Long versus
// short is not assumed here; the fit tries both.
function referenceCornerSlots(corners, otherCentroid, doorDir) {
  const ordered = orderCorners(corners)
  const self = centroidOf(ordered)
  const toward = normalizeVec(otherCentroid.x - self.x, otherCentroid.y - self.y)
  const transverse = {x: -doorDir.y, y: doorDir.x}
  const edges = []
  for (let i = 0; i < 4; i++) {
    const p0 = ordered[i]
    const p1 = ordered[(i + 1) % 4]
    const ex = p1.x - p0.x
    const ey = p1.y - p0.y
    const len = Math.hypot(ex, ey) || 1
    edges.push({
      v0: i,
      v1: (i + 1) % 4,
      midX: (p0.x + p1.x) / 2,
      midY: (p0.y + p1.y) / 2,
      align: Math.abs((ex * doorDir.x + ey * doorDir.y) / len),
    })
  }
  const align02 = (edges[0].align + edges[2].align) / 2
  const align13 = (edges[1].align + edges[3].align) / 2
  const pair = align02 <= align13 ? [edges[0], edges[2]] : [edges[1], edges[3]]
  const proj0 = pair[0].midX * toward.x + pair[0].midY * toward.y
  const proj1 = pair[1].midX * toward.x + pair[1].midY * toward.y
  const outer = proj0 <= proj1 ? pair[0] : pair[1]
  const t0 = ordered[outer.v0].x * transverse.x + ordered[outer.v0].y * transverse.y
  const t1 = ordered[outer.v1].x * transverse.x + ordered[outer.v1].y * transverse.y
  const outerLowV = t0 <= t1 ? outer.v0 : outer.v1
  const outerHighV = outerLowV === outer.v0 ? outer.v1 : outer.v0
  function offEdge(vertex) {
    const prev = (vertex + 3) % 4
    const next = (vertex + 1) % 4
    if (prev !== outer.v0 && prev !== outer.v1) return prev
    return next
  }
  const innerLowV = offEdge(outerLowV)
  const innerHighV = offEdge(outerHighV)
  const ids = [outerLowV, outerHighV, innerLowV, innerHighV]
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (ids[i] === ids[j]) return null
    }
  }
  return [
    ordered[outerLowV],
    ordered[outerHighV],
    ordered[innerLowV],
    ordered[innerHighV],
  ]
}

// 'long-across' / 'short-across': which physical edge spans the doorway.
// The other edge lies along the jamb. Floor used to assume long-across and
// wall short-across; a card turned the other way is a different rectangle.
function orientExtents(spec, orient) {
  if (orient === 'short-across') return {extentMm: spec.shortMm, acrossMm: spec.longMm}
  return {extentMm: spec.longMm, acrossMm: spec.shortMm}
}

// innerSign +1 grows the reference toward +measurement (A). B's inner edge
// faces A, so its sign is −1 and its outer edge sits at W.
function slotDestinations(spec, mode, outerM, transverseOrigin, innerSign, orient) {
  const dims = orientExtents(spec, orient)
  const innerM = outerM + innerSign * dims.extentMm
  return [
    metricPoint(outerM, transverseOrigin, mode),
    metricPoint(outerM, transverseOrigin + dims.acrossMm, mode),
    metricPoint(innerM, transverseOrigin, mode),
    metricPoint(innerM, transverseOrigin + dims.acrossMm, mode),
  ]
}

// Slots are outerLow, outerHigh, innerLow, innerHigh. The long edge is the
// outer-to-inner pair when that pair spans the doorway, and the outer pair
// itself when the long edge lies along the jamb.
function mappedLongEdgeMm(mapped, orient) {
  const along = (edgeLength(mapped[0], mapped[2]) + edgeLength(mapped[1], mapped[3])) / 2
  const across = (edgeLength(mapped[0], mapped[1]) + edgeLength(mapped[2], mapped[3])) / 2
  if (orient === 'short-across') return across
  return along
}

function pixelReprojectionRms(H, srcPts, dstPts) {
  const inv = invertHomography(H)
  if (!inv) return Infinity
  let sum = 0
  for (let i = 0; i < srcPts.length; i++) {
    const back = applyHomography(inv, dstPts[i].x, dstPts[i].y)
    if (!back) return Infinity
    const dx = back.x - srcPts[i].x
    const dy = back.y - srcPts[i].y
    sum += dx * dx + dy * dy
  }
  return Math.sqrt(sum / srcPts.length)
}

function metricReprojectionRms(H, srcPts, dstPts) {
  let sum = 0
  for (let i = 0; i < srcPts.length; i++) {
    const mapped = applyHomography(H, srcPts[i].x, srcPts[i].y)
    if (!mapped) return null
    const dx = mapped.x - dstPts[i].x
    const dy = mapped.y - dstPts[i].y
    sum += dx * dx + dy * dy
  }
  return Math.sqrt(sum / srcPts.length)
}

function furtherFromOne(a, b) {
  function score(value) {
    if (!(value > 0) || !Number.isFinite(value)) return Infinity
    return Math.abs(Math.log(value))
  }
  return score(a) >= score(b) ? a : b
}

// Vertex of the interpolating parabola. a is the second divided difference.
function parabolaMinimum(x1, y1, x2, y2, x3, y3) {
  if (x1 === x2 || x2 === x3 || x1 === x3) return null
  const d12 = (y2 - y1) / (x2 - x1)
  const d23 = (y3 - y2) / (x3 - x2)
  const a = (d23 - d12) / (x3 - x1)
  if (!(a > 1e-12)) return null
  const b = d12 - a * (x1 + x2)
  const vertex = -b / (2 * a)
  const lo = Math.min(x1, x2, x3)
  const hi = Math.max(x1, x2, x3)
  if (vertex < lo || vertex > hi) return null
  return vertex
}

const ORIENTATION_CHOICES = ['long-across', 'short-across']

// Slots are outerLow, outerHigh, innerLow, innerHigh. Door edges are the
// outer-to-inner pair; jamb edges are the outer pair and the inner pair.
function nearestSlotIndex(slots, p) {
  let best = -1
  let bestD = 0.5
  for (let i = 0; i < slots.length; i++) {
    const d = Math.hypot(slots[i].x - p.x, slots[i].y - p.y)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function slotPairKind(slots, a, b) {
  const ia = nearestSlotIndex(slots, a)
  const ib = nearestSlotIndex(slots, b)
  if (ia < 0 || ib < 0 || ia === ib) return null
  const lo = ia < ib ? ia : ib
  const hi = ia < ib ? ib : ia
  if ((lo === 0 && hi === 2) || (lo === 1 && hi === 3)) return 'door'
  if ((lo === 0 && hi === 1) || (lo === 2 && hi === 3)) return 'jamb'
  return null
}

// Door-edge / jamb-edge, versus the ratio that orientation predicts.
// A 90° swap of both cards is an anisotropic scale of the plane, so it is
// also a homography: pixel RMS and scale drift both tie. The separating
// term is |log(whRatio / predicted)|, where whRatio is the perspective
// length of the door edge over the jamb edge. Pixel length is the fallback
// when the aspect cannot be recovered.
function orientationAspectPenalty(slots, spec, orient, imageW, imageH) {
  const predicted = orient === 'short-across' ? spec.shortMm / spec.longMm : spec.longMm / spec.shortMm
  if (!(predicted > 0)) return Infinity
  const ordered = orderCorners(slots)
  const aspect = rectangleAspectFromPerspective(ordered, imageW, imageH, null)
  if (aspect && aspect.ratio > 0) {
    const topKind = slotPairKind(slots, ordered[0], ordered[1])
    const sideKind = slotPairKind(slots, ordered[0], ordered[3])
    let doorOverJamb = null
    if (topKind === 'door' && sideKind === 'jamb') doorOverJamb = aspect.ratio
    else if (topKind === 'jamb' && sideKind === 'door') doorOverJamb = 1 / aspect.ratio
    if (doorOverJamb > 0 && Number.isFinite(doorOverJamb)) {
      return Math.abs(Math.log(doorOverJamb / predicted))
    }
  }
  const jamb = (edgeLength(slots[0], slots[1]) + edgeLength(slots[2], slots[3])) / 2
  const door = (edgeLength(slots[0], slots[2]) + edgeLength(slots[1], slots[3])) / 2
  if (!(jamb > 1e-6) || !(door > 0)) return Infinity
  return Math.abs(Math.log((door / jamb) / predicted))
}

// Lowest final 8-corner pixel RMS wins. A near-tie breaks on |scaleDrift − 1|.
// If those also tie, the image edge ratio picks the orientation.
function preferOrientFit(candidate, incumbent, slotsA, slotsB, spec, imageW, imageH) {
  if (!incumbent) return true
  const gap = candidate.rmsPx - incumbent.rmsPx
  if (gap < -1e-4) return true
  if (gap > 1e-4) return false
  const candDrift = Math.abs(candidate.scaleDrift - 1)
  const incDrift = Math.abs(incumbent.scaleDrift - 1)
  if (Number.isFinite(candDrift) && Number.isFinite(incDrift)) {
    if (candDrift < incDrift - 1e-4) return true
    if (candDrift > incDrift + 1e-4) return false
  } else if (!Number.isFinite(incDrift)) return true
  else return false
  const candAspect = orientationAspectPenalty(slotsA, spec, candidate.orientA, imageW, imageH)
    + orientationAspectPenalty(slotsB, spec, candidate.orientB, imageW, imageH)
  const incAspect = orientationAspectPenalty(slotsA, spec, incumbent.orientA, imageW, imageH)
    + orientationAspectPenalty(slotsB, spec, incumbent.orientB, imageW, imageH)
  return candAspect < incAspect
}

// One orientation pair. The shared frame cannot be fixed until the gap W is
// known, so: fit H_A from A's four corners (outer edge at measurement 0),
// map all eight corners, and read W_est as the perpendicular distance
// between the outer edges. Scale drift is B's mapped long edge over the true
// long edge, using B's own orientation, and the same check from H_B.
// Destinations are then A's rectangle on [0, extent] and B's on
// [W − extent, W], with B shifted by the transverse offset seen in A's frame
// (the edges along the jamb need not be collinear). A wrong W is not a
// homography of the plane: the 8-point pixel residual is unimodal in W, so a
// downhill bracket re-estimates it and one parabola refits. Two iterations.
function fitTwoReferenceOrientation(slotsA, slotsB, spec, which, orientA, orientB) {
  const dstA = slotDestinations(spec, which, 0, 0, 1, orientA)
  const dstBLocal = slotDestinations(spec, which, 0, 0, 1, orientB)
  const HA = solveHomographyLeastSquares(slotsA, dstA)
  const HB = solveHomographyLeastSquares(slotsB, dstBLocal)
  if (!HA || !HB) return null
  const mappedB = mapPoints(HA, slotsB)
  const mappedA = mapPoints(HB, slotsA)
  if (!mappedB || !mappedA) return null
  const linesFromA = perpendicularLinesDistanceMm(dstA[0], dstA[1], mappedB[0], mappedB[1])
  const linesFromB = perpendicularLinesDistanceMm(dstBLocal[0], dstBLocal[1], mappedA[0], mappedA[1])
  if (!linesFromA || !(linesFromA.meanMm > 1)) return null
  const across = orientExtents(spec, orientB).acrossMm
  let tSum = 0
  for (let i = 0; i < 4; i++) tSum += axisOf(mappedB[i], which).t
  const yB = tSum / 4 - across / 2
  const driftA = mappedLongEdgeMm(mappedB, orientB) / spec.longMm
  const driftB = mappedLongEdgeMm(mappedA, orientA) / spec.longMm
  const src = slotsA.concat(slotsB)
  const initialW = linesFromA.meanMm
  function fitAt(W) {
    const dst = dstA.concat(slotDestinations(spec, which, W, yB, -1, orientB))
    const H = solveHomographyLeastSquares(src, dst)
    if (!H) return null
    return {H, dst, rmsPx: pixelReprojectionRms(H, src, dst)}
  }
  // A single-card H extrapolates noise across the whole gap, so W_est can
  // be tens of millimetres off. Pixel reprojection of the 8-point H is
  // unimodal in W. Walk downhill until the error rises (bracket), then one
  // parabolic refit. That is the two-iteration re-estimate.
  let best = fitAt(initialW)
  if (!best) return null
  let bestW = initialW
  if (linesFromB && linesFromB.meanMm > 1) {
    const fromB = fitAt(linesFromB.meanMm)
    if (fromB && fromB.rmsPx < best.rmsPx) {
      best = fromB
      bestW = linesFromB.meanMm
    }
  }
  const step0 = Math.max(4, Math.abs(bestW) * 0.03)
  const leftW = bestW - step0
  const rightW = bestW + step0
  const leftFit = fitAt(leftW)
  const rightFit = fitAt(rightW)
  let dir = 1
  if (leftFit && rightFit) dir = rightFit.rmsPx < leftFit.rmsPx ? 1 : -1
  else if (leftFit) dir = -1
  let prevW = bestW
  let prevFit = best
  let curW = bestW + dir * step0
  let curFit = dir > 0 ? rightFit : leftFit
  if (curFit && curFit.rmsPx < prevFit.rmsPx) {
    let step = step0
    for (let n = 0; n < 8; n++) {
      step *= 1.7
      const nextW = curW + dir * step
      if (!(nextW > bestW * 0.35) || nextW > bestW * 2.5) break
      const nextFit = fitAt(nextW)
      if (!nextFit) break
      if (nextFit.rmsPx >= curFit.rmsPx) {
        const vertex = parabolaMinimum(prevW, prevFit.rmsPx, curW, curFit.rmsPx, nextW, nextFit.rmsPx)
        if (vertex != null) {
          const refined = fitAt(vertex)
          if (refined && refined.rmsPx <= curFit.rmsPx) {
            best = refined
            bestW = vertex
          } else {
            best = curFit
            bestW = curW
          }
        } else {
          best = curFit
          bestW = curW
        }
        curFit = null
        break
      }
      prevW = curW
      prevFit = curFit
      curW = nextW
      curFit = nextFit
    }
    if (curFit && curFit.rmsPx < best.rmsPx) {
      best = curFit
      bestW = curW
    }
  } else if (leftFit && rightFit) {
    const vertex = parabolaMinimum(leftW, leftFit.rmsPx, bestW, best.rmsPx, rightW, rightFit.rmsPx)
    if (vertex != null) {
      const refined = fitAt(vertex)
      if (refined && refined.rmsPx <= best.rmsPx) {
        best = refined
        bestW = vertex
      }
    }
  }
  const mapped = mapPoints(best.H, src)
  if (!mapped) return null
  const lines = perpendicularLinesDistanceMm(mapped[0], mapped[1], mapped[4], mapped[5])
  if (!lines || !Number.isFinite(lines.meanMm)) return null
  const fitRmsMm = metricReprojectionRms(best.H, src, best.dst)
  if (fitRmsMm == null || !Number.isFinite(best.rmsPx)) return null
  return {
    H: best.H,
    src,
    dst: best.dst,
    widthMm: lines.meanMm,
    spreadMm: lines.spreadMm,
    linesAngleDeg: lines.angleDeg,
    fitRmsMm,
    rmsPx: best.rmsPx,
    scaleDrift: furtherFromOne(driftA, driftB),
    scaleDriftA: driftA,
    scaleDriftB: driftB,
    orientA,
    orientB,
  }
}

// Each reference independently may have its long edge or its short edge
// across the doorway. The four combinations each run the W search; the
// lowest 8-corner pixel reprojection wins. The reported width is the mean
// of the four endpoint-to-other-line distances under that H, not a chord.
function cornerAspect(corners, imageW, imageH) {
  if (!corners || corners.length !== 4) return null
  if (!(imageW > 0) || !(imageH > 0)) return null
  return rectangleAspectFromPerspective(orderCorners(corners), imageW, imageH, null)
}

function twoReferenceDestinationMm(cornersA, cornersB, ref, mode, imageW, imageH) {
  const spec = ref || CARD_REF
  const which = mode === 'wall' ? 'wall' : 'floor'
  if (!cornersA || !cornersB || cornersA.length !== 4 || cornersB.length !== 4) return null
  const centroidA = centroidOf(cornersA)
  const centroidB = centroidOf(cornersB)
  const span = Math.hypot(centroidB.x - centroidA.x, centroidB.y - centroidA.y)
  if (!(span > 1)) return null
  const doorDir = normalizeVec(centroidB.x - centroidA.x, centroidB.y - centroidA.y)
  if (!Number.isFinite(doorDir.x) || !Number.isFinite(doorDir.y)) return null
  const slotsA = referenceCornerSlots(cornersA, centroidB, doorDir)
  const slotsB = referenceCornerSlots(cornersB, centroidA, doorDir)
  if (!slotsA || !slotsB) return null
  let chosen = null
  for (let i = 0; i < ORIENTATION_CHOICES.length; i++) {
    for (let j = 0; j < ORIENTATION_CHOICES.length; j++) {
      const fit = fitTwoReferenceOrientation(
        slotsA,
        slotsB,
        spec,
        which,
        ORIENTATION_CHOICES[i],
        ORIENTATION_CHOICES[j]
      )
      if (!fit) continue
      if (preferOrientFit(fit, chosen, slotsA, slotsB, spec, imageW, imageH)) chosen = fit
    }
  }
  if (!chosen) return null
  chosen.refAPx = meanLongEdgePx(orderCorners(cornersA))
  chosen.refBPx = meanLongEdgePx(orderCorners(cornersB))
  chosen.aspectA = cornerAspect(cornersA, imageW, imageH)
  chosen.aspectB = cornerAspect(cornersB, imageW, imageH)
  return chosen
}

function homographyPixelsToMm(pixelCorners, ref, imageW, imageH, focalPx) {
  if (!pixelCorners || pixelCorners.length !== 4) return null
  const ordered = orderCorners(pixelCorners)
  const dst = referenceDestinationMm(ordered, ref || CARD_REF, imageW, imageH, focalPx)
  let H = null
  if (typeof cv !== 'undefined' && cv && typeof cv.getPerspectiveTransform === 'function') {
    try {
      H = cvPerspectiveToArray(ordered, dst)
    } catch (err) {
      H = null
    }
  }
  if (!H) H = solveHomography(ordered, dst)
  if (!H) return null
  return {
    ordered,
    H,
    cardLongPx: meanLongEdgePx(ordered),
    aspect: dst.aspect || null,
  }
}

function cvPerspectiveToArray(srcPts, dstPts) {
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, [
    srcPts[0].x, srcPts[0].y, srcPts[1].x, srcPts[1].y,
    srcPts[2].x, srcPts[2].y, srcPts[3].x, srcPts[3].y,
  ])
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [
    dstPts[0].x, dstPts[0].y, dstPts[1].x, dstPts[1].y,
    dstPts[2].x, dstPts[2].y, dstPts[3].x, dstPts[3].y,
  ])
  const mat = cv.getPerspectiveTransform(src, dst)
  const H = mat3ToArray(mat)
  src.delete()
  dst.delete()
  mat.delete()
  return H
}

function mat3ToArray(mat) {
  const out = []
  if (mat.data64F && mat.data64F.length >= 9) {
    for (let i = 0; i < 9; i++) out.push(mat.data64F[i])
    return out
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out.push(mat.doubleAt(r, c))
  }
  return out
}

// method 0 uses every correspondence. Called only when the pure DLT returns null.
function cvFindHomographyArray(srcPts, dstPts) {
  const n = srcPts.length
  const srcData = []
  const dstData = []
  for (let i = 0; i < n; i++) {
    srcData.push(srcPts[i].x, srcPts[i].y)
    dstData.push(dstPts[i].x, dstPts[i].y)
  }
  const src = cv.matFromArray(n, 1, cv.CV_32FC2, srcData)
  const dst = cv.matFromArray(n, 1, cv.CV_32FC2, dstData)
  let mat = null
  try {
    mat = cv.findHomography(src, dst, 0)
    if (!mat || (typeof mat.empty === 'function' && mat.empty())) return null
    const H = mat3ToArray(mat)
    if (!H || H.length < 9) return null
    return H
  } finally {
    if (src && typeof src.delete === 'function') src.delete()
    if (dst && typeof dst.delete === 'function') dst.delete()
    if (mat && typeof mat.delete === 'function') mat.delete()
  }
}

function inchesFromMm(mm) {
  return mm / MM_PER_INCH
}

// Omitting ref keeps the card quad (180×113) so existing callers stay valid.
function defaultQuadAt(tapX, tapY, imgW, imgH, ref) {
  const spec = ref && ref.defaultLongPx ? ref : CARD_REF
  const w = spec.defaultLongPx
  const h = spec.defaultShortPx
  let cx = tapX
  let cy = tapY
  const halfW = w / 2
  const halfH = h / 2
  if (cx < halfW) cx = halfW
  if (cy < halfH) cy = halfH
  if (cx > imgW - halfW) cx = imgW - halfW
  if (cy > imgH - halfH) cy = imgH - halfH
  return [
    point(cx - halfW, cy - halfH),
    point(cx + halfW, cy - halfH),
    point(cx + halfW, cy + halfH),
    point(cx - halfW, cy + halfH),
  ]
}

function intersectLines(a, b) {
  const cross = a.vx * b.vy - a.vy * b.vx
  if (Math.abs(cross) < 1e-8) return null
  const dx = b.x0 - a.x0
  const dy = b.y0 - a.y0
  const t = (dx * b.vy - dy * b.vx) / cross
  return point(a.x0 + t * a.vx, a.y0 + t * a.vy)
}

function lineFromSegment(p0, p1) {
  const vx = p1.x - p0.x
  const vy = p1.y - p0.y
  const len = Math.hypot(vx, vy) || 1
  return {vx: vx / len, vy: vy / len, x0: p0.x, y0: p0.y}
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-8) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  if (t < 0) t = 0
  if (t > 1) t = 1
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Interior angle at curr, in degrees. 0 when a side has no length.
function interiorAngleDeg(prev, curr, next) {
  const ax = prev.x - curr.x
  const ay = prev.y - curr.y
  const bx = next.x - curr.x
  const by = next.y - curr.y
  const left = Math.hypot(ax, ay)
  const right = Math.hypot(bx, by)
  if (left < 1e-6 || right < 1e-6) return 0
  let cos = (ax * bx + ay * by) / (left * right)
  if (cos > 1) cos = 1
  if (cos < -1) cos = -1
  return Math.acos(cos) * 180 / Math.PI
}

function quadAnglesOk(quad) {
  if (!quad || quad.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const deg = interiorAngleDeg(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4])
    if (!Number.isFinite(deg) || deg < 40 || deg > 140) return false
  }
  return true
}

// Long/short of the two opposite-edge means. 0 when a side collapses.
function edgePairRatio(quad) {
  if (!quad || quad.length !== 4) return 0
  const pairA = (edgeLength(quad[0], quad[1]) + edgeLength(quad[2], quad[3])) / 2
  const pairB = (edgeLength(quad[1], quad[2]) + edgeLength(quad[3], quad[0])) / 2
  const longEdge = Math.max(pairA, pairB)
  const shortEdge = Math.min(pairA, pairB)
  if (!(shortEdge > 1)) return 0
  return longEdge / shortEdge
}

// Wide band: a ~43° shot foreshortens one axis, so a card can read ~2.2–2.5 : 1.
function ratioInAcceptBand(ratio, refRatio) {
  if (!(ratio > 0) || !(refRatio > 0)) return false
  return ratio >= refRatio * 0.6 && ratio <= refRatio * 3
}

// 1 when the quad matches the reference, 0 at a 3× stretch either way.
function aspectScore(ratio, refRatio) {
  if (!(ratio > 0) || !(refRatio > 0)) return 0
  const raw = 1 - Math.abs(Math.log(ratio / refRatio)) / Math.log(3)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  if (raw > 1) return 1
  return raw
}

function edgeStraightnessScore(meanGap, meanEdge) {
  if (!(meanEdge > 0) || !(meanGap >= 0)) return 0
  const score = 1 - (meanGap / meanEdge) / STRAIGHTNESS_GAP_FRACTION
  if (!Number.isFinite(score) || score <= 0) return 0
  if (score > 1) return 1
  return score
}

// aspect 0.5, straightness 0.3, area rank 0.2. Larger area ranks higher.
function scoreQuadCandidate(ratio, refRatio, straightness, area, maxArea) {
  const aspect = aspectScore(ratio, refRatio)
  let straight = straightness
  if (!(straight > 0)) straight = 0
  if (straight > 1) straight = 1
  const areaRank = maxArea > 0 ? area / maxArea : 0
  return aspect * 0.5 + straight * 0.3 + areaRank * 0.2
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CARD_LONG_MM,
    CARD_SHORT_MM,
    LETTER_LONG_MM,
    LETTER_SHORT_MM,
    CARD_REF,
    LETTER_REF,
    LEGAL_REF,
    NOTEPAD_REF,
    A4_REF,
    MM_PER_INCH,
    FIT_RMS_WARN_MM,
    MARKER_RMS_WARN_MM,
    TEMPLATE_LETTER_V1,
    TEMPLATE_OUTER_EXTENT_IN,
    TEMPLATE_OUTER_LONG_IN,
    TEMPLATE_OUTER_SHORT_IN,
    orderCorners,
    isoDestinationMm,
    referenceDestinationMm,
    rectangleAspectFromPerspective,
    meanLongEdgePx,
    solveHomography,
    solveHomographyLeastSquares,
    applyHomography,
    invertHomography,
    planarDistanceMm,
    sheetAxisSeparationMm,
    perpendicularLinesDistanceMm,
    localScaleMmPerPx,
    twoReferenceDestinationMm,
    customReference,
    referenceToken,
    scaleDriftWarn,
    templateReference,
    templateInteriorLayoutIn,
    templateMarkerOuterCornersIn,
    templateMarkerOuterCornersMm,
    templateOuterQuadMm,
    templatePageCornersMm,
    templateOuterCornerIndex,
    alignTemplateMarkerCorners,
    templateQuadFromAlignedMarkers,
    convexQuadContains,
    convexQuadContainsAll,
    paperMappedSizeMm,
    paperSizePlausible,
    recoverPrintScaleFromPaper,
    recoverPrintScaleFromBar,
    choosePrintScale,
    homographyPixelsToMm,
    defaultQuadAt,
    quadAnglesOk,
    edgePairRatio,
    ratioInAcceptBand,
    aspectScore,
    edgeStraightnessScore,
    scoreQuadCandidate,
  }
}

if (typeof document !== 'undefined') {
  const bootIfStage = () => {
    if (document.getElementById('stage')) bootReferenceApp()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootIfStage)
  else bootIfStage()
}

function bootReferenceApp() {
  const els = {}
  const measurements = []
  const diagnosticLines = []
  const captureCanvas = document.createElement('canvas')
  const captureCtx = captureCanvas.getContext('2d')
  const LINE_LENGTH_KEY = 'adapta.lineLengthIn'
  const LINE_MIN_IN = 5.5
  const LINE_MAX_IN = 6.5
  const TAPE_FRACTION_GLYPHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞']

  let uiStep = 1
  let phase = 'live'
  let mode = 'floor'
  let layout = 'one'
  let referenceKind = 'template'
  let customRef = null
  let templatePrintScaleValue = 1
  let templatePrintSource = 'none'
  let templatePrintStatus = 'unverified'
  let templatePrintRemembered = false
  let templateBarIn = TEMPLATE_LETTER_V1.barIn
  let templateMeta = null
  let sessionPrintScale = null
  let printScaleNudgeShown = false
  let cameraStream = null
  let cameraReady = false
  let cameraDenied = false
  let visionReady = false
  let visionFailed = false
  let beta = null
  let gamma = null
  let captureWidth = 0
  let captureHeight = 0
  let captureBeta = null
  let captureGamma = null
  let cardCorners = null
  let originalCorners = null
  let refACorners = null
  let refBCorners = null
  let refADetect = 'manual'
  let refBDetect = 'manual'
  let refAStrategy = 'manual'
  let refBStrategy = 'manual'
  let pendingUsesTemplate = false
  let pendingAutoMarkers = 'n'
  let refAUsesTemplate = false
  let adjustNoun = null
  let readingUsesTemplate = false
  let readingAutoMarkers = 'n'
  let readingSpec = null
  let readingAspect = null
  let readingAspectB = null
  let detectKind = 'manual'
  let detectStrategy = 'manual'
  let homography = null
  let cardLongPx = 0
  let points = {a: null, b: null}
  let currentReading = null
  let dragTarget = null
  let dragAnchor = null
  let loupePoint = null
  let instructionHoldUntil = 0
  let copyLabelTimer = 0
  let saveLabelTimer = 0
  let loggingDiagnostic = false
  let orientationBound = false
  let sheetHandlesVisible = false
  let sheetFlashUntil = 0
  let sheetFlashRaf = 0
  let lineRemembered = false
  let liveCheckTimer = 0
  let liveCheckDelay = 300
  let liveMarkerSeenAt = 0
  let liveDetector = null
  let liveCanvas = null
  let menuOpen = false
  let menuFocusReturn = null
  let pointPopUntil = {a: 0, b: 0}
  let templateLineConfirmed = false
  let captureTemplateMissed = false
  let detectingSheet = false
  let instructionHoldTimer = 0

  function cacheElements() {
    els.stage = document.getElementById('stage')
    els.preview = document.getElementById('preview')
    els.still = document.getElementById('still')
    els.marks = document.getElementById('marks')
    els.instructionText = document.getElementById('instructionText')
    els.topBar = document.getElementById('topBar')
    els.readout = document.getElementById('readout')
    els.visionStatus = document.getElementById('visionStatus')
    els.cameraResolution = document.getElementById('cameraResolution')
    els.tiltAngles = document.getElementById('tiltAngles')
    els.enableTiltButton = document.getElementById('enableTiltButton')
    els.floorModeButton = document.getElementById('floorModeButton')
    els.wallModeButton = document.getElementById('wallModeButton')
    els.lineLengthInput = document.getElementById('lineLengthInput')
    els.templateBarIn = els.lineLengthInput
    els.copyResultsButton = document.getElementById('copyResultsButton')
    els.resultInches = document.getElementById('resultInches')
    els.resultExact = document.getElementById('resultExact')
    els.resultExactIn = document.getElementById('resultExactIn')
    els.resultExactCm = document.getElementById('resultExactCm')
    els.resultScale = document.getElementById('resultScale')
    els.stepPillStep = document.getElementById('stepPillStep')
    els.stepPillDetail = document.getElementById('stepPillDetail')
    els.menuCloseButton = document.getElementById('menuCloseButton')
    els.resultWarning = document.getElementById('resultWarning')
    els.resultWarningText = document.getElementById('resultWarningText')
    els.measurementSummary = document.getElementById('measurementSummary')
    els.measurementRows = document.getElementById('measurementRows')
    els.clipboardFallback = document.getElementById('clipboardFallback')
    els.diagnosticsPanel = document.getElementById('diagnosticsPanel')
    els.diagnosticsSummary = document.getElementById('diagnosticsSummary')
    els.stepSheet = document.getElementById('stepSheet')
    els.measureRoot = document.getElementById('measureRoot')
    els.templateCard = document.getElementById('templateCard')
    els.letterCard = document.getElementById('letterCard')
    els.lineExactCheck = document.getElementById('lineExactCheck')
    els.lineRememberedNote = document.getElementById('lineRememberedNote')
    els.lineRangeMessage = document.getElementById('lineRangeMessage')
    els.letterCheck = document.getElementById('letterCheck')
    els.useLetterButton = document.getElementById('useLetterButton')
    els.useTemplateButton = document.getElementById('useTemplateButton')
    els.openCameraButton = document.getElementById('openCameraButton')
    els.backButton = document.getElementById('backButton')
    els.stepPill = document.getElementById('stepPill')
    els.moreButton = document.getElementById('moreButton')
    els.moreButtonStage = document.getElementById('moreButtonStage')
    els.menuBadge = document.getElementById('menuBadge')
    els.menuBadgeStage = document.getElementById('menuBadgeStage')
    els.sheetStatus = document.getElementById('sheetStatus')
    els.shutterButton = document.getElementById('shutterButton')
    els.placeBlock = document.getElementById('placeBlock')
    els.resultBlock = document.getElementById('resultBlock')
    els.modeToggle = document.getElementById('modeToggle')
    els.saveButton = document.getElementById('saveButton')
    els.retakeButton = document.getElementById('retakeButton')
    els.clearPointsButton = document.getElementById('clearPointsButton')
    els.adjustSheetButton = document.getElementById('adjustSheetButton')
    els.doneAdjustButton = document.getElementById('doneAdjustButton')
    els.looksRightButton = document.getElementById('looksRightButton')
    els.moreMenu = document.getElementById('moreMenu')
    els.moreBackdrop = document.getElementById('moreBackdrop')
    els.savedToggle = document.getElementById('savedToggle')
    els.savedPanel = document.getElementById('savedPanel')
    els.debugToggle = document.getElementById('debugToggle')
    els.debugPanel = document.getElementById('debugPanel')
    els.changeSheetButton = document.getElementById('changeSheetButton')
    renderDiagnostics()
    renderList()
  }

  function logDiagnostic(text) {
    const seconds = (performance.now() / 1000).toFixed(1)
    diagnosticLines.push(`[+${seconds}s] ${text}`)
    if (diagnosticLines.length > DIAGNOSTIC_CAP) diagnosticLines.shift()
    if (loggingDiagnostic) return
    loggingDiagnostic = true
    try {
      renderDiagnostics()
    } finally {
      loggingDiagnostic = false
    }
  }

  function renderDiagnostics() {
    const panel = els.diagnosticsPanel
    if (!panel) return
    if (els.diagnosticsSummary) {
      els.diagnosticsSummary.textContent = `Debug log (${diagnosticLines.length})`
    }
    const rows = []
    for (let i = 0; i < diagnosticLines.length; i++) {
      const row = document.createElement('div')
      row.className = 'diagnostic-row'
      row.textContent = diagnosticLines[i]
      rows.push(row)
    }
    panel.replaceChildren(...rows)
    panel.scrollTop = panel.scrollHeight
  }

  function errorMessage(error) {
    if (error && typeof error.message === 'string' && error.message) return error.message
    if (typeof error === 'string') return error
    try {
      return String(error)
    } catch (err) {
      return 'unknown'
    }
  }

  function formatTapeInches(inches) {
    if (!Number.isFinite(inches) || inches < 0) return ''
    const eighths = Math.round(inches * 8)
    const whole = Math.floor(eighths / 8)
    const frac = eighths % 8
    if (frac === 0) return `${whole} in`
    return `${whole} ${TAPE_FRACTION_GLYPHS[frac]} in`
  }

  function readStoredLineLength() {
    try {
      const raw = window.localStorage.getItem(LINE_LENGTH_KEY)
      const value = Number(raw)
      if (value >= LINE_MIN_IN && value <= LINE_MAX_IN) return value
    } catch (err) {
      // Storage may throw in private mode.
    }
    return null
  }

  function persistLineLength() {
    const value = Number(String(els.lineLengthInput && els.lineLengthInput.value).trim())
    if (!(value >= LINE_MIN_IN && value <= LINE_MAX_IN)) return
    try {
      window.localStorage.setItem(LINE_LENGTH_KEY, String(value))
    } catch (err) {
      // Page must still work when storage throws.
    }
  }

  function loadRememberedLineLength() {
    const stored = readStoredLineLength()
    if (stored == null || !els.lineLengthInput) return
    els.lineLengthInput.value = stored.toFixed(2)
    lineRemembered = true
    if (els.lineRememberedNote) els.lineRememberedNote.removeAttribute('hidden')
    if (Math.abs(stored - TEMPLATE_LETTER_V1.barIn) < 1e-6 && els.lineExactCheck) {
      els.lineExactCheck.checked = true
    }
    readTemplateBarField(els.lineLengthInput)
  }

  function lineLengthInRange(value) {
    return value >= LINE_MIN_IN && value <= LINE_MAX_IN
  }

  function lineLengthConfirmed() {
    if (!els.lineLengthInput) return false
    if (els.lineExactCheck && els.lineExactCheck.checked) return true
    const value = Number(String(els.lineLengthInput.value).trim())
    return lineLengthInRange(value)
  }

  function onLineLengthInput() {
    if (!els.lineLengthInput) return
    lineRemembered = false
    if (els.lineRememberedNote) els.lineRememberedNote.setAttribute('hidden', '')
    const raw = String(els.lineLengthInput.value).trim()
    const value = Number(raw)
    if (els.lineExactCheck && Math.abs(value - TEMPLATE_LETTER_V1.barIn) > 1e-6) {
      els.lineExactCheck.checked = false
    }
    if (els.lineRangeMessage) {
      if (raw !== '' && !lineLengthInRange(value)) els.lineRangeMessage.removeAttribute('hidden')
      else els.lineRangeMessage.setAttribute('hidden', '')
    }
    readTemplateBarField(els.lineLengthInput)
    updateOpenCameraEnabled()
  }

  function onExactCheck() {
    if (!els.lineExactCheck || !els.lineLengthInput) return
    if (els.lineExactCheck.checked) {
      els.lineLengthInput.value = '6.00'
      if (els.lineRangeMessage) els.lineRangeMessage.setAttribute('hidden', '')
      readTemplateBarField(els.lineLengthInput)
      persistLineLength()
    }
    updateOpenCameraEnabled()
  }

  function updateOpenCameraEnabled() {
    if (!els.openCameraButton) return
    let ok = false
    if (referenceKind === 'letter') {
      ok = !!(els.letterCheck && els.letterCheck.checked)
    } else {
      ok = lineLengthConfirmed()
    }
    els.openCameraButton.disabled = !ok
  }

  function setSheetKind(kind) {
    referenceKind = kind === 'letter' ? 'letter' : 'template'
    templateLineConfirmed = referenceKind === 'template' && lineLengthConfirmed()
    if (els.templateCard) {
      if (referenceKind === 'template') els.templateCard.removeAttribute('hidden')
      else els.templateCard.setAttribute('hidden', '')
    }
    if (els.letterCard) {
      if (referenceKind === 'letter') els.letterCard.removeAttribute('hidden')
      else els.letterCard.setAttribute('hidden', '')
    }
    if (els.useLetterButton) {
      if (referenceKind === 'template') els.useLetterButton.removeAttribute('hidden')
      else els.useLetterButton.setAttribute('hidden', '')
    }
    if (els.useTemplateButton) {
      if (referenceKind === 'letter') els.useTemplateButton.removeAttribute('hidden')
      else els.useTemplateButton.setAttribute('hidden', '')
    }
    instructionHoldUntil = 0
    updateOpenCameraEnabled()
    renderInstruction()
    logDiagnostic(`reference ${referenceToken(currentReference())}`)
  }

  function openCameraFromStep1() {
    if (els.openCameraButton && els.openCameraButton.disabled) return
    if (referenceKind !== 'letter' && lineLengthConfirmed()) persistLineLength()
    templateLineConfirmed = referenceKind === 'template' && lineLengthConfirmed()
    readTemplateBarField()
    resetTemplateScale()
    uiStep = 2
    phase = 'live'
    if (els.stepSheet) els.stepSheet.setAttribute('hidden', '')
    if (els.measureRoot) els.measureRoot.removeAttribute('hidden')
    syncChrome()
    startCamera().then(() => {
      startLiveCheck()
      syncChrome()
    })
  }

  function goToStep1() {
    endDrag()
    stopLiveCheck()
    stopCamera()
    clearCaptureGeometry()
    clearResultText()
    showLive()
    sheetHandlesVisible = false
    sheetFlashUntil = 0
    captureTemplateMissed = false
    detectingSheet = false
    uiStep = 1
    phase = 'live'
    cameraDenied = false
    if (els.measureRoot) els.measureRoot.setAttribute('hidden', '')
    if (els.stepSheet) els.stepSheet.removeAttribute('hidden')
    setMenuOpen(false)
    updateOpenCameraEnabled()
    instructionHoldUntil = 0
    renderInstruction()
    syncChrome()
  }

  function beginAdjustSheet() {
    if (!cardCorners) return
    sheetHandlesVisible = true
    phase = 'adjust-card'
    instructionHoldUntil = 0
    renderInstruction()
    drawMarks()
    syncChrome()
  }

  function setMenuOpen(open) {
    const next = !!open
    if (next && !menuOpen) menuFocusReturn = document.activeElement
    menuOpen = next
    if (els.moreMenu) {
      if (menuOpen) els.moreMenu.removeAttribute('hidden')
      else els.moreMenu.setAttribute('hidden', '')
    }
    if (els.moreBackdrop) {
      if (menuOpen) els.moreBackdrop.removeAttribute('hidden')
      else els.moreBackdrop.setAttribute('hidden', '')
    }
    if (menuOpen) {
      const focusEl = els.menuCloseButton || els.savedToggle
      requestAnimationFrame(() => {
        if (focusEl && typeof focusEl.focus === 'function') focusEl.focus()
      })
      return
    }
    const back = menuFocusReturn
    menuFocusReturn = null
    if (back && typeof back.focus === 'function') {
      requestAnimationFrame(() => back.focus())
    }
  }

  function toggleMenuPanel(which) {
    const panel = which === 'saved' ? els.savedPanel : els.debugPanel
    if (!panel) return
    const open = panel.hasAttribute('hidden')
    if (els.savedPanel) els.savedPanel.setAttribute('hidden', '')
    if (els.debugPanel) els.debugPanel.setAttribute('hidden', '')
    if (open) panel.removeAttribute('hidden')
  }

  function updateMenuBadge() {
    const label = measurements.length ? String(measurements.length) : ''
    if (els.menuBadge) els.menuBadge.textContent = label
    if (els.menuBadgeStage) els.menuBadgeStage.textContent = label
  }

  function updateStepPill() {
    if (!els.stepPillStep && !els.stepPillDetail) return
    let step = ''
    let detail = ''
    if (uiStep === 2) {
      step = 'Step 2 of 3'
      detail = referenceKind === 'letter' ? 'Place the paper' : 'Place the sheet'
    } else if (uiStep === 3) {
      step = 'Step 3 of 3'
      detail = 'Mark the two sides'
      if (detectingSheet) detail = 'Looking for the sheet…'
      else if (phase === 'need-card-tap') {
        detail = referenceKind === 'letter' ? 'Tap the paper' : 'Find the sheet'
      } else if (phase === 'adjust-card' || phase === 'adjust-card-b') {
        detail = sheetHandlesVisible ? 'Adjust the sheet' : 'Mark the two sides'
      } else if (phase === 'point-a') detail = pointInstruction('a')
      else if (phase === 'point-b') detail = pointInstruction('b')
      else if (phase === 'result') detail = 'Your measurement'
    }
    if (els.stepPillStep) els.stepPillStep.textContent = step
    if (els.stepPillDetail) els.stepPillDetail.textContent = detail
  }

  function setHidden(el, hidden) {
    if (!el) return
    if (hidden) el.setAttribute('hidden', '')
    else el.removeAttribute('hidden')
  }

  function syncChrome() {
    document.body.classList.toggle('is-step-1', uiStep === 1)
    document.body.classList.toggle('is-step-2', uiStep === 2)
    document.body.classList.toggle('is-step-3', uiStep === 3)
    const onPhoto = uiStep > 1
    setHidden(els.stepSheet, onPhoto)
    setHidden(els.measureRoot, !onPhoto)
    setHidden(els.backButton, uiStep !== 2)
    setHidden(els.shutterButton, uiStep !== 2)
    setHidden(els.sheetStatus, !((uiStep === 2 && referenceKind === 'template') || detectingSheet))
    setHidden(els.placeBlock, uiStep === 3 && !!currentReading)
    setHidden(els.modeToggle, uiStep !== 2)
    setHidden(els.resultBlock, !(uiStep === 3 && currentReading))
    const adjusting = uiStep === 3 && sheetHandlesVisible
      && (phase === 'adjust-card' || phase === 'adjust-card-b')
    const canAdjust = uiStep === 3 && cardCorners && !sheetHandlesVisible
      && (phase === 'point-a' || phase === 'point-b' || phase === 'result')
    const letterAdjust = adjusting && !pendingUsesTemplate
    setHidden(els.looksRightButton, !letterAdjust)
    setHidden(els.doneAdjustButton, !(adjusting && !letterAdjust))
    setHidden(els.saveButton, !(uiStep === 3 && currentReading && !adjusting))
    setHidden(els.retakeButton, uiStep !== 3)
    setHidden(els.adjustSheetButton, !canAdjust)
    setHidden(els.clearPointsButton, !(uiStep === 3 && (points.a || points.b)))
    if (els.instructionText) {
      const showInstruction = uiStep === 2 || (uiStep === 3 && !currentReading)
      setHidden(els.instructionText, !showInstruction)
    }
    updateStepPill()
    updateMenuBadge()
  }

  function startLiveCheck() {
    stopLiveCheck()
    if (uiStep !== 2 || referenceKind !== 'template') return
    liveCheckDelay = 300
    liveMarkerSeenAt = 0
    liveTick()
  }

  function stopLiveCheck() {
    if (liveCheckTimer) {
      clearTimeout(liveCheckTimer)
      liveCheckTimer = 0
    }
  }

  function liveTick() {
    liveCheckTimer = 0
    if (uiStep !== 2 || document.hidden || referenceKind !== 'template') return
    const started = performance.now()
    const found = runLiveSheetDetect()
    const elapsed = performance.now() - started
    if (found) liveMarkerSeenAt = performance.now()
    const recent = liveMarkerSeenAt > 0 && (performance.now() - liveMarkerSeenAt) < 1000
    if (els.sheetStatus) {
      els.sheetStatus.removeAttribute('hidden')
      els.sheetStatus.textContent = recent ? 'Sheet found' : 'Looking for the sheet…'
      els.sheetStatus.classList.toggle('is-found', recent)
    }
    if (elapsed > 120) liveCheckDelay = 1000
    else liveCheckDelay = 300
    liveCheckTimer = setTimeout(liveTick, liveCheckDelay)
  }

  function runLiveSheetDetect() {
    const video = els.preview
    const api = arucoApi()
    if (!video || !video.videoWidth || !api || typeof api.Detector !== 'function') return false
    const srcW = video.videoWidth
    const srcH = video.videoHeight
    const longSide = Math.max(srcW, srcH)
    const scale = longSide > 640 ? 640 / longSide : 1
    const dw = Math.max(1, Math.round(srcW * scale))
    const dh = Math.max(1, Math.round(srcH * scale))
    try {
      if (!liveCanvas) liveCanvas = document.createElement('canvas')
      liveCanvas.width = dw
      liveCanvas.height = dh
      const ctx = liveCanvas.getContext('2d')
      ctx.drawImage(video, 0, 0, dw, dh)
      const imageData = ctx.getImageData(0, 0, dw, dh)
      if (!liveDetector) liveDetector = new api.Detector({dictionaryName: 'ARUCO_MIP_36h12'})
      const raw = liveDetector.detect(imageData) || []
      const allowed = {0: true, 1: true, 2: true, 3: true}
      let count = 0
      for (let i = 0; i < raw.length; i++) {
        if (allowed[raw[i].id]) count += 1
      }
      return count >= 2
    } catch (err) {
      return false
    }
  }

  function currentReference() {
    if (referenceKind === 'letter') return LETTER_REF
    return templateReference(templatePrintScaleValue)
  }

  // Spoken noun in prompts. The printed sheet vs plain paper.
  function referenceNoun(capitalized) {
    let word = 'sheet'
    if (adjustNoun === 'sheet' || referenceKind === 'letter') word = 'paper'
    else if (referenceKind === 'template' || adjustNoun === 'template') word = 'sheet'
    if (!capitalized) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  }

  function referenceChipLabel() {
    return referenceKind === 'letter' ? 'Letter' : 'Template'
  }

  function twoRefLayout() {
    return layout === 'two'
  }

  function formatAngle(value) {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${value.toFixed(1)}°`
  }

  function renderTilt() {
    if (!els.tiltAngles) return
    els.tiltAngles.textContent = `β ${formatAngle(beta)} · γ ${formatAngle(gamma)}`
  }

  // Two short lines so four buttons fit beside the result on the bottom sheet.
  function stackedLabel(line1, line2) {
    return `${line1}<br>${line2}`
  }

  function sheetWord() {
    return referenceKind === 'letter' ? 'paper' : 'sheet'
  }

  function pointInstruction(key) {
    if (mode === 'wall') {
      if (key === 'a') return 'Tap the floor at the wall'
      return 'Now tap the height mark'
    }
    if (key === 'a') return 'Tap where the left jamb meets the floor'
    return 'Now tap where the right jamb meets the floor'
  }

  function tapReferenceInstruction(which) {
    if (referenceKind === 'template' && which !== 'b') {
      return 'Couldn\'t find the sheet. Tap it, or retake the photo with all four corner squares in view.'
    }
    return `Tap the ${sheetWord()}`
  }

  function confirmActionLabel() {
    return pendingUsesTemplate ? 'Done' : 'Looks right'
  }

  function adjustReferenceInstruction() {
    return `Drag the corners onto the ${sheetWord()}'s edges if needed, then tap ${confirmActionLabel()}`
  }

  function needReferenceInstruction() {
    return `Confirm the ${sheetWord()} before placing points.`
  }

  function homographyFailInstruction() {
    return `Those corners do not form a ${sheetWord()}. Drag them onto the four edges and confirm again.`
  }

  function liveInstruction() {
    if (mode === 'wall') {
      return `Hold the ${sheetWord()} flat on the wall between the floor and the height mark. Back up until both are in view.`
    }
    return `Lay the ${sheetWord()} flat on the floor between the door jambs, square to the door. Back up until both jambs are in view.`
  }

  function resultInstruction() {
    return 'Save this measurement, retake the photo, or clear the points.'
  }

  function instructionForState() {
    if (cameraDenied) return CAMERA_DENIED_INSTRUCTION
    if (detectingSheet) return 'Looking for the sheet…'
    if (phase === 'live') return liveInstruction()
    if (phase === 'need-card-tap') return tapReferenceInstruction('a')
    if (phase === 'need-card-b') return tapReferenceInstruction('b')
    if (phase === 'adjust-card' || phase === 'adjust-card-b') {
      return sheetHandlesVisible
        ? `Drag a corner if it is off, then tap ${confirmActionLabel()}`
        : adjustReferenceInstruction()
    }
    if (phase === 'point-a') return pointInstruction('a')
    if (phase === 'point-b') return pointInstruction('b')
    return resultInstruction()
  }

  function renderInstruction() {
    if (performance.now() < instructionHoldUntil) return
    const el = els.instructionText
    if (!el) return
    const next = instructionForState()
    if (el.textContent !== next) el.textContent = next
    updateStepPill()
  }

  function setInstructionExpanded(expanded) {
    void expanded
  }

  function toggleInstructionExpanded() {}

  function showTemporaryInstruction(text, holdMs, tone) {
    const el = els.instructionText
    if (!el) return
    el.textContent = text
    void tone
    instructionHoldUntil = performance.now() + holdMs
    updateStepPill()
    clearTimeout(instructionHoldTimer)
    instructionHoldTimer = setTimeout(() => {
      instructionHoldUntil = 0
      renderInstruction()
      syncChrome()
    }, holdMs)
  }

  function positionChrome() {}

  function setStatusOpen(open) {
    void open
  }

  function setSheetExpanded(expanded) {
    void expanded
  }

  function beginDrag(target, imagePoint, loc) {
    dragTarget = target
    // Remember the grab offset so a 44 px hit does not jump the point to the fingertip.
    dragAnchor = {
      imageX: imagePoint.x,
      imageY: imagePoint.y,
      localX: loc.localX,
      localY: loc.localY,
    }
    loupePoint = {x: imagePoint.x, y: imagePoint.y, localX: loc.localX, localY: loc.localY}
    document.body.classList.add('is-dragging')
    drawMarks()
  }

  function endDrag() {
    dragTarget = null
    dragAnchor = null
    loupePoint = null
    document.body.classList.remove('is-dragging')
  }

  function draggedImagePoint(loc) {
    if (!dragAnchor) return point(loc.x, loc.y)
    const scale = fitMapping().scale || 1
    const dx = (loc.localX - dragAnchor.localX) / scale
    const dy = (loc.localY - dragAnchor.localY) / scale
    return point(dragAnchor.imageX + dx, dragAnchor.imageY + dy)
  }

  function setMode(next) {
    if (phase !== 'live') {
      showTemporaryInstruction(MODE_LOCKED_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    mode = next
    if (els.floorModeButton) {
      els.floorModeButton.setAttribute('aria-pressed', mode === 'floor' ? 'true' : 'false')
    }
    if (els.wallModeButton) {
      els.wallModeButton.setAttribute('aria-pressed', mode === 'wall' ? 'true' : 'false')
    }
    instructionHoldUntil = 0
    renderInstruction()
    syncChrome()
    logDiagnostic(`mode ${mode}`)
  }

  function updateReferenceChip() {
    if (!els.referencePickerButton) return
    els.referencePickerButton.textContent = referenceChipLabel()
    els.referencePickerButton.setAttribute('aria-pressed', 'true')
    if (!els.referencePickerPopover) return
    const options = els.referencePickerPopover.querySelectorAll('[data-reference]')
    for (let i = 0; i < options.length; i++) {
      const selected = options[i].getAttribute('data-reference') === referenceKind
      options[i].setAttribute('aria-pressed', selected ? 'true' : 'false')
    }
  }

  function hideReferencePicker() {
    if (!els.referencePickerPopover) return
    els.referencePickerPopover.setAttribute('hidden', '')
    if (els.referencePickerButton) els.referencePickerButton.setAttribute('aria-expanded', 'false')
    positionChrome()
  }

  function showReferencePicker() {
    if (!els.referencePickerPopover) return
    hideCustomForm()
    updateReferenceChip()
    els.referencePickerPopover.removeAttribute('hidden')
    if (els.referencePickerButton) els.referencePickerButton.setAttribute('aria-expanded', 'true')
    positionChrome()
  }

  function hideCustomForm() {
    if (!els.customReferencePopover) return
    els.customReferencePopover.setAttribute('hidden', '')
    positionChrome()
  }

  function showCustomForm() {
    if (!els.customReferencePopover) return
    hideReferencePicker()
    if (customRef) {
      els.customLongIn.value = formatInchesToken(customRef.longIn)
      els.customShortIn.value = formatInchesToken(customRef.shortIn)
    }
    els.customReferencePopover.removeAttribute('hidden')
    positionChrome()
    if (els.customLongIn) els.customLongIn.focus()
  }

  function toggleReferencePicker() {
    if (phase !== 'live') {
      showTemporaryInstruction(REFERENCE_LOCKED_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    const pickerOpen = els.referencePickerPopover && !els.referencePickerPopover.hasAttribute('hidden')
    const customOpen = els.customReferencePopover && !els.customReferencePopover.hasAttribute('hidden')
    if (pickerOpen || customOpen) {
      hideReferencePicker()
      hideCustomForm()
      return
    }
    showReferencePicker()
  }

  function setLayout(next) {
    if (phase !== 'live') {
      showTemporaryInstruction(LAYOUT_LOCKED_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    layout = next === 'two' ? 'two' : 'one'
    if (els.oneRefButton) els.oneRefButton.setAttribute('aria-pressed', layout === 'one' ? 'true' : 'false')
    if (els.twoRefButton) els.twoRefButton.setAttribute('aria-pressed', layout === 'two' ? 'true' : 'false')
    refreshButtonLabels()
    instructionHoldUntil = 0
    renderInstruction()
    logDiagnostic(`layout ${layout}`)
  }

  function setReference(next) {
    if (phase !== 'live') {
      showTemporaryInstruction(REFERENCE_LOCKED_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    if (next === 'custom') {
      showCustomForm()
      return
    }
    if (next !== 'card' && next !== 'letter' && next !== 'template' && next !== 'legal' && next !== 'notepad' && next !== 'a4') return
    hideCustomForm()
    hideReferencePicker()
    referenceKind = next
    readTemplateBarField()
    updateReferenceChip()
    instructionHoldUntil = 0
    renderInstruction()
    drawMarks()
    logDiagnostic(`reference ${referenceToken(currentReference())}`)
  }

  function templateBarFields() {
    const fields = []
    if (els.lineLengthInput) fields.push(els.lineLengthInput)
    return fields
  }

  function readTemplateBarField(fromEl) {
    const fields = templateBarFields()
    if (fields.length === 0) return
    let source = fromEl || fields[0]
    if (!fromEl) {
      for (let i = 0; i < fields.length; i++) {
        const value = Number(String(fields[i].value).trim())
        if (value > 0 && Number.isFinite(value) && value < 40
            && Math.abs(value - TEMPLATE_LETTER_V1.barIn) > 1e-6) {
          source = fields[i]
          break
        }
      }
    }
    const value = Number(String(source.value).trim())
    if (value > 0 && Number.isFinite(value) && value < 40) templateBarIn = value
    else templateBarIn = TEMPLATE_LETTER_V1.barIn
    for (let i = 0; i < fields.length; i++) {
      if (fields[i] === source) continue
      fields[i].value = source.value
    }
  }

  function renderPrintScaleCurrent() {}

  function rememberSessionPrintScale(value, source) {
    if (!(value > 0) || !Number.isFinite(value)) return
    if (source !== 'paper' && source !== 'bar') return
    sessionPrintScale = {value, source, at: Date.now()}
  }

  function applyCustomReference() {
    if (phase !== 'live') {
      showTemporaryInstruction(REFERENCE_LOCKED_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    const longIn = Number(String(els.customLongIn.value).trim())
    const shortIn = Number(String(els.customShortIn.value).trim())
    if (!(longIn > 0) || !(shortIn > 0) || longIn > 40 || shortIn > 40) {
      showTemporaryInstruction('Enter both edges in inches, up to 40.', MESSAGE_HOLD_MS)
      return
    }
    if (longIn < shortIn) {
      showTemporaryInstruction('Long edge should be the longer side.', MESSAGE_HOLD_MS)
      return
    }
    customRef = customReference(longIn, shortIn)
    referenceKind = 'custom'
    updateReferenceChip()
    hideCustomForm()
    instructionHoldUntil = 0
    renderInstruction()
    drawMarks()
    logDiagnostic(`reference ${referenceToken(customRef)}`)
  }

  function setPrimaryButton() {
    const locked = phase !== 'live'
    if (els.floorModeButton) els.floorModeButton.disabled = locked
    if (els.wallModeButton) els.wallModeButton.disabled = locked
    if (els.shutterButton) {
      els.shutterButton.disabled = uiStep !== 2 || cameraDenied
    }
    syncChrome()
  }

  function refreshButtonLabels() {
    setPrimaryButton()
  }

  function fitMappingFor(mediaW, mediaH) {
    const box = els.stage.getBoundingClientRect()
    const scale = Math.min(box.width / mediaW, box.height / mediaH)
    const dispW = mediaW * scale
    const dispH = mediaH * scale
    return {
      scale,
      offsetX: (box.width - dispW) / 2,
      offsetY: (box.height - dispH) / 2,
      width: box.width,
      height: box.height,
      mediaW,
      mediaH,
    }
  }

  function fitMapping() {
    const mediaW = captureWidth || (els.preview && els.preview.videoWidth) || 1
    const mediaH = captureHeight || (els.preview && els.preview.videoHeight) || 1
    return fitMappingFor(mediaW, mediaH)
  }

  function imageToLocal(imageX, imageY, fit) {
    const mapping = fit || fitMapping()
    return {
      x: mapping.offsetX + imageX * mapping.scale,
      y: mapping.offsetY + imageY * mapping.scale,
    }
  }

  function clientToImage(clientX, clientY) {
    const box = els.stage.getBoundingClientRect()
    const fit = fitMapping()
    const localX = clientX - box.left
    const localY = clientY - box.top
    return {
      x: (localX - fit.offsetX) / fit.scale,
      y: (localY - fit.offsetY) / fit.scale,
      localX,
      localY,
    }
  }

  function resizeMarks() {
    if (!els.marks || !els.stage) return
    const w = Math.max(1, Math.round(els.stage.clientWidth))
    const h = Math.max(1, Math.round(els.stage.clientHeight))
    if (els.marks.width !== w) els.marks.width = w
    if (els.marks.height !== h) els.marks.height = h
    drawMarks()
  }

  function drawHandle(ctx, x, y) {
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#FFCB2E'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.stroke()
  }

  function drawLoupe(ctx, imageX, imageY, localX, localY) {
    const radius = LOUPE_SIZE_PX / 2
    let lx = localX
    // Prefer above the finger. Flip below when that circle would leave the screen.
    let ly = localY - LOUPE_OFFSET_Y
    if (ly < radius) ly = localY + LOUPE_OFFSET_Y
    lx = Math.max(radius, Math.min(els.marks.width - radius, lx))
    ly = Math.max(radius, Math.min(els.marks.height - radius, ly))
    const fit = fitMapping()
    const mag = LOUPE_MAGNIFY * (fit.scale || 1)
    ctx.save()
    ctx.beginPath()
    ctx.arc(lx, ly, radius, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#000'
    ctx.fillRect(lx - radius, ly - radius, radius * 2, radius * 2)
    if (els.still && captureWidth > 0) {
      ctx.drawImage(
        els.still,
        0, 0, captureWidth, captureHeight,
        lx - imageX * mag, ly - imageY * mag,
        captureWidth * mag, captureHeight * mag
      )
    }
    ctx.restore()
    ctx.beginPath()
    ctx.arc(lx, ly, radius, 0, Math.PI * 2)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#f4f1ea'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(lx - radius, ly)
    ctx.lineTo(lx + radius, ly)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(244, 241, 234, 0.9)'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(lx - 14, ly)
    ctx.lineTo(lx + 14, ly)
    ctx.moveTo(lx, ly - 14)
    ctx.lineTo(lx, ly + 14)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#FFCB2E'
    ctx.stroke()
  }

  function strokeOutlinedText(ctx, text, x, y) {
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)'
    ctx.strokeText(text, x, y)
    ctx.fillStyle = '#f4f1ea'
    ctx.fillText(text, x, y)
  }

  function drawLiveGuide(ctx) {
    void ctx
  }

  function drawQuad(ctx, corners, stroke, fill, handles, lineWidth) {
    if (!corners || corners.length !== 4) return
    ctx.beginPath()
    const first = imageToLocal(corners[0].x, corners[0].y)
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < 4; i++) {
      const p = imageToLocal(corners[i].x, corners[i].y)
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = lineWidth || 2
    ctx.strokeStyle = stroke
    ctx.stroke()
    if (!handles) return
    for (let i = 0; i < 4; i++) {
      const p = imageToLocal(corners[i].x, corners[i].y)
      drawHandle(ctx, p.x, p.y)
    }
  }

  function drawSegment(ctx, a, b, stroke) {
    if (!a || !b) return
    const pa = imageToLocal(a.x, a.y)
    const pb = imageToLocal(b.x, b.y)
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.lineWidth = 2
    ctx.strokeStyle = stroke
    ctx.stroke()
  }

  function drawPointMarker(ctx, imagePoint, numeral, key) {
    const local = imageToLocal(imagePoint.x, imagePoint.y)
    const x = local.x
    const y = local.y
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pop = !reduceMotion && key && pointPopUntil[key] > performance.now()
    ctx.save()
    if (pop) {
      ctx.translate(x, y)
      ctx.scale(1.12, 1.12)
      ctx.translate(-x, -y)
    }
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#FFCB2E'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 9, y)
    ctx.lineTo(x + 9, y)
    ctx.moveTo(x, y - 9)
    ctx.lineTo(x, y + 9)
    ctx.lineWidth = 1.25
    ctx.strokeStyle = '#FFCB2E'
    ctx.stroke()

    const layout = pointMarkerLayout(imagePoint)
    const discX = layout.discX
    const discY = layout.discY
    const discR = layout.discR
    ctx.beginPath()
    ctx.moveTo(layout.stemX, layout.stemY)
    ctx.lineTo(discX, discY)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(layout.stemX, layout.stemY)
    ctx.lineTo(discX, discY)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#FFCB2E'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(discX, discY, discR, 0, Math.PI * 2)
    ctx.fillStyle = '#FFCB2E'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.stroke()
    ctx.fillStyle = '#000'
    ctx.font = '800 22px "Atkinson Hyperlegible Next", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(numeral), discX, discY + 1)
    ctx.restore()
  }

  function pointMarkerLayout(imagePoint) {
    const local = imageToLocal(imagePoint.x, imagePoint.y)
    const ringR = 7
    const discR = 17
    let discX = local.x - 28
    let discY = local.y - 36
    if (discX < discR + 4) discX = local.x + 28
    if (discY < discR + 4) discY = local.y + 36
    const stemDx = discX - local.x
    const stemDy = discY - local.y
    const stemLen = Math.hypot(stemDx, stemDy) || 1
    return {
      x: local.x,
      y: local.y,
      discX,
      discY,
      discR,
      stemX: local.x + stemDx / stemLen * ringR,
      stemY: local.y + stemDy / stemLen * ringR,
    }
  }

  function liveInches() {
    if (!homography || !points.a || !points.b) return null
    const mappedA = applyHomography(homography, points.a.x, points.a.y)
    const mappedB = applyHomography(homography, points.b.x, points.b.y)
    if (!mappedA || !mappedB) return null
    const sep = sheetAxisSeparationMm(mappedA, mappedB)
    if (!sep || !Number.isFinite(sep.widthMm)) return null
    return inchesFromMm(sep.widthMm)
  }

  function drawDimensionLine(ctx) {
    if (!points.a || !points.b) return
    const pa = imageToLocal(points.a.x, points.a.y)
    const pb = imageToLocal(points.b.x, points.b.y)
    const dx = pb.x - pa.x
    const dy = pb.y - pa.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const px = -uy
    const py = ux
    const tick = 10
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.lineWidth = 3
    ctx.strokeStyle = '#FFCB2E'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pa.x + px * tick, pa.y + py * tick)
    ctx.lineTo(pa.x - px * tick, pa.y - py * tick)
    ctx.moveTo(pb.x + px * tick, pb.y + py * tick)
    ctx.lineTo(pb.x - px * tick, pb.y - py * tick)
    ctx.lineWidth = 3
    ctx.strokeStyle = '#FFCB2E'
    ctx.stroke()

    const inches = liveInches()
    if (inches != null) {
      const label = formatTapeInches(inches)
      const mx = (pa.x + pb.x) / 2
      const my = (pa.y + pb.y) / 2
      let angle = Math.atan2(dy, dx)
      if (angle > Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      ctx.translate(mx, my)
      ctx.rotate(angle)
      ctx.font = '800 16px "Atkinson Hyperlegible Next", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const width = Math.max(52, ctx.measureText(label).width + 18)
      const height = 26
      roundRectPath(ctx, -width / 2, -height / 2 - 16, width, height, 8)
      ctx.fillStyle = '#FFCB2E'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.stroke()
      ctx.fillStyle = '#16324F'
      ctx.fillText(label, 0, -16)
    }
    ctx.restore()
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
    ctx.closePath()
  }

  function drawMarks() {
    const canvas = els.marks
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (phase === 'live' || uiStep < 3) return

    const flashing = performance.now() < sheetFlashUntil
    const showHandles = sheetHandlesVisible && (phase === 'adjust-card' || phase === 'adjust-card-b')
    if (cardCorners && cardCorners.length === 4) {
      const stroke = flashing ? '#1F8A5B' : 'rgba(255, 203, 46, 0.95)'
      const fill = flashing ? 'rgba(31, 138, 91, 0.22)' : 'rgba(255, 203, 46, 0.08)'
      drawQuad(ctx, cardCorners, stroke, fill, showHandles, flashing ? 5 : 2)
    }

    if (points.a && points.b) drawDimensionLine(ctx)
    if (points.a) drawPointMarker(ctx, points.a, 1, 'a')
    if (points.b) drawPointMarker(ctx, points.b, 2, 'b')

    if (loupePoint) {
      const guide = imageToLocal(loupePoint.x, loupePoint.y)
      const guideX = Math.round(guide.x) + 0.5
      ctx.beginPath()
      ctx.moveTo(guideX, 0)
      ctx.lineTo(guideX, canvas.height)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.stroke()
      drawLoupe(ctx, loupePoint.x, loupePoint.y, loupePoint.localX, loupePoint.localY)
    }

    const popping = (pointPopUntil.a > performance.now()) || (pointPopUntil.b > performance.now())
    if ((flashing || popping) && !sheetFlashRaf) {
      sheetFlashRaf = requestAnimationFrame(() => {
        sheetFlashRaf = 0
        drawMarks()
      })
    }
  }

  function clearResultText() {
    if (els.resultInches) els.resultInches.textContent = ''
    if (els.resultExactIn) els.resultExactIn.textContent = ''
    if (els.resultExactCm) els.resultExactCm.textContent = ''
    if (els.resultScale) els.resultScale.textContent = ''
    if (els.resultWarningText) els.resultWarningText.textContent = ''
    if (els.resultWarning) els.resultWarning.setAttribute('hidden', '')
    if (els.resultBlock) els.resultBlock.setAttribute('hidden', '')
  }

  function warningLines(reading) {
    const lines = []
    if (reading.warningDisagree) lines.push(DISAGREE_WARNING)
    if (reading.warningAngle) lines.push(FLUSH_WARNING)
    if (reading.warningAxis) lines.push(AXIS_MISALIGN_WARNING)
    if (reading.warningScale) lines.push(SCALE_WARNING)
    if (reading.warningFlat) lines.push(TEMPLATE_FLAT_WARNING)
    if (reading.warningPrintScale) lines.push(PRINT_SCALE_UNVERIFIED_WARNING)
    return lines
  }

  function printScaleMeta() {
    if (!readingUsesTemplate) return ''
    if (templatePrintSource === 'none' || templatePrintStatus === 'unverified' || !(templatePrintScaleValue > 0)) {
      return 'print unverified'
    }
    if (templatePrintRemembered || templatePrintSource === 'paper-remembered') {
      return `print ×${templatePrintScaleValue.toFixed(3)} (remembered)`
    }
    return `print ×${templatePrintScaleValue.toFixed(2)} (${templatePrintSource})`
  }

  function templateFields() {
    if (!readingUsesTemplate) {
      return {
        printScale: null,
        printScaleSource: 'none',
        markersFound: null,
        markerRmsMm: null,
        warningFlat: false,
        warningPrintScale: false,
      }
    }
    const rms = templateMeta && templateMeta.markerRmsMm
    return {
      printScale: templatePrintSource === 'none' ? 'unverified' : templatePrintScaleValue,
      printScaleSource: templatePrintSource,
      markersFound: templateMeta ? templateMeta.markersFound : null,
      markerRmsMm: rms,
      warningFlat: rms != null && rms > MARKER_RMS_WARN_MM,
      warningPrintScale: templatePrintSource === 'none',
    }
  }

  function scaleSourceLine(reading) {
    const source = reading.printScaleSource
    if (source === 'bar') {
      const line = Number.isFinite(templateBarIn) ? templateBarIn : TEMPLATE_LETTER_V1.barIn
      return `Scaled from the printed sheet, line ${line.toFixed(2)} in`
    }
    if (source === 'paper' || source === 'paper-remembered') {
      return 'Scaled from the printed sheet\'s paper edge'
    }
    if (reading.autoMarkers === 'y' || (reading.reference && String(reading.reference).indexOf('template') === 0)) {
      return 'Scaled from the printed sheet, line not checked'
    }
    return 'Scaled from US Letter paper'
  }

  function renderResult(reading) {
    if (els.resultBlock) els.resultBlock.removeAttribute('hidden')
    if (els.resultInches) els.resultInches.textContent = formatTapeInches(reading.inches)
    if (els.resultExactIn) els.resultExactIn.textContent = `${reading.inches.toFixed(2)} in`
    if (els.resultExactCm) els.resultExactCm.textContent = `${reading.cm.toFixed(1)} cm`
    if (els.resultScale) els.resultScale.textContent = scaleSourceLine(reading)
    const lines = warningLines(reading)
    if (!els.resultWarning || !els.resultWarningText) return
    if (lines.length === 0) {
      els.resultWarningText.textContent = ''
      els.resultWarning.setAttribute('hidden', '')
      els.resultWarning.classList.remove('is-loud')
      return
    }
    els.resultWarningText.textContent = lines.join(' ')
    els.resultWarning.removeAttribute('hidden')
    els.resultWarning.classList.toggle('is-loud', !!reading.warningPrintScale)
  }

  function scaleUnreliable(ratio) {
    return ratio != null && (ratio > SCALE_RATIO_WARN || ratio < 1 / SCALE_RATIO_WARN)
  }

  function showReading(reading) {
    currentReading = reading
    renderResult(reading)
    phase = 'result'
    instructionHoldUntil = 0
    setPrimaryButton()
    renderInstruction()
    drawMarks()
    syncChrome()
  }

  // Long/short, so Letter stays near 1.29 whichever edge is TL→TR.
  function recordedAspect(aspect) {
    if (!aspect || !(aspect.ratio > 0) || !Number.isFinite(aspect.ratio)) {
      return {aspectRatioEst: null, focalSource: 'none', text: 'aspect none'}
    }
    const est = aspect.ratio >= 1 ? aspect.ratio : 1 / aspect.ratio
    const source = aspect.focalSource || 'none'
    return {
      aspectRatioEst: est,
      focalSource: source,
      text: `aspect ${est.toFixed(2)} ${source}`,
    }
  }

  function readingAspectFields() {
    const primary = recordedAspect(readingAspect)
    const second = recordedAspect(readingAspectB)
    let text = primary.text
    if (readingAspectB && second.aspectRatioEst != null && primary.aspectRatioEst != null) {
      const source = primary.focalSource === second.focalSource
        ? primary.focalSource
        : `${primary.focalSource}/${second.focalSource}`
      text = `aspect ${primary.aspectRatioEst.toFixed(2)}/${second.aspectRatioEst.toFixed(2)} ${source}`
    } else if (primary.aspectRatioEst == null && second.aspectRatioEst != null) {
      return {
        aspectRatioEst: second.aspectRatioEst,
        focalSource: second.focalSource,
        text: second.text,
        autoMarkers: readingAutoMarkers === 'y' ? 'y' : 'n',
      }
    }
    return {
      aspectRatioEst: primary.aspectRatioEst,
      focalSource: primary.focalSource,
      text: text,
      autoMarkers: readingAutoMarkers === 'y' ? 'y' : 'n',
    }
  }

  function placedSpec(usesTemplate) {
    if (usesTemplate) return templateReference(templatePrintScaleValue)
    if (referenceKind === 'template') return LETTER_REF
    return currentReference()
  }

  function armReading(usesTemplate) {
    readingUsesTemplate = !!usesTemplate
    readingAutoMarkers = usesTemplate ? 'y' : 'n'
    readingSpec = placedSpec(usesTemplate)
  }

  function baseReading(extra) {
    const spec = readingSpec || currentReference()
    const reading = {
      mode,
      layout: twoRefLayout() ? '2refs' : '1ref',
      reference: referenceToken(spec),
      autoMarkers: readingAutoMarkers === 'y' ? 'y' : 'n',
      imageW: captureWidth,
      imageH: captureHeight,
      beta: captureBeta,
      gamma: captureGamma,
    }
    const keys = Object.keys(extra)
    for (let i = 0; i < keys.length; i++) reading[keys[i]] = extra[keys[i]]
    return reading
  }

  function finishMeasurement() {
    if (!homography || !points.a || !points.b) return
    const mappedA = applyHomography(homography, points.a.x, points.a.y)
    const mappedB = applyHomography(homography, points.b.x, points.b.y)
    if (!mappedA || !mappedB) {
      showTemporaryInstruction(homographyFailInstruction(), MESSAGE_HOLD_MS)
      return
    }
    const sep = sheetAxisSeparationMm(mappedA, mappedB)
    if (!sep || !Number.isFinite(sep.widthMm)) {
      showTemporaryInstruction(homographyFailInstruction(), MESSAGE_HOLD_MS)
      return
    }
    const center = centroidOf(cardCorners)
    const centerScale = localScaleMmPerPx(homography, center.x, center.y)
    const ratioOf = (p) => {
      const scale = localScaleMmPerPx(homography, p.x, p.y)
      if (scale == null || !(centerScale > 0)) return null
      return scale / centerScale
    }
    const scaleRatioA = ratioOf(points.a)
    const scaleRatioB = ratioOf(points.b)
    const inches = inchesFromMm(sep.widthMm)
    const rawIn = inchesFromMm(sep.chordMm)
    const noun = referenceNoun(false)
    const angle = sep.axisAngleDeg
    const extra = templateFields()
    const printBit = printScaleMeta()
    const printClause = printBit ? ` · ${printBit}` : ''
    const aspectInfo = readingAspectFields()
    const reading = baseReading({
      mm: sep.widthMm,
      inches,
      cm: sep.widthMm / 10,
      cardLongPx,
      detect: detectIsManual() ? 'manual' : detectKind,
      detectStrategy: detectStrategy || 'manual',
      linesAngleDeg: null,
      linesSpreadMm: null,
      rawPointIn: rawIn,
      axisAngleDeg: angle,
      orientA: null,
      orientB: null,
      scaleRatioA,
      scaleRatioB,
      fitRmsMm: null,
      scaleDrift: null,
      refAPx: null,
      refBPx: null,
      warningDisagree: false,
      warningAngle: false,
      warningAxis: angle != null && angle > AXIS_ANGLE_WARN_DEG,
      warningScale: scaleUnreliable(scaleRatioA) || scaleUnreliable(scaleRatioB),
      printScale: extra.printScale,
      printScaleSource: extra.printScaleSource,
      markersFound: extra.markersFound,
      markerRmsMm: extra.markerRmsMm,
      warningFlat: extra.warningFlat,
      warningPrintScale: extra.warningPrintScale,
      aspectRatioEst: aspectInfo.aspectRatioEst,
      focalSource: aspectInfo.focalSource,
      autoMarkers: aspectInfo.autoMarkers,
      meta: `⊥ width · raw ${rawIn.toFixed(1)} in · axis ${formatAngle(angle)} · ${noun} ${Math.round(cardLongPx)} px · scale ${formatRatio(scaleRatioA)}/${formatRatio(scaleRatioB)} · ${aspectInfo.text}${printClause} · ${captureWidth}×${captureHeight} · tilt β ${formatAngle(captureBeta)} γ ${formatAngle(captureGamma)}`,
    })
    showReading(reading)
  }

  function formatRatio(value) {
    if (value == null || !Number.isFinite(value)) return '—'
    return value.toFixed(2)
  }

  function finishTwoRef(measured, detect, strategy) {
    const inches = inchesFromMm(measured.widthMm)
    const angle = measured.linesAngleDeg
    const drift = measured.scaleDrift
    const driftWarn = scaleDriftWarn(measured.refAPx, measured.refBPx)
    const disagree = measured.fitRmsMm > FIT_RMS_WARN_MM || Math.abs(drift - 1) > driftWarn
    const extra = templateFields()
    const printBit = printScaleMeta()
    const printClause = printBit ? ` · ${printBit}` : ''
    const aspectInfo = readingAspectFields()
    const reading = baseReading({
      mm: measured.widthMm,
      inches,
      cm: measured.widthMm / 10,
      cardLongPx: measured.refAPx,
      detect,
      detectStrategy: strategy,
      linesAngleDeg: angle,
      linesSpreadMm: measured.spreadMm,
      rawPointIn: null,
      axisAngleDeg: null,
      orientA: measured.orientA,
      orientB: measured.orientB,
      scaleRatioA: null,
      scaleRatioB: null,
      fitRmsMm: measured.fitRmsMm,
      scaleDrift: drift,
      refAPx: measured.refAPx,
      refBPx: measured.refBPx,
      warningDisagree: disagree,
      warningAngle: angle != null && angle > LINES_ANGLE_WARN_DEG,
      warningAxis: false,
      warningScale: false,
      printScale: extra.printScale,
      printScaleSource: extra.printScaleSource,
      markersFound: extra.markersFound,
      markerRmsMm: extra.markerRmsMm,
      warningFlat: extra.warningFlat,
      warningPrintScale: extra.warningPrintScale,
      aspectRatioEst: aspectInfo.aspectRatioEst,
      focalSource: aspectInfo.focalSource,
      autoMarkers: aspectInfo.autoMarkers,
      meta: `rms ${measured.fitRmsMm.toFixed(1)} mm · drift ${drift.toFixed(2)} · A ${measured.orientA} ${Math.round(measured.refAPx)} px · B ${measured.orientB} ${Math.round(measured.refBPx)} px · ∠ ${formatAngle(angle)} · ${aspectInfo.text}${printClause} · ${captureWidth}×${captureHeight} · tilt β ${formatAngle(captureBeta)} γ ${formatAngle(captureGamma)}`,
    })
    showReading(reading)
    const smallA = measured.refAPx < SMALL_CARD_PX
    const smallB = measured.refBPx < SMALL_CARD_PX
    if (smallA || smallB) {
      showTemporaryInstruction(
        `${referenceNoun(true)} is small in the image (A ${Math.round(measured.refAPx)} px, B ${Math.round(measured.refBPx)} px). Retake closer for better accuracy.`,
        MESSAGE_HOLD_MS
      )
    }
  }

  function detectIsManual() {
    if (detectKind === 'manual') return true
    if (!cardCorners || !originalCorners) return false
    for (let i = 0; i < 4; i++) {
      if (hypot2(cardCorners[i].x, cardCorners[i].y, originalCorners[i].x, originalCorners[i].y) > MANUAL_DRAG_PX) {
        return true
      }
    }
    return false
  }

  function clipRoi(tapX, tapY, imgW, imgH, fraction) {
    const shortSide = Math.min(imgW, imgH)
    // 40% of the short side: wide enough to hold a foreshortened card or sheet.
    let side = (fraction > 0 ? fraction : 0.40) * shortSide
    if (side < 32) side = Math.min(shortSide, 32)
    if (side > imgW) side = imgW
    if (side > imgH) side = imgH
    let x = tapX - side / 2
    let y = tapY - side / 2
    if (x < 0) x = 0
    if (y < 0) y = 0
    if (x + side > imgW) x = imgW - side
    if (y + side > imgH) y = imgH - side
    const roiX = Math.max(0, Math.floor(x))
    const roiY = Math.max(0, Math.floor(y))
    let roiW = Math.max(1, Math.floor(side))
    let roiH = Math.max(1, Math.floor(side))
    if (roiX + roiW > imgW) roiW = Math.max(1, imgW - roiX)
    if (roiY + roiH > imgH) roiH = Math.max(1, imgH - roiY)
    return {x: roiX, y: roiY, width: roiW, height: roiH}
  }

  function clipBoxAround(points, imgW, imgH, padFrac) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < points.length; i++) {
      if (points[i].x < minX) minX = points[i].x
      if (points[i].y < minY) minY = points[i].y
      if (points[i].x > maxX) maxX = points[i].x
      if (points[i].y > maxY) maxY = points[i].y
    }
    const padX = (maxX - minX) * (padFrac || 0.25) + 24
    const padY = (maxY - minY) * (padFrac || 0.25) + 24
    let x = Math.floor(minX - padX)
    let y = Math.floor(minY - padY)
    let w = Math.ceil(maxX - minX + 2 * padX)
    let h = Math.ceil(maxY - minY + 2 * padY)
    if (x < 0) x = 0
    if (y < 0) y = 0
    if (x + w > imgW) w = imgW - x
    if (y + h > imgH) h = imgH - y
    if (w < 32) w = Math.min(imgW, 32)
    if (h < 32) h = Math.min(imgH, 32)
    return {x, y, width: Math.max(1, w), height: Math.max(1, h)}
  }

  function readQuadPoints(approx) {
    const total = approx.rows * approx.cols
    if (total !== 4) return null
    const pts = []
    if (approx.data32S && approx.data32S.length >= 8) {
      for (let i = 0; i < 4; i++) pts.push(point(approx.data32S[i * 2], approx.data32S[i * 2 + 1]))
      return pts
    }
    if (approx.data32F && approx.data32F.length >= 8) {
      for (let i = 0; i < 4; i++) pts.push(point(approx.data32F[i * 2], approx.data32F[i * 2 + 1]))
      return pts
    }
    return null
  }

  function collectBandPixels(canny, p0, p1) {
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy)
    if (len < 8) return []
    const ux = dx / len
    const uy = dy / len
    const q0x = p0.x + ux * len * 0.08
    const q0y = p0.y + uy * len * 0.08
    const q1x = p0.x + ux * len * 0.92
    const q1y = p0.y + uy * len * 0.92
    const minX = Math.max(0, Math.floor(Math.min(q0x, q1x) - 4))
    const maxX = Math.min(canny.cols - 1, Math.ceil(Math.max(q0x, q1x) + 4))
    const minY = Math.max(0, Math.floor(Math.min(q0y, q1y) - 4))
    const maxY = Math.min(canny.rows - 1, Math.ceil(Math.max(q0y, q1y) + 4))
    const data = canny.data
    const width = canny.cols
    const pts = []
    const segDx = q1x - q0x
    const segDy = q1y - q0y
    const segLen2 = segDx * segDx + segDy * segDy || 1
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (data[y * width + x] === 0) continue
        let t = ((x - q0x) * segDx + (y - q0y) * segDy) / segLen2
        if (t < 0) t = 0
        if (t > 1) t = 1
        const px = q0x + t * segDx
        const py = q0y + t * segDy
        if (Math.hypot(x - px, y - py) <= 4) pts.push(x, y)
      }
    }
    return pts
  }

  function fitEdgeLine(canny, p0, p1) {
    const xy = collectBandPixels(canny, p0, p1)
    const count = xy.length / 2
    if (count < 8) return lineFromSegment(p0, p1)
    let mat = null
    let line = null
    try {
      mat = cv.matFromArray(count, 1, cv.CV_32SC2, xy)
      line = new cv.Mat()
      cv.fitLine(mat, line, cv.DIST_L2, 0, 0.01, 0.01)
      const vx = line.data32F[0]
      const vy = line.data32F[1]
      const x0 = line.data32F[2]
      const y0 = line.data32F[3]
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) return lineFromSegment(p0, p1)
      return {vx, vy, x0, y0}
    } finally {
      releaseMat(mat)
      releaseMat(line)
    }
  }

  function refineCorners(canny, quad) {
    const lines = []
    for (let i = 0; i < 4; i++) {
      lines.push(fitEdgeLine(canny, quad[i], quad[(i + 1) % 4]))
    }
    const refined = []
    for (let i = 0; i < 4; i++) {
      const prev = lines[(i + 3) % 4]
      const hit = intersectLines(prev, lines[i])
      refined.push(hit || copyPoint(quad[i]))
    }
    return orderCorners(refined)
  }

  function releaseMat(mat) {
    if (!mat || typeof mat.delete !== 'function') return
    try {
      mat.delete()
    } catch (err) {
      // Already released. One bad Mat must not leak the rest.
    }
  }

  function releaseAll(mats) {
    for (let i = mats.length - 1; i >= 0; i--) releaseMat(mats[i])
  }

  function readContourPoints(contour) {
    const pts = []
    const data = contour && contour.data32S
    if (data && data.length >= 2) {
      for (let i = 0; i + 1 < data.length; i += 2) pts.push(point(data[i], data[i + 1]))
      if (pts.length > 0) return pts
    }
    const rows = contour && contour.rows ? contour.rows : 0
    if (contour && typeof contour.intPtr === 'function') {
      for (let i = 0; i < rows; i++) {
        const p = contour.intPtr(i, 0)
        if (!p || p.length < 2) continue
        pts.push(point(p[0], p[1]))
      }
    }
    return pts
  }

  function contourStraightness(contour, quad) {
    const pts = readContourPoints(contour)
    if (pts.length === 0) return 0.5
    let gapSum = 0
    for (let i = 0; i < pts.length; i++) {
      let best = Infinity
      for (let e = 0; e < 4; e++) {
        const dist = distanceToSegment(pts[i], quad[e], quad[(e + 1) % 4])
        if (dist < best) best = dist
      }
      gapSum += best
    }
    let edgeSum = 0
    for (let e = 0; e < 4; e++) edgeSum += edgeLength(quad[e], quad[(e + 1) % 4])
    return edgeStraightnessScore(gapSum / pts.length, edgeSum / 4)
  }

  let quadSearch = null

  // Approx at 2%, then 3% and 4% when that is not a convex quad. Tap, angles,
  // and the wide ratio band are checked here; aspect is scored later.
  function candidateFromContour(contour, tapInRoi, roiArea, strategy, originX, originY) {
    const search = quadSearch || {}
    const area = cv.contourArea(contour)
    const minArea = (search.minAreaFrac != null ? search.minAreaFrac : 0.003) * roiArea
    const maxArea = (search.maxAreaFrac != null ? search.maxAreaFrac : 0.60) * roiArea
    if (!(area >= minArea && area <= maxArea)) return null
    const peri = cv.arcLength(contour, true)
    if (!(peri > 1)) return null
    const epsilons = [0.02, 0.03, 0.04]
    const spec = search.spec || currentReference()
    for (let e = 0; e < epsilons.length; e++) {
      const approx = new cv.Mat()
      try {
        cv.approxPolyDP(contour, approx, epsilons[e] * peri, true)
        const quad = readQuadPoints(approx)
        if (!quad || !cv.isContourConvex(approx)) continue
        const tapPoint = new cv.Point(tapInRoi.x, tapInRoi.y)
        if (cv.pointPolygonTest(approx, tapPoint, false) < 0) continue
        if (!quadAnglesOk(quad)) continue
        const ratio = edgePairRatio(quad)
        if (!ratioInAcceptBand(ratio, spec.ratio)) continue
        const imageQuad = []
        for (let i = 0; i < 4; i++) imageQuad.push(point(quad[i].x + originX, quad[i].y + originY))
        if (search.mustContain && !convexQuadContainsAll(imageQuad, search.mustContain)) continue
        if (search.accept && !search.accept(imageQuad)) continue
        return {
          quad: imageQuad,
          area,
          ratio,
          straightness: contourStraightness(contour, quad),
          strategy,
        }
      } finally {
        releaseMat(approx)
      }
    }
    return null
  }

  function quadsFromContours(contours, tapInRoi, roiArea, strategy, originX, originY) {
    const found = []
    const count = contours.size()
    for (let i = 0; i < count; i++) {
      let contour = null
      try {
        contour = contours.get(i)
        const cand = candidateFromContour(contour, tapInRoi, roiArea, strategy, originX, originY)
        if (cand) found.push(cand)
      } catch (err) {
        // One bad contour must not drop the rest of this strategy.
      } finally {
        releaseMat(contour)
      }
    }
    return found
  }

  function edgeCandidates(source, tapInRoi, roiArea, low, high, strategy, originX, originY) {
    const mats = []
    const track = (mat) => {
      mats.push(mat)
      return mat
    }
    try {
      const edges = track(new cv.Mat())
      const dilated = track(new cv.Mat())
      const contours = track(new cv.MatVector())
      const hierarchy = track(new cv.Mat())
      cv.Canny(source, edges, low, high)
      const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U))
      cv.dilate(edges, dilated, kernel)
      cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
      return quadsFromContours(contours, tapInRoi, roiArea, strategy, originX, originY)
    } finally {
      releaseAll(mats)
    }
  }

  function floodFillFlags() {
    const fixed = typeof cv.FLOODFILL_FIXED_RANGE === 'number' ? cv.FLOODFILL_FIXED_RANGE : 65536
    const maskOnly = typeof cv.FLOODFILL_MASK_ONLY === 'number' ? cv.FLOODFILL_MASK_ONLY : 131072
    // Low 8 bits are connectivity. Leaving them 0 is not a 4- or 8-connected fill.
    return 4 | fixed | maskOnly
  }

  function zeroMask(rows, cols) {
    if (cv.Mat && typeof cv.Mat.zeros === 'function') return cv.Mat.zeros(rows, cols, cv.CV_8UC1)
    const mask = new cv.Mat(rows, cols, cv.CV_8UC1)
    mask.setTo(new cv.Scalar(0))
    return mask
  }

  function floodCandidates(source, tapInRoi, roiArea, diff, strategy, originX, originY) {
    const mats = []
    const track = (mat) => {
      mats.push(mat)
      return mat
    }
    try {
      const work = track(source.clone())
      const mask = track(zeroMask(source.rows + 2, source.cols + 2))
      const closed = track(new cv.Mat())
      const contours = track(new cv.MatVector())
      const hierarchy = track(new cv.Mat())
      let sx = Math.round(tapInRoi.x)
      let sy = Math.round(tapInRoi.y)
      if (sx < 0) sx = 0
      if (sy < 0) sy = 0
      if (sx > source.cols - 1) sx = source.cols - 1
      if (sy > source.rows - 1) sy = source.rows - 1
      const seed = new cv.Point(sx, sy)
      const delta = new cv.Scalar(diff, diff, diff, diff)
      const fill = new cv.Scalar(255, 255, 255, 255)
      const rect = new cv.Rect(0, 0, 0, 0)
      const flags = floodFillFlags()
      try {
        cv.floodFill(work, mask, seed, fill, rect, delta, delta, flags)
      } catch (err) {
        // Some OpenCV.js builds omit the rect out-param.
        cv.floodFill(work, mask, seed, fill, delta, delta, flags)
      }
      const inner = track(mask.roi(new cv.Rect(1, 1, source.cols, source.rows)))
      const kernel = track(cv.Mat.ones(5, 5, cv.CV_8U))
      const closeOp = typeof cv.MORPH_CLOSE === 'number' ? cv.MORPH_CLOSE : 3
      cv.morphologyEx(inner, closed, closeOp, kernel)
      cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      return quadsFromContours(contours, tapInRoi, roiArea, strategy, originX, originY)
    } finally {
      releaseAll(mats)
    }
  }

  function thresholdCandidates(source, tapInRoi, roiArea, inverse, strategy, originX, originY) {
    const mats = []
    const track = (mat) => {
      mats.push(mat)
      return mat
    }
    try {
      const binary = track(new cv.Mat())
      const contours = track(new cv.MatVector())
      const hierarchy = track(new cv.Mat())
      const mode = inverse
        ? (cv.THRESH_BINARY_INV | cv.THRESH_OTSU)
        : (cv.THRESH_BINARY | cv.THRESH_OTSU)
      cv.threshold(source, binary, 0, 255, mode)
      cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
      return quadsFromContours(contours, tapInRoi, roiArea, strategy, originX, originY)
    } finally {
      releaseAll(mats)
    }
  }

  function detectCard(tapX, tapY, options) {
    if (typeof cv === 'undefined' || !cv || typeof cv.imread !== 'function') {
      return {corners: null, strategy: null, tried: []}
    }
    const search = options || {}
    quadSearch = search
    const mats = []
    const track = (mat) => {
      mats.push(mat)
      return mat
    }
    try {
      const src = track(cv.imread(captureCanvas))
      const gray = track(new cv.Mat())
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      const box = search.roiBox || clipRoi(tapX, tapY, src.cols, src.rows, search.roiFraction)
      const grayRoi = track(gray.roi(new cv.Rect(box.x, box.y, box.width, box.height)))
      // Blur is shared by the edge and flood searches. If it throws, those
      // strategies still run on the raw ROI instead of aborting detection.
      let blurRoi = grayRoi
      try {
        const blurred = track(new cv.Mat())
        cv.GaussianBlur(grayRoi, blurred, new cv.Size(5, 5), 0)
        blurRoi = blurred
      } catch (err) {
        logDiagnostic(`detect: blur failed (${errorMessage(err)})`)
      }
      let tapRoiX = tapX - box.x
      let tapRoiY = tapY - box.y
      if (tapRoiX < 0) tapRoiX = 0
      if (tapRoiY < 0) tapRoiY = 0
      if (tapRoiX > box.width - 1) tapRoiX = box.width - 1
      if (tapRoiY > box.height - 1) tapRoiY = box.height - 1
      const tapInRoi = {x: tapRoiX, y: tapRoiY}
      const roiArea = box.width * box.height
      const originX = box.x
      const originY = box.y
      const candidates = []
      const tried = []
      const jobs = [
        ['edges30', () => edgeCandidates(blurRoi, tapInRoi, roiArea, 30, 90, 'edges30', originX, originY)],
        ['edges50', () => edgeCandidates(blurRoi, tapInRoi, roiArea, 50, 150, 'edges50', originX, originY)],
        ['edges80', () => edgeCandidates(blurRoi, tapInRoi, roiArea, 80, 200, 'edges80', originX, originY)],
        ['flood18', () => floodCandidates(blurRoi, tapInRoi, roiArea, 18, 'flood18', originX, originY)],
        ['flood30', () => floodCandidates(blurRoi, tapInRoi, roiArea, 30, 'flood30', originX, originY)],
        ['otsu', () => thresholdCandidates(grayRoi, tapInRoi, roiArea, false, 'otsu', originX, originY)],
        ['otsu-inv', () => thresholdCandidates(grayRoi, tapInRoi, roiArea, true, 'otsu-inv', originX, originY)],
      ]
      for (let i = 0; i < jobs.length; i++) {
        const name = jobs[i][0]
        tried.push(name)
        try {
          const found = jobs[i][1]()
          logDiagnostic(`detect: ${name} → ${found.length} candidates`)
          for (let c = 0; c < found.length; c++) candidates.push(found[c])
        } catch (err) {
          logDiagnostic(`detect: ${name} → failed (${errorMessage(err)})`)
        }
      }
      if (candidates.length === 0) return {corners: null, strategy: null, tried}
      let maxArea = 0
      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].area > maxArea) maxArea = candidates[i].area
      }
      const spec = search.spec || currentReference()
      let best = candidates[0]
      let bestScore = -Infinity
      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i]
        const score = scoreQuadCandidate(cand.ratio, spec.ratio, cand.straightness, cand.area, maxArea)
        if (score > bestScore) {
          bestScore = score
          best = cand
        }
      }
      const ordered = orderCorners(best.quad)
      let refined = ordered
      try {
        const fullBlur = track(new cv.Mat())
        const fullCanny = track(new cv.Mat())
        cv.GaussianBlur(gray, fullBlur, new cv.Size(5, 5), 0)
        cv.Canny(fullBlur, fullCanny, 50, 150)
        refined = refineCorners(fullCanny, ordered)
      } catch (err) {
        logDiagnostic(`refine failed: ${errorMessage(err)}`)
        refined = ordered
      }
      return {corners: refined, strategy: best.strategy, tried}
    } finally {
      quadSearch = null
      releaseAll(mats)
    }
  }

  function arucoApi() {
    if (window.JSARUCO && window.JSARUCO.AR) return window.JSARUCO.AR
    if (typeof AR !== 'undefined') return AR
    return null
  }

  function fullResCanny(mats, track) {
    const src = track(cv.imread(captureCanvas))
    const gray = track(new cv.Mat())
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    const blurred = track(new cv.Mat())
    const canny = track(new cv.Mat())
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, canny, 50, 150)
    return canny
  }

  function detectPaperOutline(markerCentroids, markerH) {
    if (!markerCentroids || markerCentroids.length < 2 || !markerH) return null
    const seed = centroidOf(markerCentroids)
    logDiagnostic(`paper: search at centroid (${Math.round(seed.x)}, ${Math.round(seed.y)})`)
    let found = null
    try {
      found = detectCard(seed.x, seed.y, {
        spec: LETTER_REF,
        roiBox: clipBoxAround(markerCentroids, captureWidth, captureHeight, 0.35),
        minAreaFrac: 0.02,
        maxAreaFrac: 0.98,
        mustContain: markerCentroids,
        accept: (quad) => {
          const size = paperMappedSizeMm(quad, markerH)
          return !!(size && paperSizePlausible(size.longMm, size.shortMm))
        },
      })
    } catch (err) {
      logDiagnostic(`paper: search threw (${errorMessage(err)})`)
      return null
    }
    if (!found || !found.corners) {
      logDiagnostic('paper: no outline in 0.85–1.15 Letter band')
      return null
    }
    const size = paperMappedSizeMm(found.corners, markerH)
    if (!size) {
      logDiagnostic('paper: mapped size failed')
      return null
    }
    logDiagnostic(`paper: ${size.longMm.toFixed(1)} × ${size.shortMm.toFixed(1)} mm via ${found.strategy}`)
    return size
  }

  function detectTemplate(tapX, tapY) {
    logDiagnostic(`detectTemplate tap (${Math.round(tapX)}, ${Math.round(tapY)})`)
    const api = arucoApi()
    if (!api || typeof api.Detector !== 'function') {
      logDiagnostic('markers: js-aruco2 AR.Detector missing')
      return {ok: false, reason: 'no-detector'}
    }
    const srcW = captureWidth
    const srcH = captureHeight
    if (!(srcW > 8) || !(srcH > 8)) {
      logDiagnostic('markers: capture is empty')
      return {ok: false, reason: 'empty'}
    }
    const longSide = Math.max(srcW, srcH)
    const scale = longSide > TEMPLATE_DETECT_MAX_SIDE ? TEMPLATE_DETECT_MAX_SIDE / longSide : 1
    const dw = Math.max(1, Math.round(srcW * scale))
    const dh = Math.max(1, Math.round(srcH * scale))
    logDiagnostic(`markers: downscale ${srcW}×${srcH} → ${dw}×${dh}`)
    let imageData = null
    try {
      const tiny = document.createElement('canvas')
      tiny.width = dw
      tiny.height = dh
      const tctx = tiny.getContext('2d')
      tctx.drawImage(captureCanvas, 0, 0, dw, dh)
      imageData = tctx.getImageData(0, 0, dw, dh)
    } catch (err) {
      logDiagnostic(`markers: getImageData failed (${errorMessage(err)})`)
      return {ok: false, reason: 'imagedata'}
    }
    let raw = []
    try {
      const detector = new api.Detector({dictionaryName: 'ARUCO_MIP_36h12'})
      raw = detector.detect(imageData) || []
    } catch (err) {
      logDiagnostic(`markers: detect threw (${errorMessage(err)})`)
      return {ok: false, reason: 'threw'}
    }
    const allowed = {}
    for (let i = 0; i < TEMPLATE_LETTER_V1.ids.length; i++) allowed[TEMPLATE_LETTER_V1.ids[i]] = true
    const kept = []
    const rawIds = []
    for (let i = 0; i < raw.length; i++) {
      rawIds.push(raw[i].id)
      if (allowed[raw[i].id] && raw[i].corners && raw[i].corners.length === 4) kept.push(raw[i])
    }
    const keptIds = kept.map((m) => m.id)
    logDiagnostic(`markers: found ${kept.length} (ids ${keptIds.join(',') || 'none'}) of ${raw.length} raw (${rawIds.join(',') || 'none'})`)
    if (kept.length < 2) return {ok: false, reason: 'too-few', keptIds}
    const invScale = 1 / scale
    const cornersById = {}
    for (let i = 0; i < kept.length; i++) {
      const pts = []
      for (let c = 0; c < 4; c++) {
        pts.push(point(kept[i].corners[c].x * invScale, kept[i].corners[c].y * invScale))
      }
      cornersById[kept[i].id] = pts
    }
    const mats = []
    const track = (mat) => {
      mats.push(mat)
      return mat
    }
    try {
      if (typeof cv !== 'undefined' && cv && typeof cv.imread === 'function') {
        const canny = fullResCanny(mats, track)
        const ids = Object.keys(cornersById).map(Number)
        for (let i = 0; i < ids.length; i++) {
          try {
            cornersById[ids[i]] = refineCorners(canny, cornersById[ids[i]])
            logDiagnostic(`markers: refined id ${ids[i]}`)
          } catch (err) {
            logDiagnostic(`markers: refine id ${ids[i]} failed (${errorMessage(err)})`)
          }
        }
      } else {
        logDiagnostic('markers: OpenCV missing, skip corner refine')
      }
    } catch (err) {
      logDiagnostic(`markers: canny failed (${errorMessage(err)})`)
    } finally {
      releaseAll(mats)
    }
    const aligned = alignTemplateMarkerCorners(cornersById)
    if (!aligned) {
      logDiagnostic('markers: align failed')
      return {ok: false, reason: 'align', keptIds}
    }
    logDiagnostic(`markers: aligned ${aligned.ids.length} rms ${aligned.markerRmsMm == null ? '—' : aligned.markerRmsMm.toFixed(2)} mm`)
    const built = templateQuadFromAlignedMarkers(aligned)
    if (!built) {
      logDiagnostic('markers: outer quad failed')
      return {ok: false, reason: 'quad', keptIds}
    }
    if (built.synthesized) {
      logDiagnostic(`markers: synthesised outer corners for ids ${built.missingIds.join(',')}`)
    }
    const centroids = []
    for (let i = 0; i < aligned.ids.length; i++) {
      centroids.push(centroidOf(aligned.cornersById[aligned.ids[i]]))
    }
    const paper = detectPaperOutline(centroids, aligned.H)
    readTemplateBarField()
    const paperLong = paper ? paper.longMm : null
    const paperShort = paper ? paper.shortMm : null
    const chosen = templateLineConfirmed
      ? recoverPrintScaleFromBar(templateBarIn)
      : choosePrintScale(null, paperLong, paperShort)
    return {
      ok: true,
      cardCorners: built.cardCorners,
      markersFound: built.markersFound,
      synthesized: built.synthesized,
      markerRmsMm: aligned.markerRmsMm,
      print: chosen,
      keptIds,
    }
  }

  function applyResolvedPrintScale(chosen) {
    templatePrintRemembered = false
    if (chosen && chosen.source === 'bar' && chosen.printScale > 0) {
      templatePrintScaleValue = chosen.printScale
      templatePrintSource = 'bar'
      templatePrintStatus = chosen.printScale
      rememberSessionPrintScale(chosen.printScale, 'bar')
      logDiagnostic(`print_scale ${Number(chosen.printScale).toFixed(4)} source=bar`)
      return
    }
    if (chosen && chosen.source === 'paper' && chosen.printScale > 0) {
      const next = chosen.printScale
      const prev = sessionPrintScale
      if (prev && prev.value > 0 && Math.abs(next - prev.value) / prev.value > PRINT_SCALE_REMEMBER_SHIFT) {
        logDiagnostic(`print_scale ${next.toFixed(4)} source=paper (was ${prev.value.toFixed(4)} ${prev.source})`)
      } else {
        logDiagnostic(`print_scale ${next.toFixed(4)} source=paper`)
      }
      templatePrintScaleValue = next
      templatePrintSource = 'paper'
      templatePrintStatus = next
      rememberSessionPrintScale(next, 'paper')
      return
    }
    if (sessionPrintScale && sessionPrintScale.value > 0) {
      const source = sessionPrintScale.source === 'paper' ? 'paper-remembered' : 'bar'
      templatePrintScaleValue = sessionPrintScale.value
      templatePrintSource = source
      templatePrintStatus = sessionPrintScale.value
      templatePrintRemembered = true
      logDiagnostic(`print_scale: reused ${sessionPrintScale.value.toFixed(4)} (${sessionPrintScale.source})`)
      return
    }
    templatePrintScaleValue = 1
    templatePrintSource = 'none'
    templatePrintStatus = 'unverified'
    logDiagnostic('print_scale unverified source=none')
  }

  function applyTemplateDetection(result) {
    templateMeta = {
      markersFound: result && result.markersFound,
      markerRmsMm: result && result.markerRmsMm,
    }
    if (!result || !result.print) {
      templatePrintRemembered = false
      templatePrintScaleValue = 1
      templatePrintSource = 'none'
      templatePrintStatus = 'unverified'
      return
    }
    applyResolvedPrintScale(result.print)
  }

  function finishPlacedQuad() {
    phase = twoRefLayout() && refACorners ? 'adjust-card-b' : 'adjust-card'
    sheetHandlesVisible = true
    setPrimaryButton()
    renderInstruction()
    drawMarks()
    syncChrome()
  }

  // Plain-paper quad. flashOverride replaces the found/miss line, used when
  // a template picker had no markers and this sheet is plain Letter.
  function placePlainQuad(tapX, tapY, spec, flashOverride) {
    let found = null
    try {
      found = detectCard(tapX, tapY, {spec: spec})
    } catch (err) {
      logDiagnostic(`detect threw: ${errorMessage(err)}`)
      found = null
    }
    const corners = found && found.corners
    if (corners && corners.length === 4) {
      cardCorners = corners
      originalCorners = corners.map(copyPoint)
      detectKind = 'auto'
      detectStrategy = found.strategy || 'manual'
      const longPx = meanLongEdgePx(orderCorners(cardCorners))
      logDiagnostic(`auto-detected via ${detectStrategy}: long edge ${Math.round(longPx)} px`)
      if (!flashOverride) {
        showTemporaryInstruction(
          `${referenceNoun(true)} found — check the corners, then tap ${confirmActionLabel()}`,
          DETECT_MESSAGE_HOLD_MS,
          'ok'
        )
      }
    } else {
      cardCorners = defaultQuadAt(tapX, tapY, captureWidth, captureHeight, spec)
      originalCorners = cardCorners.map(copyPoint)
      detectKind = 'manual'
      detectStrategy = 'manual'
      const tried = found && found.tried && found.tried.length ? found.tried.join(', ') : 'none'
      logDiagnostic(`auto-detect failed (tried: ${tried})`)
      if (!flashOverride) {
        showTemporaryInstruction(
          `${referenceNoun(true)} not found — drag the corners onto its edges`,
          DETECT_MESSAGE_HOLD_MS
        )
      }
    }
    if (flashOverride) showTemporaryInstruction(flashOverride, DETECT_MESSAGE_HOLD_MS)
    finishPlacedQuad()
  }

  function placeCardAtTap(tapX, tapY) {
    if (captureTemplateMissed) {
      pendingUsesTemplate = false
      pendingAutoMarkers = 'n'
      if (!refAUsesTemplate) applyTemplateDetection(null)
      adjustNoun = 'sheet'
      logDiagnostic('markers: capture miss — tap-seeded Letter search')
      placePlainQuad(tapX, tapY, LETTER_REF, null)
      return
    }
    const started = performance.now()
    let markers = null
    try {
      markers = detectTemplate(tapX, tapY)
    } catch (err) {
      logDiagnostic(`detectTemplate threw: ${errorMessage(err)}`)
      markers = null
    }
    logDiagnostic(`markers: detectTemplate ${Math.round(performance.now() - started)} ms`)
    const markerHit = markers && markers.ok && markers.markersFound >= 2
      && markers.cardCorners && markers.cardCorners.length === 4
    if (markerHit) {
      applyTemplateDetection(markers)
      pendingUsesTemplate = true
      pendingAutoMarkers = 'y'
      adjustNoun = 'template'
      cardCorners = markers.cardCorners
      originalCorners = cardCorners.map(copyPoint)
      detectKind = 'auto'
      detectStrategy = `markers${markers.markersFound}`
      const longPx = meanLongEdgePx(orderCorners(cardCorners))
      logDiagnostic(`markers: auto-upgrade from ${referenceKind}`)
      logDiagnostic(`auto-detected template via ${detectStrategy}: long edge ${Math.round(longPx)} px`)
      if (templatePrintSource === 'none' && !printScaleNudgeShown && !templateLineConfirmed) {
        printScaleNudgeShown = true
        showTemporaryInstruction(PRINT_SCALE_NUDGE, DETECT_MESSAGE_HOLD_MS)
      } else {
        showTemporaryInstruction(
          `Printed template detected — check the outer marker corners, then tap ${confirmActionLabel()}`,
          DETECT_MESSAGE_HOLD_MS,
          'ok'
        )
      }
      finishPlacedQuad()
      return
    }
    pendingUsesTemplate = false
    pendingAutoMarkers = 'n'
    // Keep a template scale already recovered for the other reference.
    if (!refAUsesTemplate) applyTemplateDetection(null)
    if (referenceKind === 'template') {
      adjustNoun = 'sheet'
      logDiagnostic('markers: no markers found — treating as plain Letter paper')
      placePlainQuad(tapX, tapY, LETTER_REF, 'No markers found — treating as plain Letter paper')
      return
    }
    adjustNoun = null
    placePlainQuad(tapX, tapY, currentReference(), null)
  }

  function smallReferenceNote(longPx) {
    return `${referenceNoun(true)} is small in the image (${Math.round(longPx)} px). Retake closer for better accuracy.`
  }

  function confirmCard() {
    const which = twoRefLayout() && refACorners ? 'b' : 'a'
    if (!cardCorners || cardCorners.length !== 4) {
      showTemporaryInstruction(tapReferenceInstruction(which), MESSAGE_HOLD_MS)
      return
    }
    const dragged = detectIsManual()
    const usesTemplate = pendingUsesTemplate
    const spec = placedSpec(twoRefLayout() && refACorners ? refAUsesTemplate : usesTemplate)
    const result = homographyPixelsToMm(cardCorners, spec, captureWidth, captureHeight)
    if (!result || !result.H) {
      showTemporaryInstruction(homographyFailInstruction(), MESSAGE_HOLD_MS)
      return
    }
    const kind = dragged ? 'manual' : detectKind
    const strategy = detectStrategy || 'manual'
    const ordered = result.ordered.map(copyPoint)
    const longPx = result.cardLongPx
    logDiagnostic(`${referenceNoun(false)} confirmed: long edge ${Math.round(longPx)} px detect=${kind} strategy=${strategy}`)
    if (twoRefLayout() && !refACorners) {
      refACorners = ordered
      refADetect = kind
      refAStrategy = strategy
      refAUsesTemplate = usesTemplate
      cardCorners = null
      originalCorners = null
      detectKind = 'manual'
      detectStrategy = 'manual'
      homography = null
      const smallNote = longPx < SMALL_CARD_PX ? smallReferenceNote(longPx) : ''
      adjustNoun = null
      phase = 'need-card-b'
      setPrimaryButton()
      if (smallNote) showTemporaryInstruction(smallNote, MESSAGE_HOLD_MS)
      else {
        instructionHoldUntil = 0
        renderInstruction()
      }
      drawMarks()
      return
    }
    if (twoRefLayout()) {
      if (refAUsesTemplate !== usesTemplate) {
        logDiagnostic('markers: refs disagree on markers — fitting with the first reference')
      }
      armReading(refAUsesTemplate)
      refBDetect = kind
      refBStrategy = strategy
      const measured = twoReferenceDestinationMm(
        refACorners,
        ordered,
        readingSpec,
        mode,
        captureWidth,
        captureHeight
      )
      if (!measured) {
        cardCorners = ordered
        phase = 'adjust-card-b'
        showTemporaryInstruction(homographyFailInstruction(), MESSAGE_HOLD_MS)
        drawMarks()
        return
      }
      refBCorners = ordered
      cardCorners = null
      originalCorners = null
      readingAspect = measured.aspectA || null
      readingAspectB = measured.aspectB || null
      adjustNoun = null
      const detect = refADetect === 'manual' || refBDetect === 'manual' ? 'manual' : 'auto'
      finishTwoRef(measured, detect, `${refAStrategy}+${refBStrategy}`)
      return
    }
    armReading(usesTemplate)
    readingAspect = result.aspect || null
    readingAspectB = null
    homography = result.H
    cardCorners = ordered
    cardLongPx = longPx
    detectKind = kind
    const smallNote = longPx < SMALL_CARD_PX ? smallReferenceNote(longPx) : ''
    adjustNoun = null
    sheetHandlesVisible = false
    phase = points.a && points.b ? 'result' : (points.a ? 'point-b' : 'point-a')
    setPrimaryButton()
    if (smallNote) showTemporaryInstruction(smallNote, MESSAGE_HOLD_MS)
    else {
      instructionHoldUntil = 0
      renderInstruction()
    }
    drawMarks()
    syncChrome()
    if (points.a && points.b && homography) finishMeasurement()
  }

  function handleDistance(localX, localY, imagePoint) {
    const screen = imageToLocal(imagePoint.x, imagePoint.y)
    return hypot2(localX, localY, screen.x, screen.y)
  }

  function nearestCornerIndex(localX, localY) {
    let best = -1
    let bestDist = HANDLE_HIT_RADIUS_PX
    if (!cardCorners) return -1
    for (let i = 0; i < cardCorners.length; i++) {
      const dist = handleDistance(localX, localY, cardCorners[i])
      if (dist <= bestDist) {
        bestDist = dist
        best = i
      }
    }
    return best
  }

  function placingPoints() {
    return phase === 'point-a' || phase === 'point-b' || (phase === 'result' && !twoRefLayout())
  }

  function nearestPointKey(localX, localY) {
    const keys = ['a', 'b']
    let best = null
    let bestDist = Infinity
    for (let i = 0; i < keys.length; i++) {
      if (!points[keys[i]]) continue
      const layout = pointMarkerLayout(points[keys[i]])
      const distPoint = hypot2(localX, localY, layout.x, layout.y)
      const distDisc = hypot2(localX, localY, layout.discX, layout.discY)
      if (distPoint <= HANDLE_HIT_RADIUS_PX && distPoint < bestDist) {
        bestDist = distPoint
        best = keys[i]
      }
      if (distDisc <= 24 && distDisc < bestDist) {
        bestDist = distDisc
        best = keys[i]
      }
    }
    return best
  }

  function firstMissingPoint() {
    const keys = ['a', 'b']
    for (let i = 0; i < keys.length; i++) {
      if (!points[keys[i]]) return keys[i]
    }
    return null
  }

  function onStagePointerDown(event) {
    if (phase === 'live') return
    event.preventDefault()
    els.stage.setPointerCapture(event.pointerId)
    const loc = clientToImage(event.clientX, event.clientY)
    if (phase === 'need-card-tap' || phase === 'need-card-b') {
      placeCardAtTap(loc.x, loc.y)
      return
    }
    if ((phase === 'adjust-card' || phase === 'adjust-card-b') && cardCorners) {
      if (!sheetHandlesVisible) return
      const index = nearestCornerIndex(loc.localX, loc.localY)
      if (index >= 0) beginDrag({kind: 'corner', index: index}, cardCorners[index], loc)
      return
    }
    if (!placingPoints()) return
    const hit = nearestPointKey(loc.localX, loc.localY)
    if (hit) {
      beginDrag({kind: 'point', key: hit}, points[hit], loc)
      return
    }
    // Same gesture creates the point and slides it. A quick tap commits on lift.
    const missing = firstMissingPoint()
    if (!missing || phase === 'result') return
    points[missing] = point(loc.x, loc.y)
    pointPopUntil[missing] = performance.now() + 150
    beginDrag({kind: 'point', key: missing}, points[missing], loc)
  }

  function onStagePointerMove(event) {
    if (!dragTarget) return
    event.preventDefault()
    const loc = clientToImage(event.clientX, event.clientY)
    const next = draggedImagePoint(loc)
    if (dragTarget.kind === 'corner') {
      cardCorners[dragTarget.index] = next
    } else if (dragTarget.kind === 'point') {
      points[dragTarget.key] = next
    }
    loupePoint = {x: next.x, y: next.y, localX: loc.localX, localY: loc.localY}
    if (dragTarget.kind === 'point' && points.a && points.b && homography && els.resultInches) {
      const inches = liveInches()
      if (inches != null) els.resultInches.textContent = formatTapeInches(inches)
    }
    drawMarks()
  }

  function onStagePointerUp(event) {
    if (!dragTarget) return
    event.preventDefault()
    const was = dragTarget
    endDrag()
    if (was.kind !== 'point') {
      drawMarks()
      return
    }
    const missing = firstMissingPoint()
    if (missing) {
      phase = `point-${missing}`
      instructionHoldUntil = 0
      setPrimaryButton()
      renderInstruction()
      drawMarks()
      return
    }
    if (homography) finishMeasurement()
    else drawMarks()
  }

  function showStill() {
    els.stage.classList.add('is-still')
  }

  function showLive() {
    els.stage.classList.remove('is-still')
  }

  function resetTemplateScale() {
    readTemplateBarField()
    templatePrintRemembered = false
    if (templateLineConfirmed) {
      const chosen = recoverPrintScaleFromBar(templateBarIn)
      templatePrintScaleValue = chosen.printScale > 0 ? chosen.printScale : 1
      templatePrintSource = 'bar'
      templatePrintStatus = templatePrintScaleValue
      rememberSessionPrintScale(templatePrintScaleValue, 'bar')
    } else {
      templatePrintScaleValue = 1
      templatePrintSource = 'none'
      templatePrintStatus = 'unverified'
    }
    templateMeta = null
  }

  function clearMarkerFlags() {
    pendingUsesTemplate = false
    pendingAutoMarkers = 'n'
    refAUsesTemplate = false
    adjustNoun = null
    readingUsesTemplate = false
    readingAutoMarkers = 'n'
    readingSpec = null
    readingAspect = null
    readingAspectB = null
  }

  function clearCaptureGeometry() {
    cardCorners = null
    originalCorners = null
    refACorners = null
    refBCorners = null
    refADetect = 'manual'
    refBDetect = 'manual'
    refAStrategy = 'manual'
    refBStrategy = 'manual'
    detectKind = 'manual'
    detectStrategy = 'manual'
    homography = null
    cardLongPx = 0
    points = {a: null, b: null}
    currentReading = null
    clearMarkerFlags()
    resetTemplateScale()
  }

  function captureFrame() {
    const video = els.preview
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) {
      showTemporaryInstruction('Camera is not ready yet.', MESSAGE_HOLD_MS)
      return
    }
    captureWidth = width
    captureHeight = height
    captureCanvas.width = width
    captureCanvas.height = height
    captureCtx.drawImage(video, 0, 0, width, height)
    els.still.width = width
    els.still.height = height
    els.still.getContext('2d').drawImage(captureCanvas, 0, 0)
    captureBeta = beta
    captureGamma = gamma
    clearCaptureGeometry()
    hideReferencePicker()
    hideCustomForm()
    clearResultText()
    showStill()
    sheetHandlesVisible = false
    uiStep = 3
    phase = 'need-card-tap'
    stopLiveCheck()
    captureTemplateMissed = false
    detectingSheet = referenceKind === 'template'
    if (detectingSheet && els.sheetStatus) {
      els.sheetStatus.removeAttribute('hidden')
      els.sheetStatus.textContent = 'Looking for the sheet…'
      els.sheetStatus.classList.remove('is-found')
    }
    setPrimaryButton()
    instructionHoldUntil = 0
    renderInstruction()
    resizeMarks()
    logDiagnostic(`capture ${width}×${height} layout=${layout} ref=${referenceToken(currentReference())} β=${formatAngle(captureBeta)} γ=${formatAngle(captureGamma)}`)
    syncChrome()
    requestAnimationFrame(() => {
      setTimeout(tryAutoDetectOnCapture, 0)
    })
  }

  function tryAutoDetectOnCapture() {
    const tapX = captureWidth / 2
    const tapY = captureHeight / 2
    let markers = null
    try {
      markers = detectTemplate(tapX, tapY)
    } catch (err) {
      logDiagnostic(`detectTemplate threw: ${errorMessage(err)}`)
      markers = null
    }
    detectingSheet = false
    const markerHit = markers && markers.ok && markers.markersFound >= 2
      && markers.cardCorners && markers.cardCorners.length === 4
    if (markerHit) {
      captureTemplateMissed = false
      applyTemplateDetection(markers)
      pendingUsesTemplate = true
      pendingAutoMarkers = 'y'
      adjustNoun = 'template'
      cardCorners = markers.cardCorners
      originalCorners = cardCorners.map(copyPoint)
      detectKind = 'auto'
      detectStrategy = `markers${markers.markersFound}`
      sheetHandlesVisible = false
      sheetFlashUntil = performance.now() + FLASH_HOLD_MS
      phase = 'adjust-card'
      logDiagnostic(`auto-detected template via ${detectStrategy}`)
      if (templatePrintSource === 'none' && !printScaleNudgeShown && !templateLineConfirmed) {
        printScaleNudgeShown = true
        showTemporaryInstruction(PRINT_SCALE_NUDGE, DETECT_MESSAGE_HOLD_MS)
      }
      confirmCard()
      if (phase === 'adjust-card') sheetHandlesVisible = true
      drawMarks()
      syncChrome()
      return
    }
    captureTemplateMissed = referenceKind === 'template'
    phase = 'need-card-tap'
    if (referenceKind === 'template') {
      showTemporaryInstruction(tapReferenceInstruction('a'), DETECT_MESSAGE_HOLD_MS)
    } else {
      showTemporaryInstruction('Tap the paper', DETECT_MESSAGE_HOLD_MS)
    }
    setPrimaryButton()
    renderInstruction()
    syncChrome()
  }

  function retake() {
    endDrag()
    clearCaptureGeometry()
    clearResultText()
    showLive()
    sheetHandlesVisible = false
    sheetFlashUntil = 0
    captureTemplateMissed = false
    detectingSheet = false
    uiStep = 2
    phase = 'live'
    startLiveCheck()
    setPrimaryButton()
    instructionHoldUntil = 0
    renderInstruction()
    drawMarks()
    syncChrome()
    logDiagnostic('retake')
  }

  function resetPoints() {
    endDrag()
    if (phase === 'live' || phase === 'need-card-tap') {
      points = {a: null, b: null}
      currentReading = null
      clearResultText()
      drawMarks()
      syncChrome()
      return
    }
    if (!homography) {
      showTemporaryInstruction(needReferenceInstruction(), MESSAGE_HOLD_MS)
      return
    }
    points = {a: null, b: null}
    currentReading = null
    sheetHandlesVisible = false
    clearResultText()
    phase = 'point-a'
    instructionHoldUntil = 0
    setPrimaryButton()
    renderInstruction()
    drawMarks()
    syncChrome()
  }

  function onPrimaryButton() {
    if (uiStep === 2 || phase === 'live') {
      if (!cameraReady) {
        startCamera().then(() => {
          if (cameraReady) captureFrame()
        })
        return
      }
      captureFrame()
      return
    }
    if (phase === 'adjust-card' || phase === 'adjust-card-b') {
      confirmCard()
      return
    }
    retake()
  }

  function renderList() {
    if (els.measurementSummary) {
      els.measurementSummary.textContent = `Session list (${measurements.length})`
    }
    if (els.savedToggle) {
      els.savedToggle.textContent = `Saved measurements (${measurements.length})`
    }
    if (!els.measurementRows) return
    els.measurementRows.replaceChildren()
    if (measurements.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'measurement-empty'
      empty.textContent = 'No measurements yet.'
      els.measurementRows.append(empty)
      return
    }
    for (let i = 0; i < measurements.length; i++) {
      const reading = measurements[i]
      const row = document.createElement('div')
      row.className = 'measurement-row'
      const token = String(reading.reference || 'card')
      let noun = 'sheet'
      if (token === 'card') noun = 'card'
      else if (token.indexOf('custom:') === 0) noun = 'reference'
      const strategy = reading.detectStrategy || 'manual'
      const bits = [
        String(i + 1),
        reading.mode,
        reading.layout || '1ref',
        `${reading.reference} ${reading.inches.toFixed(1)} in (${reading.cm.toFixed(1)} cm)`,
        `${noun} ${Math.round(reading.cardLongPx)} px`,
        `tilt β ${formatAngle(reading.beta)} γ ${formatAngle(reading.gamma)}`,
        `${reading.detect} ${strategy}`,
      ]
      if (reading.warningDisagree || reading.warningAngle || reading.warningAxis || reading.warningScale || reading.warningFlat || reading.warningPrintScale) {
        bits.push('warn')
      }
      for (let b = 0; b < bits.length; b++) {
        const span = document.createElement('span')
        span.textContent = bits[b]
        row.append(span)
      }
      els.measurementRows.append(row)
    }
  }

  function tsvNumber(value, digits) {
    if (value == null || !Number.isFinite(value)) return 'none'
    return value.toFixed(digits)
  }

  function buildTsv() {
    const lines = [[
      'n',
      'mode',
      'reference',
      'inches',
      'cm',
      'card_long_px',
      'image_w',
      'image_h',
      'tilt_beta',
      'tilt_gamma',
      'detect',
      'detect_strategy',
      'layout',
      'fit_rms_mm',
      'scale_drift',
      'ref_a_px',
      'ref_b_px',
      'lines_angle_deg',
      'lines_spread_mm',
      'raw_point_in',
      'scale_ratio_a',
      'scale_ratio_b',
      'orient_a',
      'orient_b',
      'axis_angle_deg',
      'print_scale',
      'print_scale_source',
      'markers_found',
      'marker_rms_mm',
      'auto_markers',
      'aspect_ratio_est',
      'focal_source',
      'print_warning',
    ].join('\t')]
    for (let i = 0; i < measurements.length; i++) {
      const reading = measurements[i]
      lines.push([
        String(i + 1),
        reading.mode,
        reading.reference || 'card',
        reading.inches.toFixed(1),
        reading.cm.toFixed(1),
        String(Math.round(reading.cardLongPx)),
        String(reading.imageW),
        String(reading.imageH),
        tsvNumber(reading.beta, 1),
        tsvNumber(reading.gamma, 1),
        reading.detect,
        reading.detectStrategy || 'manual',
        reading.layout || '1ref',
        tsvNumber(reading.fitRmsMm, 2),
        tsvNumber(reading.scaleDrift, 3),
        tsvNumber(reading.refAPx, 0),
        tsvNumber(reading.refBPx, 0),
        tsvNumber(reading.linesAngleDeg, 2),
        tsvNumber(reading.linesSpreadMm, 2),
        tsvNumber(reading.rawPointIn, 1),
        tsvNumber(reading.scaleRatioA, 3),
        tsvNumber(reading.scaleRatioB, 3),
        reading.orientA || 'none',
        reading.orientB || 'none',
        tsvNumber(reading.axisAngleDeg, 2),
        reading.printScale === 'unverified' ? 'unverified' : tsvNumber(reading.printScale, 4),
        reading.printScaleSource || 'none',
        tsvNumber(reading.markersFound, 0),
        tsvNumber(reading.markerRmsMm, 2),
        reading.autoMarkers === 'y' ? 'y' : 'n',
        tsvNumber(reading.aspectRatioEst, 2),
        reading.focalSource || 'none',
        reading.warningPrintScale ? 'y' : 'n',
      ].join('\t'))
    }
    return `${lines.join('\n')}\n`
  }

  function flashCopyButton(label) {
    if (!els.copyResultsButton) return
    els.copyResultsButton.textContent = label
    clearTimeout(copyLabelTimer)
    copyLabelTimer = setTimeout(() => {
      els.copyResultsButton.textContent = 'Copy results'
    }, 1800)
  }

  function markCopied() {
    flashCopyButton('Copied')
  }

  function selectFallback(text) {
    const area = els.clipboardFallback
    area.value = text
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
    if (copied) markCopied()
    else flashCopyButton('Selected — copy them manually')
  }

  function copyResults() {
    if (measurements.length === 0) {
      flashCopyButton(NEED_SAVED_INSTRUCTION)
      return
    }
    const text = buildTsv()
    try {
      const pending = navigator.clipboard.writeText(text)
      if (pending && typeof pending.then === 'function') {
        pending.then(() => markCopied()).catch(() => selectFallback(text))
      } else {
        markCopied()
      }
    } catch (err) {
      selectFallback(text)
    }
  }

  function saveReading() {
    if (!currentReading) {
      showTemporaryInstruction(twoRefLayout() ? NEED_REFS_INSTRUCTION : NEED_POINTS_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    measurements.push({
      mode: currentReading.mode,
      layout: currentReading.layout,
      reference: currentReading.reference,
      inches: currentReading.inches,
      cm: currentReading.cm,
      cardLongPx: currentReading.cardLongPx,
      imageW: currentReading.imageW,
      imageH: currentReading.imageH,
      beta: currentReading.beta,
      gamma: currentReading.gamma,
      detect: currentReading.detect,
      detectStrategy: currentReading.detectStrategy || 'manual',
      fitRmsMm: currentReading.fitRmsMm,
      scaleDrift: currentReading.scaleDrift,
      refAPx: currentReading.refAPx,
      refBPx: currentReading.refBPx,
      linesAngleDeg: currentReading.linesAngleDeg,
      linesSpreadMm: currentReading.linesSpreadMm,
      rawPointIn: currentReading.rawPointIn,
      axisAngleDeg: currentReading.axisAngleDeg,
      orientA: currentReading.orientA,
      orientB: currentReading.orientB,
      scaleRatioA: currentReading.scaleRatioA,
      scaleRatioB: currentReading.scaleRatioB,
      warningDisagree: currentReading.warningDisagree,
      warningAngle: currentReading.warningAngle,
      warningAxis: currentReading.warningAxis,
      warningScale: currentReading.warningScale,
      warningFlat: currentReading.warningFlat,
      warningPrintScale: !!currentReading.warningPrintScale,
      printScale: currentReading.printScale,
      printScaleSource: currentReading.printScaleSource,
      markersFound: currentReading.markersFound,
      markerRmsMm: currentReading.markerRmsMm,
      autoMarkers: currentReading.autoMarkers === 'y' ? 'y' : 'n',
      aspectRatioEst: currentReading.aspectRatioEst,
      focalSource: currentReading.focalSource || 'none',
    })
    renderList()
    updateMenuBadge()
    if (els.saveButton) els.saveButton.textContent = 'Saved'
    clearTimeout(saveLabelTimer)
    saveLabelTimer = setTimeout(() => {
      if (els.saveButton) els.saveButton.textContent = 'Save measurement'
    }, 1200)
    showTemporaryInstruction('Saved', MESSAGE_HOLD_MS)
    syncChrome()
  }

  function noteCameraSize() {
    const width = els.preview && els.preview.videoWidth
    const height = els.preview && els.preview.videoHeight
    if (!width || !height) return
    const label = `Camera: ${width}×${height}`
    if (els.cameraResolution) {
      if (els.cameraResolution.textContent === label) return
      els.cameraResolution.textContent = label
    }
    logDiagnostic(`camera ${width}×${height}`)
  }

  function stopCamera() {
    if (!cameraStream) return
    const tracks = cameraStream.getTracks()
    for (let i = 0; i < tracks.length; i++) tracks[i].stop()
    cameraStream = null
    cameraReady = false
  }

  function startCamera() {
    if (cameraStream) return Promise.resolve()
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      cameraDenied = true
      if (els.cameraResolution) els.cameraResolution.textContent = 'Camera: unavailable'
      instructionHoldUntil = 0
      renderInstruction()
      setPrimaryButton()
      logDiagnostic('getUserMedia missing')
      return Promise.resolve()
    }
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {ideal: 'environment'},
        width: {ideal: 4096},
        height: {ideal: 2160},
      },
      audio: false,
    }).then((stream) => {
      cameraStream = stream
      cameraReady = true
      cameraDenied = false
      els.preview.srcObject = stream
      els.preview.muted = true
      els.preview.setAttribute('playsinline', '')
      const playing = els.preview.play()
      if (playing && typeof playing.catch === 'function') {
        playing.catch((err) => logDiagnostic(`video.play: ${errorMessage(err)}`))
      }
      noteCameraSize()
      setPrimaryButton()
      logDiagnostic('camera started')
    }).catch((err) => {
      cameraDenied = true
      cameraReady = false
      if (els.cameraResolution) els.cameraResolution.textContent = 'Camera: denied'
      instructionHoldUntil = 0
      renderInstruction()
      setPrimaryButton()
      logDiagnostic(`getUserMedia failed: ${errorMessage(err)}`)
    })
  }

  function waitForCvDefined() {
    if (typeof cv !== 'undefined') return Promise.resolve()
    return new Promise((resolve, reject) => {
      let ticks = 0
      const timer = setInterval(() => {
        ticks += 1
        if (typeof cv !== 'undefined') {
          clearInterval(timer)
          resolve()
        } else if (ticks > 900) {
          clearInterval(timer)
          reject(new Error('OpenCV.js did not load'))
        }
      }, 50)
    })
  }

  function waitForOpenCv() {
    return waitForCvDefined().then(() => {
      const cvReady = (cv instanceof Promise)
        ? cv.then((m) => { window.cv = m })
        : new Promise((resolve) => {
          if (cv.Mat) resolve()
          else cv.onRuntimeInitialized = resolve
        })
      return cvReady
    })
  }

  function bindOrientation() {
    if (orientationBound) return
    orientationBound = true
    window.addEventListener('deviceorientation', (event) => {
      beta = typeof event.beta === 'number' ? event.beta : null
      gamma = typeof event.gamma === 'number' ? event.gamma : null
      renderTilt()
    })
  }

  function requestTiltPermission() {
    const request = DeviceOrientationEvent.requestPermission
    request.call(DeviceOrientationEvent).then((state) => {
      logDiagnostic(`tilt permission ${state}`)
      if (state === 'granted') {
        els.enableTiltButton.hidden = true
        bindOrientation()
      }
    }).catch((err) => {
      logDiagnostic(`tilt permission: ${errorMessage(err)}`)
    })
  }

  function bindControls() {
    if (els.floorModeButton) els.floorModeButton.addEventListener('click', () => setMode('floor'))
    if (els.wallModeButton) els.wallModeButton.addEventListener('click', () => setMode('wall'))
    if (els.lineLengthInput) {
      els.lineLengthInput.addEventListener('input', () => onLineLengthInput())
      els.lineLengthInput.addEventListener('change', () => {
        onLineLengthInput()
        if (lineLengthConfirmed()) persistLineLength()
        resetTemplateScale()
        logDiagnostic(`bar measured ${templateBarIn.toFixed(2)} in`)
      })
    }
    if (els.lineExactCheck) {
      els.lineExactCheck.addEventListener('change', () => onExactCheck())
    }
    if (els.letterCheck) {
      els.letterCheck.addEventListener('change', () => updateOpenCameraEnabled())
    }
    if (els.useLetterButton) {
      els.useLetterButton.addEventListener('click', () => setSheetKind('letter'))
    }
    if (els.useTemplateButton) {
      els.useTemplateButton.addEventListener('click', () => setSheetKind('template'))
    }
    if (els.openCameraButton) {
      els.openCameraButton.addEventListener('click', () => openCameraFromStep1())
    }
    if (els.backButton) {
      els.backButton.addEventListener('click', () => goToStep1())
    }
    if (els.shutterButton) {
      els.shutterButton.addEventListener('click', () => {
        if (!cameraReady) {
          startCamera().then(() => {
            if (cameraReady) captureFrame()
          })
          return
        }
        captureFrame()
      })
    }
    if (els.saveButton) els.saveButton.addEventListener('click', () => saveReading())
    if (els.retakeButton) els.retakeButton.addEventListener('click', () => retake())
    if (els.clearPointsButton) els.clearPointsButton.addEventListener('click', () => resetPoints())
    if (els.adjustSheetButton) els.adjustSheetButton.addEventListener('click', () => beginAdjustSheet())
    if (els.doneAdjustButton) els.doneAdjustButton.addEventListener('click', () => confirmCard())
    if (els.looksRightButton) els.looksRightButton.addEventListener('click', () => confirmCard())
    if (els.copyResultsButton) els.copyResultsButton.addEventListener('click', () => copyResults())
    if (els.moreButton) els.moreButton.addEventListener('click', () => setMenuOpen(true))
    if (els.moreButtonStage) els.moreButtonStage.addEventListener('click', () => setMenuOpen(true))
    if (els.moreBackdrop) els.moreBackdrop.addEventListener('click', () => setMenuOpen(false))
    if (els.menuCloseButton) els.menuCloseButton.addEventListener('click', () => setMenuOpen(false))
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !menuOpen) return
      event.preventDefault()
      setMenuOpen(false)
    })
    if (els.savedToggle) {
      els.savedToggle.addEventListener('click', () => toggleMenuPanel('saved'))
    }
    if (els.debugToggle) {
      els.debugToggle.addEventListener('click', () => toggleMenuPanel('debug'))
    }
    if (els.changeSheetButton) {
      els.changeSheetButton.addEventListener('click', () => {
        setMenuOpen(false)
        goToStep1()
      })
    }
    els.stage.addEventListener('pointerdown', onStagePointerDown)
    els.stage.addEventListener('pointermove', onStagePointerMove)
    els.stage.addEventListener('pointerup', onStagePointerUp)
    els.stage.addEventListener('pointercancel', onStagePointerUp)
    els.preview.addEventListener('loadedmetadata', () => {
      noteCameraSize()
      resizeMarks()
    })
    els.preview.addEventListener('resize', () => {
      noteCameraSize()
      resizeMarks()
    })
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)
    window.addEventListener('pagehide', () => {
      stopLiveCheck()
      stopCamera()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopLiveCheck()
      else if (uiStep === 2) startLiveCheck()
    })
    if (els.enableTiltButton) {
      els.enableTiltButton.addEventListener('click', () => requestTiltPermission())
    }
  }

  function onViewportChange() {
    refreshButtonLabels()
    resizeMarks()
    requestAnimationFrame(() => resizeMarks())
  }

  function startApp() {
    cacheElements()
    bindControls()
    loadRememberedLineLength()
    updateOpenCameraEnabled()
    resizeMarks()
    renderTilt()
    refreshButtonLabels()
    renderInstruction()
    syncChrome()
    logDiagnostic('measure.js loaded')
    const ar = arucoApi()
    logDiagnostic(ar && typeof ar.Detector === 'function' ? 'js-aruco2 ready' : 'js-aruco2 missing')

    if (els.enableTiltButton && typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
      els.enableTiltButton.hidden = false
    } else {
      bindOrientation()
    }

    const opencvScript = document.querySelector('script[src*="opencv"]')
    if (opencvScript) {
      opencvScript.addEventListener('error', () => {
        visionFailed = true
        if (els.visionStatus) els.visionStatus.textContent = 'Vision library failed to load'
        setPrimaryButton()
        logDiagnostic('opencv script error')
      })
    }

    waitForOpenCv().then(() => {
      visionReady = true
      if (els.visionStatus) els.visionStatus.textContent = 'Vision ready'
      setPrimaryButton()
      logDiagnostic('OpenCV.js ready')
    }).catch((err) => {
      visionFailed = true
      if (els.visionStatus) els.visionStatus.textContent = 'Vision library failed to load'
      setPrimaryButton()
      logDiagnostic(`OpenCV.js: ${errorMessage(err)}`)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp)
  } else {
    startApp()
  }
}
