// Still-image reference measurement, in millimetres. No SLAM.
// One reference maps two jamb points through a homography; the width is the
// component along the sheet's own axis. Two references sit on the jambs; the
// width is the perpendicular gap between their outer edges, and each card may
// lie with either edge across the doorway. Pure geometry is at the top so
// Node can require this file without a browser.

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
// 3°, or a tap whose local scale is 1.5× the reference centre.
const FIT_RMS_WARN_MM = 3
const SCALE_DRIFT_WARN_TIGHT = 0.05
const SCALE_DRIFT_WARN_LOOSE = 0.15
const SCALE_DRIFT_LOOSE_PX = 400
const LINES_ANGLE_WARN_DEG = 3
const SCALE_RATIO_WARN = 1.5
const MARKER_RMS_WARN_MM = 1.5
const PRINT_SCALE_AGREE = 0.01
const PRINT_PAPER_BAND = 0.15
const TEMPLATE_DETECT_MAX_SIDE = 1800
const TEMPLATE_FLAT_WARNING = 'Template is not flat or is printed unevenly.'
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
  if (spec.name === 'template') return 'template:letter-v1'
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
// 2.00 in. Shared by the printable page and the detector.
const TEMPLATE_LETTER_V1 = {
  ids: [0, 1, 2, 3],
  markerSizeIn: 2.0,
  outerSquaresIn: {
    0: [0.60, 0.60, 2.60, 2.60],
    1: [8.40, 0.60, 10.40, 2.60],
    2: [8.40, 5.90, 10.40, 7.90],
    3: [0.60, 5.90, 2.60, 7.90],
  },
  pageIn: [11, 8.5],
  cardOutlineIn: [3.370, 2.125],
  barIn: 6.0,
}

const TEMPLATE_OUTER_LONG_IN = 9.80
const TEMPLATE_OUTER_SHORT_IN = 7.30

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
  return [
    {x: 0.60 * s, y: 0.60 * s},
    {x: 10.40 * s, y: 0.60 * s},
    {x: 10.40 * s, y: 7.90 * s},
    {x: 0.60 * s, y: 7.90 * s},
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

const FLOOR_LIVE_INSTRUCTION = 'Lay a plain sheet of printer paper on the floor on the line between the jambs, long edge along the door. Step back so both jambs and the sheet are in view, then Capture.'
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

// Opposite-edge averages decide whether the reference's long side is the
// top/bottom pair or the left/right pair. ref is {longMm, shortMm, name}.
function referenceDestinationMm(ordered, ref) {
  const spec = ref || CARD_REF
  const pairA = (edgeLength(ordered[0], ordered[1]) + edgeLength(ordered[2], ordered[3])) / 2
  const pairB = (edgeLength(ordered[1], ordered[2]) + edgeLength(ordered[3], ordered[0])) / 2
  if (pairA >= pairB) {
    return [
      point(0, 0),
      point(spec.longMm, 0),
      point(spec.longMm, spec.shortMm),
      point(0, spec.shortMm),
    ]
  }
  return [
    point(0, 0),
    point(spec.shortMm, 0),
    point(spec.shortMm, spec.longMm),
    point(0, spec.longMm),
  ]
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

// Door-edge / jamb-edge in the image, versus the ratio that orientation
// predicts. A 90° swap of both cards is an anisotropic scale of the plane,
// so it is also a homography: pixel RMS and scale drift both tie, and this
// is what separates the true width from the 85.60/53.98 stretch.
function orientationAspectPenalty(slots, spec, orient) {
  const jamb = (edgeLength(slots[0], slots[1]) + edgeLength(slots[2], slots[3])) / 2
  const door = (edgeLength(slots[0], slots[2]) + edgeLength(slots[1], slots[3])) / 2
  if (!(jamb > 1e-6) || !(door > 0)) return Infinity
  const predicted = orient === 'short-across' ? spec.shortMm / spec.longMm : spec.longMm / spec.shortMm
  if (!(predicted > 0)) return Infinity
  return Math.abs(Math.log((door / jamb) / predicted))
}

// Lowest final 8-corner pixel RMS wins. A near-tie breaks on |scaleDrift − 1|.
// If those also tie, the image edge ratio picks the orientation.
function preferOrientFit(candidate, incumbent, slotsA, slotsB, spec) {
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
  const candAspect = orientationAspectPenalty(slotsA, spec, candidate.orientA)
    + orientationAspectPenalty(slotsB, spec, candidate.orientB)
  const incAspect = orientationAspectPenalty(slotsA, spec, incumbent.orientA)
    + orientationAspectPenalty(slotsB, spec, incumbent.orientB)
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
function twoReferenceDestinationMm(cornersA, cornersB, ref, mode) {
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
      if (preferOrientFit(fit, chosen, slotsA, slotsB, spec)) chosen = fit
    }
  }
  if (!chosen) return null
  chosen.refAPx = meanLongEdgePx(orderCorners(cornersA))
  chosen.refBPx = meanLongEdgePx(orderCorners(cornersB))
  return chosen
}

function homographyPixelsToMm(pixelCorners, ref) {
  if (!pixelCorners || pixelCorners.length !== 4) return null
  const ordered = orderCorners(pixelCorners)
  const dst = referenceDestinationMm(ordered, ref || CARD_REF)
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
    TEMPLATE_OUTER_LONG_IN,
    TEMPLATE_OUTER_SHORT_IN,
    orderCorners,
    isoDestinationMm,
    referenceDestinationMm,
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

  let phase = 'live'
  let mode = 'floor'
  let layout = 'one'
  let referenceKind = 'letter'
  let customRef = null
  let templatePrintScaleValue = 1
  let templatePrintSource = 'none'
  let templatePrintStatus = 'unverified'
  let templateBarIn = TEMPLATE_LETTER_V1.barIn
  let templateMeta = null
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

  function cacheElements() {
    els.stage = document.getElementById('stage')
    els.preview = document.getElementById('preview')
    els.still = document.getElementById('still')
    els.marks = document.getElementById('marks')
    els.instructionText = document.getElementById('instructionText')
    els.topBar = document.getElementById('topBar')
    els.statusStrip = document.getElementById('statusStrip')
    els.statusToggle = document.getElementById('statusToggle')
    els.readout = document.getElementById('readout')
    els.sheetHandle = document.getElementById('sheetHandle')
    els.sheetChevron = document.getElementById('sheetChevron')
    els.belowFold = document.getElementById('belowFold')
    els.visionStatus = document.getElementById('visionStatus')
    els.cameraResolution = document.getElementById('cameraResolution')
    els.tiltAngles = document.getElementById('tiltAngles')
    els.enableTiltButton = document.getElementById('enableTiltButton')
    els.floorModeButton = document.getElementById('floorModeButton')
    els.wallModeButton = document.getElementById('wallModeButton')
    els.oneRefButton = document.getElementById('oneRefButton')
    els.twoRefButton = document.getElementById('twoRefButton')
    els.referencePickerButton = document.getElementById('referencePickerButton')
    els.referencePickerPopover = document.getElementById('referencePickerPopover')
    els.customReferencePopover = document.getElementById('customReferencePopover')
    els.customLongIn = document.getElementById('customLongIn')
    els.customShortIn = document.getElementById('customShortIn')
    els.customApplyButton = document.getElementById('customApplyButton')
    els.templateBarIn = document.getElementById('templateBarIn')
    els.captureButton = document.getElementById('captureButton')
    els.resetPointsButton = document.getElementById('resetPointsButton')
    els.logButton = document.getElementById('logButton')
    els.copyResultsButton = document.getElementById('copyResultsButton')
    els.resultInches = document.getElementById('resultInches')
    els.resultCentimeters = document.getElementById('resultCentimeters')
    els.resultMeta = document.getElementById('resultMeta')
    els.resultWarning = document.getElementById('resultWarning')
    els.measurementSummary = document.getElementById('measurementSummary')
    els.measurementRows = document.getElementById('measurementRows')
    els.clipboardFallback = document.getElementById('clipboardFallback')
    els.diagnosticsPanel = document.getElementById('diagnosticsPanel')
    els.diagnosticsSummary = document.getElementById('diagnosticsSummary')
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

  function currentReference() {
    if (referenceKind === 'template') return templateReference(templatePrintScaleValue)
    if (referenceKind === 'letter') return LETTER_REF
    if (referenceKind === 'legal') return LEGAL_REF
    if (referenceKind === 'notepad') return NOTEPAD_REF
    if (referenceKind === 'a4') return A4_REF
    if (referenceKind === 'custom' && customRef) return customRef
    return CARD_REF
  }

  // Spoken noun in prompts. Paper presets are a sheet; only the card is a card.
  function referenceNoun(capitalized) {
    let word = 'sheet'
    if (referenceKind === 'card') word = 'card'
    else if (referenceKind === 'template') word = 'template'
    else if (referenceKind === 'custom') word = 'reference'
    if (!capitalized) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  }

  function referenceChipLabel() {
    if (referenceKind === 'card') return 'Card'
    if (referenceKind === 'letter') return 'Letter'
    if (referenceKind === 'template') return 'Template'
    if (referenceKind === 'legal') return 'Legal 11.75×8.5'
    if (referenceKind === 'notepad') return 'Notepad 11.5×8.5'
    if (referenceKind === 'a4') return 'A4 11.69×8.27'
    if (referenceKind === 'custom' && customRef) {
      return `Custom ${formatInchesToken(customRef.longIn)}×${formatInchesToken(customRef.shortIn)}`
    }
    return 'Reference'
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

  function pointInstruction(key) {
    if (mode === 'wall') {
      if (key === 'a') return 'Press on the floor line. Slide the crosshair, then lift'
      return 'Press on the height mark. Slide the crosshair, then lift'
    }
    if (key === 'a') return 'Press on the LEFT jamb where it meets the floor. Slide the crosshair, then lift'
    return 'Press on the RIGHT jamb where it meets the floor. Slide the crosshair, then lift'
  }

  function tapReferenceInstruction(which) {
    const noun = referenceNoun(false)
    if (which === 'b') {
      if (mode === 'wall') return `Tap the UPPER ${noun}`
      return `Tap the RIGHT ${noun}`
    }
    if (twoRefLayout()) {
      if (mode === 'wall') return `Tap the LOWER ${noun}`
      return `Tap the LEFT ${noun}`
    }
    return `Tap the ${noun}`
  }

  function adjustReferenceInstruction() {
    const noun = referenceNoun(false)
    return `Drag the corners onto the ${noun}'s edges if needed, then tap Confirm ${noun}`
  }

  function needReferenceInstruction() {
    return `Confirm the ${referenceNoun(false)} before placing points.`
  }

  function homographyFailInstruction() {
    const noun = referenceNoun(false)
    return `Those corners do not form a ${noun}. Drag them onto the four edges and confirm again.`
  }

  function liveInstruction() {
    const noun = referenceNoun(false)
    if (referenceKind === 'template') {
      if (twoRefLayout() && mode === 'wall') {
        return 'Put one printed template flat on the wall with one edge on the floor line, and the other flat with one edge on the height mark. Any orientation. Both in view, then Capture.'
      }
      if (twoRefLayout()) {
        return 'Put one printed template against each jamb, one edge flush on the jamb face. Any orientation. Both flat and in view, then Capture.'
      }
      if (mode === 'wall') {
        return 'Hold the printed template flat on the wall, on the line between the floor and the height mark. Get both in view, then Capture.'
      }
      return 'Lay the printed Letter template on the floor on the line between the jambs (any orientation). Step back so both jambs and the sheet are in view, then Capture.'
    }
    if (twoRefLayout() && mode === 'wall') {
      return `Put one ${noun} flat on the wall with one edge on the floor line, and the other flat with one edge on the height mark. Either orientation is fine. Both in view, then Capture.`
    }
    if (twoRefLayout()) {
      return `Put one ${noun} flat against each jamb, one edge flush on the jamb face. Either orientation is fine. Both flat and in view, then Capture.`
    }
    if (mode === 'wall') return WALL_LIVE_INSTRUCTION
    return FLOOR_LIVE_INSTRUCTION
  }

  function resultInstruction() {
    if (twoRefLayout()) return 'Result is on screen. Save to list, or Retake / Reset refs.'
    return 'Result is on screen. Save to list, or Retake / Reset points.'
  }

  function instructionForState() {
    if (cameraDenied) return CAMERA_DENIED_INSTRUCTION
    if (phase === 'live') return liveInstruction()
    if (phase === 'need-card-tap') return tapReferenceInstruction('a')
    if (phase === 'need-card-b') return tapReferenceInstruction('b')
    if (phase === 'adjust-card' || phase === 'adjust-card-b') return adjustReferenceInstruction()
    if (phase === 'point-a') return pointInstruction('a')
    if (phase === 'point-b') return pointInstruction('b')
    return resultInstruction()
  }

  function renderInstruction() {
    if (performance.now() < instructionHoldUntil) return
    const el = els.instructionText
    if (!el) return
    el.classList.remove('is-flashing', 'is-flashing-ok')
    const next = instructionForState()
    if (el.textContent !== next) {
      el.textContent = next
      setInstructionExpanded(false)
    }
  }

  function setInstructionExpanded(expanded) {
    const el = els.instructionText
    if (!el) return
    const was = el.classList.contains('is-expanded')
    el.classList.toggle('is-expanded', expanded)
    el.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    // The stage is fixed, so the line's height does not move the photo.
    // Redraw in case the viewport changed while the line was collapsed.
    if (was !== expanded) resizeMarks()
  }

  function toggleInstructionExpanded() {
    const el = els.instructionText
    if (!el) return
    setInstructionExpanded(!el.classList.contains('is-expanded'))
  }

  function showTemporaryInstruction(text, holdMs, tone) {
    const el = els.instructionText
    el.textContent = text
    setInstructionExpanded(false)
    el.classList.remove('is-flashing', 'is-flashing-ok')
    void el.offsetWidth
    el.classList.add(tone === 'ok' ? 'is-flashing-ok' : 'is-flashing')
    instructionHoldUntil = performance.now() + holdMs
  }

  function positionChrome() {
    if (!els.instructionText || !els.topBar) return
    let top = els.topBar.offsetHeight + 4
    if (els.statusStrip && !els.statusStrip.hasAttribute('hidden')) {
      top += els.statusStrip.offsetHeight + 4
    }
    if (els.referencePickerPopover && !els.referencePickerPopover.hasAttribute('hidden')) {
      els.referencePickerPopover.style.top = `${top}px`
      top += els.referencePickerPopover.offsetHeight + 4
    }
    if (els.customReferencePopover && !els.customReferencePopover.hasAttribute('hidden')) {
      els.customReferencePopover.style.top = `${top}px`
      top += els.customReferencePopover.offsetHeight + 4
    }
    els.instructionText.style.top = `${top}px`
  }

  function setStatusOpen(open) {
    if (!els.statusStrip || !els.statusToggle) return
    if (open) els.statusStrip.removeAttribute('hidden')
    else els.statusStrip.setAttribute('hidden', '')
    document.body.classList.toggle('is-status-open', open)
    els.statusToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    els.statusToggle.setAttribute('aria-label', open ? 'Hide status' : 'Show status')
    positionChrome()
  }

  function setSheetExpanded(expanded) {
    if (!els.readout || !els.belowFold || !els.sheetHandle) return
    els.readout.classList.toggle('is-expanded', expanded)
    if (expanded) els.belowFold.removeAttribute('hidden')
    else els.belowFold.setAttribute('hidden', '')
    els.sheetHandle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    els.sheetHandle.setAttribute('aria-label', expanded ? 'Collapse details' : 'Expand details')
    if (els.sheetChevron) els.sheetChevron.textContent = expanded ? '▾' : '▴'
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
    els.floorModeButton.setAttribute('aria-pressed', mode === 'floor' ? 'true' : 'false')
    els.wallModeButton.setAttribute('aria-pressed', mode === 'wall' ? 'true' : 'false')
    instructionHoldUntil = 0
    renderInstruction()
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

  function readTemplateBarField() {
    if (!els.templateBarIn) return
    const value = Number(String(els.templateBarIn.value).trim())
    if (value > 0 && Number.isFinite(value) && value < 40) templateBarIn = value
    else templateBarIn = TEMPLATE_LETTER_V1.barIn
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
    const button = els.captureButton
    const locked = phase !== 'live'
    els.floorModeButton.disabled = locked
    els.wallModeButton.disabled = locked
    if (els.oneRefButton) els.oneRefButton.disabled = locked
    if (els.twoRefButton) els.twoRefButton.disabled = locked
    if (els.referencePickerButton) els.referencePickerButton.disabled = locked
    if (phase === 'live') {
      if (visionReady) {
        button.innerHTML = 'Capture'
        // Stay tappable while the camera starts so iOS can grant getUserMedia
        // from this tap. Vision has finished loading.
        button.disabled = false
      } else if (visionFailed) {
        button.innerHTML = 'Vision failed'
        button.disabled = true
        // The strip is hidden on purpose. Open it so the load error is visible.
        setStatusOpen(true)
      } else {
        button.innerHTML = 'Loading…'
        button.disabled = true
      }
    } else if (phase === 'adjust-card' || phase === 'adjust-card-b') {
      button.innerHTML = stackedLabel('Confirm', referenceNoun(false))
      button.disabled = false
    } else {
      button.innerHTML = 'Retake'
      button.disabled = false
    }
  }

  function refreshButtonLabels() {
    updateReferenceChip()
    setPrimaryButton()
    if (els.resetPointsButton && els.resetPointsButton.textContent !== 'Resetting') {
      els.resetPointsButton.innerHTML = twoRefLayout() ? stackedLabel('Reset', 'refs') : stackedLabel('Reset', 'points')
    }
    if (els.logButton && els.logButton.textContent !== 'Saved') {
      els.logButton.innerHTML = stackedLabel('Save', 'to list')
    }
    if (els.copyResultsButton && els.copyResultsButton.textContent !== 'Copied') {
      els.copyResultsButton.innerHTML = stackedLabel('Copy', 'results')
    }
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
    ctx.fillStyle = '#39f3ff'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#08100c'
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
    ctx.strokeStyle = '#39f3ff'
    ctx.stroke()
  }

  function strokeOutlinedText(ctx, text, x, y) {
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)'
    ctx.strokeText(text, x, y)
    ctx.fillStyle = '#f4f1ea'
    ctx.fillText(text, x, y)
  }

  // The box is 150 capture px on the reference's long edge, mapped with the
  // preview's own video size so rotation still matches object-fit: contain.
  function drawLiveGuide(ctx) {
    const video = els.preview
    const mediaW = video ? video.videoWidth : 0
    const mediaH = video ? video.videoHeight : 0
    if (!mediaW || !mediaH) return
    const spec = currentReference()
    const longPx = GUIDE_LONG_EDGE_PX
    const shortPx = longPx * (spec.shortMm / spec.longMm)
    const fit = fitMappingFor(mediaW, mediaH)
    const cx = mediaW / 2
    const cy = mediaH / 2
    const halfLong = longPx / 2
    const halfShort = shortPx / 2
    const corners = [
      imageToLocal(cx - halfLong, cy - halfShort, fit),
      imageToLocal(cx + halfLong, cy - halfShort, fit),
      imageToLocal(cx + halfLong, cy + halfShort, fit),
      imageToLocal(cx - halfLong, cy + halfShort, fit),
    ]
    ctx.save()
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y)
    ctx.closePath()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffe14a'
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const caption = `${referenceNoun(false)} at least this big`
    const captionX = (corners[0].x + corners[1].x) / 2
    let captionY = corners[2].y + 8
    // Keep the caption above the bottom sheet.
    if (captionY > ctx.canvas.height - 110) captionY = corners[0].y + 8
    strokeOutlinedText(ctx, caption, captionX, captionY)
    if (window.innerHeight > window.innerWidth) {
      ctx.textBaseline = 'bottom'
      let hintY = ctx.canvas.height - 108
      if (hintY < 24) hintY = ctx.canvas.height - 10
      strokeOutlinedText(ctx, 'Turn sideways for a wider shot', ctx.canvas.width / 2, hintY)
    }
    ctx.restore()
  }

  function drawQuad(ctx, corners, stroke, fill, handles) {
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
    ctx.lineWidth = 2
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

  function drawMarks() {
    const canvas = els.marks
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (phase === 'live') {
      drawLiveGuide(ctx)
      return
    }

    const adjustingA = phase === 'adjust-card' || phase === 'need-card-tap'
    const adjustingB = phase === 'adjust-card-b'
    if (refACorners && !adjustingA) {
      drawQuad(ctx, refACorners, '#ffe14a', 'rgba(255, 225, 74, 0.12)', false)
    }
    if (cardCorners && cardCorners.length === 4) {
      const activeIsB = adjustingB || (twoRefLayout() && refACorners && phase !== 'adjust-card')
      const stroke = activeIsB ? '#7dffb3' : '#ffe14a'
      const fill = activeIsB ? 'rgba(125, 255, 179, 0.12)' : 'rgba(255, 225, 74, 0.12)'
      drawQuad(ctx, cardCorners, stroke, fill, adjustingA || adjustingB)
    }
    if (refBCorners && phase !== 'adjust-card-b') {
      drawQuad(ctx, refBCorners, '#7dffb3', 'rgba(125, 255, 179, 0.12)', false)
    }

    const keys = ['a', 'b']
    for (let i = 0; i < keys.length; i++) {
      const p = points[keys[i]]
      if (!p) continue
      const local = imageToLocal(p.x, p.y)
      drawHandle(ctx, local.x, local.y)
    }
    drawSegment(ctx, points.a, points.b, '#ffe14a')

    if (loupePoint) {
      const guide = imageToLocal(loupePoint.x, loupePoint.y)
      const guideX = Math.round(guide.x) + 0.5
      ctx.beginPath()
      ctx.moveTo(guideX, 0)
      ctx.lineTo(guideX, canvas.height)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(57, 243, 255, 0.4)'
      ctx.stroke()
      drawLoupe(ctx, loupePoint.x, loupePoint.y, loupePoint.localX, loupePoint.localY)
    }
  }

  function clearResultText() {
    els.resultInches.textContent = ''
    els.resultCentimeters.textContent = ''
    els.resultMeta.textContent = ''
    if (els.resultWarning) {
      els.resultWarning.textContent = ''
      els.resultWarning.setAttribute('hidden', '')
    }
    if (els.readout) els.readout.classList.remove('has-warning')
  }

  function warningLines(reading) {
    const lines = []
    if (reading.warningDisagree) lines.push(DISAGREE_WARNING)
    if (reading.warningAngle) lines.push(FLUSH_WARNING)
    if (reading.warningAxis) lines.push(AXIS_MISALIGN_WARNING)
    if (reading.warningScale) lines.push(SCALE_WARNING)
    if (reading.warningFlat) lines.push(TEMPLATE_FLAT_WARNING)
    return lines
  }

  function printScaleMeta() {
    if (referenceKind !== 'template') return ''
    if (templatePrintSource === 'none' || templatePrintStatus === 'unverified' || !(templatePrintScaleValue > 0)) {
      return 'print unverified'
    }
    return `print ×${templatePrintScaleValue.toFixed(2)} (${templatePrintSource})`
  }

  function templateFields() {
    if (referenceKind !== 'template') {
      return {
        printScale: null,
        printScaleSource: 'none',
        markersFound: null,
        markerRmsMm: null,
        warningFlat: false,
      }
    }
    const rms = templateMeta && templateMeta.markerRmsMm
    return {
      printScale: templatePrintSource === 'none' ? 'unverified' : templatePrintScaleValue,
      printScaleSource: templatePrintSource,
      markersFound: templateMeta ? templateMeta.markersFound : null,
      markerRmsMm: rms,
      warningFlat: rms != null && rms > MARKER_RMS_WARN_MM,
    }
  }

  function renderResult(reading) {
    els.resultInches.textContent = `${reading.inches.toFixed(1)} in`
    els.resultCentimeters.textContent = `· ${reading.cm.toFixed(1)} cm`
    els.resultMeta.textContent = reading.meta || ''
    const lines = warningLines(reading)
    if (!els.resultWarning) return
    if (lines.length === 0) {
      els.resultWarning.textContent = ''
      els.resultWarning.setAttribute('hidden', '')
      els.readout.classList.remove('has-warning')
      return
    }
    els.resultWarning.textContent = lines.join(' ')
    els.resultWarning.removeAttribute('hidden')
    els.readout.classList.add('has-warning')
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
  }

  function baseReading(extra) {
    const reading = {
      mode,
      layout: twoRefLayout() ? '2refs' : '1ref',
      reference: referenceToken(currentReference()),
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
      meta: `⊥ width · raw ${rawIn.toFixed(1)} in · axis ${formatAngle(angle)} · ${noun} ${Math.round(cardLongPx)} px · scale ${formatRatio(scaleRatioA)}/${formatRatio(scaleRatioB)}${printClause} · ${captureWidth}×${captureHeight} · tilt β ${formatAngle(captureBeta)} γ ${formatAngle(captureGamma)}`,
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
      meta: `rms ${measured.fitRmsMm.toFixed(1)} mm · drift ${drift.toFixed(2)} · A ${measured.orientA} ${Math.round(measured.refAPx)} px · B ${measured.orientB} ${Math.round(measured.refBPx)} px · ∠ ${formatAngle(angle)}${printClause} · ${captureWidth}×${captureHeight} · tilt β ${formatAngle(captureBeta)} γ ${formatAngle(captureGamma)}`,
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
    const barOverride = Math.abs(templateBarIn - TEMPLATE_LETTER_V1.barIn) > 1e-6 ? templateBarIn : null
    const chosen = choosePrintScale(
      barOverride,
      paper ? paper.longMm : null,
      paper ? paper.shortMm : null
    )
    logDiagnostic(`print_scale ${chosen.status === 'unverified' ? 'unverified' : Number(chosen.printScale).toFixed(4)} source=${chosen.source}`)
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

  function applyTemplateDetection(result) {
    templateMeta = {
      markersFound: result && result.markersFound,
      markerRmsMm: result && result.markerRmsMm,
    }
    if (result && result.print && result.print.source === 'bar') {
      templatePrintScaleValue = result.print.printScale
      templatePrintSource = 'bar'
      templatePrintStatus = result.print.printScale
    } else if (result && result.print && result.print.source === 'paper') {
      templatePrintScaleValue = result.print.printScale
      templatePrintSource = 'paper'
      templatePrintStatus = result.print.printScale
    } else {
      templatePrintScaleValue = 1
      templatePrintSource = 'none'
      templatePrintStatus = 'unverified'
    }
  }

  function placeCardAtTap(tapX, tapY) {
    if (referenceKind === 'template') {
      let found = null
      try {
        found = detectTemplate(tapX, tapY)
      } catch (err) {
        logDiagnostic(`detectTemplate threw: ${errorMessage(err)}`)
        found = null
      }
      applyTemplateDetection(found && found.ok ? found : null)
      if (found && found.ok && found.cardCorners && found.cardCorners.length === 4) {
        cardCorners = found.cardCorners
        originalCorners = found.cardCorners.map(copyPoint)
        detectKind = 'auto'
        detectStrategy = `markers${found.markersFound}`
        const longPx = meanLongEdgePx(orderCorners(cardCorners))
        logDiagnostic(`auto-detected template via ${detectStrategy}: long edge ${Math.round(longPx)} px`)
        showTemporaryInstruction(
          `${referenceNoun(true)} found — check the outer marker corners, then Confirm`,
          DETECT_MESSAGE_HOLD_MS,
          'ok'
        )
      } else {
        cardCorners = defaultQuadAt(tapX, tapY, captureWidth, captureHeight, currentReference())
        originalCorners = cardCorners.map(copyPoint)
        detectKind = 'manual'
        detectStrategy = 'manual'
        const reason = found && found.reason ? found.reason : 'none'
        logDiagnostic(`auto-detect template failed (${reason})`)
        showTemporaryInstruction(
          'Template not found — drag the corners onto the outer marker corners',
          DETECT_MESSAGE_HOLD_MS
        )
      }
      phase = twoRefLayout() && refACorners ? 'adjust-card-b' : 'adjust-card'
      setPrimaryButton()
      renderInstruction()
      drawMarks()
      return
    }
    let found = null
    try {
      found = detectCard(tapX, tapY)
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
      showTemporaryInstruction(
        `${referenceNoun(true)} found — check the corners, then Confirm`,
        DETECT_MESSAGE_HOLD_MS,
        'ok'
      )
    } else {
      cardCorners = defaultQuadAt(tapX, tapY, captureWidth, captureHeight, currentReference())
      originalCorners = cardCorners.map(copyPoint)
      detectKind = 'manual'
      detectStrategy = 'manual'
      const tried = found && found.tried && found.tried.length ? found.tried.join(', ') : 'none'
      logDiagnostic(`auto-detect failed (tried: ${tried})`)
      showTemporaryInstruction(
        `${referenceNoun(true)} not found — drag the corners onto its edges`,
        DETECT_MESSAGE_HOLD_MS
      )
    }
    phase = twoRefLayout() && refACorners ? 'adjust-card-b' : 'adjust-card'
    setPrimaryButton()
    renderInstruction()
    drawMarks()
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
    const result = homographyPixelsToMm(cardCorners, currentReference())
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
      cardCorners = null
      originalCorners = null
      detectKind = 'manual'
      detectStrategy = 'manual'
      homography = null
      phase = 'need-card-b'
      setPrimaryButton()
      if (longPx < SMALL_CARD_PX) showTemporaryInstruction(smallReferenceNote(longPx), MESSAGE_HOLD_MS)
      else {
        instructionHoldUntil = 0
        renderInstruction()
      }
      drawMarks()
      return
    }
    if (twoRefLayout()) {
      refBDetect = kind
      refBStrategy = strategy
      const measured = twoReferenceDestinationMm(refACorners, ordered, currentReference(), mode)
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
      const detect = refADetect === 'manual' || refBDetect === 'manual' ? 'manual' : 'auto'
      finishTwoRef(measured, detect, `${refAStrategy}+${refBStrategy}`)
      return
    }
    homography = result.H
    cardCorners = ordered
    cardLongPx = longPx
    detectKind = kind
    phase = 'point-a'
    setPrimaryButton()
    if (longPx < SMALL_CARD_PX) showTemporaryInstruction(smallReferenceNote(longPx), MESSAGE_HOLD_MS)
    else {
      instructionHoldUntil = 0
      renderInstruction()
    }
    drawMarks()
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
    let bestDist = HANDLE_HIT_RADIUS_PX
    for (let i = 0; i < keys.length; i++) {
      if (!points[keys[i]]) continue
      const dist = handleDistance(localX, localY, points[keys[i]])
      if (dist <= bestDist) {
        bestDist = dist
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
    if (Math.abs(templateBarIn - TEMPLATE_LETTER_V1.barIn) > 1e-6) {
      templatePrintScaleValue = templateBarIn / TEMPLATE_LETTER_V1.barIn
      templatePrintSource = 'bar'
      templatePrintStatus = templatePrintScaleValue
    } else {
      templatePrintScaleValue = 1
      templatePrintSource = 'none'
      templatePrintStatus = 'unverified'
    }
    templateMeta = null
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
    phase = 'need-card-tap'
    setPrimaryButton()
    instructionHoldUntil = 0
    renderInstruction()
    resizeMarks()
    logDiagnostic(`capture ${width}×${height} layout=${layout} ref=${referenceToken(currentReference())} β=${formatAngle(captureBeta)} γ=${formatAngle(captureGamma)}`)
  }

  function retake() {
    endDrag()
    clearCaptureGeometry()
    clearResultText()
    showLive()
    phase = 'live'
    setPrimaryButton()
    instructionHoldUntil = 0
    renderInstruction()
    drawMarks()
    logDiagnostic('retake')
  }

  function resetPoints() {
    endDrag()
    if (twoRefLayout()) {
      if (phase === 'live') return
      refACorners = null
      refBCorners = null
      refADetect = 'manual'
      refBDetect = 'manual'
      refAStrategy = 'manual'
      refBStrategy = 'manual'
      cardCorners = null
      originalCorners = null
      detectKind = 'manual'
      detectStrategy = 'manual'
      homography = null
      cardLongPx = 0
      currentReading = null
      clearResultText()
      phase = 'need-card-tap'
      instructionHoldUntil = 0
      setPrimaryButton()
      renderInstruction()
      drawMarks()
      return
    }
    if (phase === 'live' || phase === 'need-card-tap' || phase === 'adjust-card') {
      points = {a: null, b: null}
      currentReading = null
      clearResultText()
      drawMarks()
      return
    }
    if (!homography) {
      showTemporaryInstruction(needReferenceInstruction(), MESSAGE_HOLD_MS)
      return
    }
    points = {a: null, b: null}
    currentReading = null
    clearResultText()
    phase = 'point-a'
    instructionHoldUntil = 0
    setPrimaryButton()
    renderInstruction()
    drawMarks()
  }

  function onPrimaryButton() {
    if (phase === 'live') {
      if (!cameraReady) {
        startCamera().then(() => {
          if (cameraReady && visionReady) captureFrame()
        })
        return
      }
      if (!visionReady) return
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
    els.measurementSummary.textContent = `Session list (${measurements.length})`
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
      const warn = reading.warningDisagree || reading.warningAngle || reading.warningAxis || reading.warningScale || reading.warningFlat ? ' · warn' : ''
      row.textContent = `${i + 1} · ${reading.mode} · ${reading.layout || '1ref'} · ${reading.reference} ${reading.inches.toFixed(1)} in (${reading.cm.toFixed(1)} cm) · ${noun} ${Math.round(reading.cardLongPx)} px · tilt β ${formatAngle(reading.beta)} γ ${formatAngle(reading.gamma)} · ${reading.detect} · ${strategy}${warn}`
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
      ].join('\t'))
    }
    return `${lines.join('\n')}\n`
  }

  function markCopied() {
    els.copyResultsButton.innerHTML = 'Copied'
    clearTimeout(copyLabelTimer)
    copyLabelTimer = setTimeout(() => {
      els.copyResultsButton.innerHTML = stackedLabel('Copy', 'results')
    }, 1500)
  }

  function selectFallback(text) {
    const area = els.clipboardFallback
    area.value = text
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
    if (copied) markCopied()
    else showTemporaryInstruction('Results are selected. Copy them manually if the button could not.', MESSAGE_HOLD_MS)
  }

  function copyResults() {
    if (measurements.length === 0) {
      showTemporaryInstruction(NEED_SAVED_INSTRUCTION, MESSAGE_HOLD_MS)
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
      printScale: currentReading.printScale,
      printScaleSource: currentReading.printScaleSource,
      markersFound: currentReading.markersFound,
      markerRmsMm: currentReading.markerRmsMm,
    })
    renderList()
    els.logButton.innerHTML = 'Saved'
    clearTimeout(saveLabelTimer)
    saveLabelTimer = setTimeout(() => {
      els.logButton.innerHTML = stackedLabel('Save', 'to list')
    }, 1200)
    const again = twoRefLayout() ? 'Reset refs' : 'Reset points'
    showTemporaryInstruction(`Saved. Press ${again} or Retake for the next reading.`, MESSAGE_HOLD_MS)
  }

  function noteCameraSize() {
    const width = els.preview.videoWidth
    const height = els.preview.videoHeight
    if (!width || !height) return
    const label = `Camera: ${width}×${height}`
    if (els.cameraResolution.textContent === label) return
    els.cameraResolution.textContent = label
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
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      cameraDenied = true
      els.cameraResolution.textContent = 'Camera: unavailable'
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
      els.cameraResolution.textContent = 'Camera: denied'
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
    els.floorModeButton.addEventListener('click', () => setMode('floor'))
    els.wallModeButton.addEventListener('click', () => setMode('wall'))
    if (els.oneRefButton) els.oneRefButton.addEventListener('click', () => setLayout('one'))
    if (els.twoRefButton) els.twoRefButton.addEventListener('click', () => setLayout('two'))
    if (els.referencePickerButton) {
      els.referencePickerButton.addEventListener('click', () => toggleReferencePicker())
    }
    if (els.referencePickerPopover) {
      els.referencePickerPopover.addEventListener('click', (event) => {
        const option = event.target.closest('[data-reference]')
        if (!option) return
        setReference(option.getAttribute('data-reference'))
      })
    }
    if (els.templateBarIn) {
      els.templateBarIn.addEventListener('change', () => {
        readTemplateBarField()
        resetTemplateScale()
        logDiagnostic(`bar measured ${templateBarIn.toFixed(2)} in`)
      })
    }
    if (els.customApplyButton) els.customApplyButton.addEventListener('click', () => applyCustomReference())
    if (els.customLongIn) {
      els.customLongIn.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        applyCustomReference()
      })
    }
    if (els.customShortIn) {
      els.customShortIn.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        applyCustomReference()
      })
    }
    els.instructionText.addEventListener('click', () => toggleInstructionExpanded())
    els.instructionText.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      toggleInstructionExpanded()
    })
    els.captureButton.addEventListener('click', () => onPrimaryButton())
    els.resetPointsButton.addEventListener('click', () => resetPoints())
    els.logButton.addEventListener('click', () => saveReading())
    els.copyResultsButton.addEventListener('click', () => copyResults())
    els.stage.addEventListener('pointerdown', onStagePointerDown)
    els.stage.addEventListener('pointermove', onStagePointerMove)
    els.stage.addEventListener('pointerup', onStagePointerUp)
    els.stage.addEventListener('pointercancel', onStagePointerUp)
    els.preview.addEventListener('loadedmetadata', () => {
      noteCameraSize()
      resizeMarks()
    })
    // videoWidth/videoHeight can swap after rotation; refit the contain mapping.
    els.preview.addEventListener('resize', () => {
      noteCameraSize()
      resizeMarks()
    })
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)
    window.addEventListener('pagehide', () => stopCamera())
    if (els.enableTiltButton) {
      els.enableTiltButton.addEventListener('click', () => requestTiltPermission())
    }
    if (els.statusToggle) {
      els.statusToggle.addEventListener('click', () => {
        const open = !els.statusStrip || els.statusStrip.hasAttribute('hidden')
        setStatusOpen(open)
      })
    }
    if (els.sheetHandle) {
      els.sheetHandle.addEventListener('click', () => {
        const expanded = !(els.readout && els.readout.classList.contains('is-expanded'))
        setSheetExpanded(expanded)
      })
    }
  }

  function onViewportChange() {
    refreshButtonLabels()
    positionChrome()
    resizeMarks()
    requestAnimationFrame(() => {
      positionChrome()
      resizeMarks()
    })
  }

  function startApp() {
    cacheElements()
    bindControls()
    positionChrome()
    resizeMarks()
    renderTilt()
    refreshButtonLabels()
    renderInstruction()
    logDiagnostic('reference.js loaded')
    const ar = arucoApi()
    logDiagnostic(ar && typeof ar.Detector === 'function' ? 'js-aruco2 ready' : 'js-aruco2 missing')

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      els.enableTiltButton.hidden = false
    } else {
      bindOrientation()
    }

    const opencvScript = document.querySelector('script[src*="opencv"]')
    if (opencvScript) {
      opencvScript.addEventListener('error', () => {
        visionFailed = true
        els.visionStatus.textContent = 'Vision library failed to load'
        setPrimaryButton()
        logDiagnostic('opencv script error')
      })
    }

    waitForOpenCv().then(() => {
      visionReady = true
      els.visionStatus.textContent = 'Vision ready'
      setPrimaryButton()
      logDiagnostic('OpenCV.js ready')
    }).catch((err) => {
      visionFailed = true
      els.visionStatus.textContent = 'Vision library failed to load'
      setPrimaryButton()
      logDiagnostic(`OpenCV.js: ${errorMessage(err)}`)
    })

    startCamera()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp)
  } else {
    startApp()
  }
}
