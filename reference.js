// Still-image reference measurement: planar homography from a credit card
// or a US Letter sheet to two taps, in millimetres. No SLAM. Pure geometry
// is at the top so Node can require this file and check the math without a browser.

const CARD_LONG_MM = 85.60
const CARD_SHORT_MM = 53.98
const LETTER_LONG_MM = 279.4
const LETTER_SHORT_MM = 215.9
const MM_PER_INCH = 25.4
const HANDLE_HIT_PX = 28
const LOUPE_SIZE_PX = 120
const LOUPE_OFFSET_Y = 90
const LOUPE_MAGNIFY = 3
const SMALL_CARD_PX = 120
const MANUAL_DRAG_PX = 3
const DIAGNOSTIC_CAP = 60
const FLASH_HOLD_MS = 1100
const MESSAGE_HOLD_MS = 1700
// Dashed live guide: long edge is this many capture-image pixels, drawn
// through the same contain-fit as the preview so the box is a real size.
const GUIDE_LONG_EDGE_PX = 150

// ratio is long/short. The detect band is ratio × 0.82 … ratio × 1.20.
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

const FLOOR_LIVE_INSTRUCTION = 'Lay the card (or sheet) on the floor between the jambs. Step back so both jambs and the card are in view, then Capture.'
const WALL_LIVE_INSTRUCTION = 'Hold the card flat on the wall. Get the floor line and the height mark in view, then Capture.'
const CAMERA_DENIED_INSTRUCTION = 'Camera permission was denied. Reload the page and allow camera access.'
const NEED_BOTH_INSTRUCTION = 'Place both points before saving.'
const NEED_SAVED_INSTRUCTION = 'Save a measurement to the list first.'
const MODE_LOCKED_INSTRUCTION = 'Mode can only be changed before Capture.'
const REFERENCE_LOCKED_INSTRUCTION = 'Reference can only be changed before Capture.'

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CARD_LONG_MM,
    CARD_SHORT_MM,
    LETTER_LONG_MM,
    LETTER_SHORT_MM,
    CARD_REF,
    LETTER_REF,
    MM_PER_INCH,
    orderCorners,
    isoDestinationMm,
    referenceDestinationMm,
    meanLongEdgePx,
    solveHomography,
    applyHomography,
    planarDistanceMm,
    homographyPixelsToMm,
    defaultQuadAt,
  }
}

if (typeof document !== 'undefined') {
  bootReferenceApp()
}

function bootReferenceApp() {
  const els = {}
  const measurements = []
  const diagnosticLines = []
  const captureCanvas = document.createElement('canvas')
  const captureCtx = captureCanvas.getContext('2d')

  let phase = 'live'
  let mode = 'floor'
  let referenceKind = 'card'
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
  let detectKind = 'manual'
  let homography = null
  let cardLongPx = 0
  let pointA = null
  let pointB = null
  let currentReading = null
  let dragTarget = null
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
    els.visionStatus = document.getElementById('visionStatus')
    els.cameraResolution = document.getElementById('cameraResolution')
    els.tiltAngles = document.getElementById('tiltAngles')
    els.enableTiltButton = document.getElementById('enableTiltButton')
    els.floorModeButton = document.getElementById('floorModeButton')
    els.wallModeButton = document.getElementById('wallModeButton')
    els.cardReferenceButton = document.getElementById('cardReferenceButton')
    els.letterReferenceButton = document.getElementById('letterReferenceButton')
    els.captureButton = document.getElementById('captureButton')
    els.resetPointsButton = document.getElementById('resetPointsButton')
    els.logButton = document.getElementById('logButton')
    els.copyResultsButton = document.getElementById('copyResultsButton')
    els.resultInches = document.getElementById('resultInches')
    els.resultCentimeters = document.getElementById('resultCentimeters')
    els.resultMeta = document.getElementById('resultMeta')
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
    return referenceKind === 'letter' ? LETTER_REF : CARD_REF
  }

  // Spoken noun in prompts. The Letter reference is a sheet, not a card.
  function referenceNoun(capitalized) {
    const word = referenceKind === 'letter' ? 'sheet' : 'card'
    if (!capitalized) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  }

  function formatAngle(value) {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${value.toFixed(1)}°`
  }

  function renderTilt() {
    if (!els.tiltAngles) return
    els.tiltAngles.textContent = `β ${formatAngle(beta)} · γ ${formatAngle(gamma)}`
  }

  function isLandscapeLayout() {
    return window.matchMedia('(orientation: landscape)').matches
  }

  // Portrait keeps the two-line labels so four buttons fit one row.
  // Landscape stacks them, so a single line is enough.
  function stackedLabel(line1, line2) {
    if (isLandscapeLayout()) return `${line1} ${line2}`
    return `${line1}<br>${line2}`
  }

  function pointAInstruction() {
    if (mode === 'wall') return 'Tap point A (floor line)'
    return 'Tap point A (left jamb at the floor)'
  }

  function pointBInstruction() {
    if (mode === 'wall') return 'Tap point B (top of handrail or mark)'
    return 'Tap point B (right jamb at the floor)'
  }

  function tapReferenceInstruction() {
    return `Tap the ${referenceNoun(false)}`
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

  function instructionForState() {
    if (cameraDenied) return CAMERA_DENIED_INSTRUCTION
    if (phase === 'live') return mode === 'wall' ? WALL_LIVE_INSTRUCTION : FLOOR_LIVE_INSTRUCTION
    if (phase === 'need-card-tap') return tapReferenceInstruction()
    if (phase === 'adjust-card') return adjustReferenceInstruction()
    if (phase === 'point-a') return pointAInstruction()
    if (phase === 'point-b') return pointBInstruction()
    return 'Result is on screen. Save to list, or Retake / Reset points.'
  }

  function renderInstruction() {
    if (performance.now() < instructionHoldUntil) return
    const el = els.instructionText
    if (!el) return
    el.classList.remove('is-flashing')
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
    // The line's height changes the stage; refit the guide to the new box.
    if (was !== expanded) resizeMarks()
  }

  function toggleInstructionExpanded() {
    const el = els.instructionText
    if (!el) return
    setInstructionExpanded(!el.classList.contains('is-expanded'))
  }

  function showTemporaryInstruction(text, holdMs) {
    const el = els.instructionText
    el.textContent = text
    setInstructionExpanded(false)
    el.classList.remove('is-flashing')
    void el.offsetWidth
    el.classList.add('is-flashing')
    instructionHoldUntil = performance.now() + holdMs
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

  function setReference(next) {
    if (phase !== 'live') {
      showTemporaryInstruction(REFERENCE_LOCKED_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    referenceKind = next === 'letter' ? 'letter' : 'card'
    els.cardReferenceButton.setAttribute('aria-pressed', referenceKind === 'card' ? 'true' : 'false')
    els.letterReferenceButton.setAttribute('aria-pressed', referenceKind === 'letter' ? 'true' : 'false')
    drawMarks()
    logDiagnostic(`reference ${referenceKind}`)
  }

  function setPrimaryButton() {
    const button = els.captureButton
    const locked = phase !== 'live'
    els.floorModeButton.disabled = locked
    els.wallModeButton.disabled = locked
    if (els.cardReferenceButton) els.cardReferenceButton.disabled = locked
    if (els.letterReferenceButton) els.letterReferenceButton.disabled = locked
    if (phase === 'live') {
      button.innerHTML = 'Capture'
      // Stay tappable while the camera starts so iOS can grant getUserMedia
      // from this tap. Vision still has to finish loading first.
      button.disabled = !visionReady
    } else if (phase === 'adjust-card') {
      button.innerHTML = stackedLabel('Confirm', referenceNoun(false))
      button.disabled = false
    } else {
      button.innerHTML = 'Retake'
      button.disabled = false
    }
  }

  function refreshButtonLabels() {
    setPrimaryButton()
    if (els.resetPointsButton && els.resetPointsButton.textContent !== 'Resetting') {
      els.resetPointsButton.innerHTML = stackedLabel('Reset', 'points')
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
    let ly = localY - LOUPE_OFFSET_Y
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
    ctx.moveTo(lx - 12, ly)
    ctx.lineTo(lx + 12, ly)
    ctx.moveTo(lx, ly - 12)
    ctx.lineTo(lx, ly + 12)
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
    if (captionY > ctx.canvas.height - 22) captionY = corners[0].y + 8
    strokeOutlinedText(ctx, caption, captionX, captionY)
    if (window.innerHeight > window.innerWidth) {
      ctx.textBaseline = 'bottom'
      strokeOutlinedText(ctx, 'Turn sideways for a wider shot', ctx.canvas.width / 2, ctx.canvas.height - 10)
    }
    ctx.restore()
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

    if (cardCorners && cardCorners.length === 4) {
      ctx.beginPath()
      const first = imageToLocal(cardCorners[0].x, cardCorners[0].y)
      ctx.moveTo(first.x, first.y)
      for (let i = 1; i < 4; i++) {
        const p = imageToLocal(cardCorners[i].x, cardCorners[i].y)
        ctx.lineTo(p.x, p.y)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 225, 74, 0.12)'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffe14a'
      ctx.stroke()
      if (phase === 'adjust-card' || phase === 'need-card-tap') {
        for (let i = 0; i < 4; i++) {
          const p = imageToLocal(cardCorners[i].x, cardCorners[i].y)
          drawHandle(ctx, p.x, p.y)
        }
      }
    }

    if (pointA) {
      const a = imageToLocal(pointA.x, pointA.y)
      drawHandle(ctx, a.x, a.y)
    }
    if (pointB) {
      const b = imageToLocal(pointB.x, pointB.y)
      drawHandle(ctx, b.x, b.y)
    }
    if (pointA && pointB) {
      const a = imageToLocal(pointA.x, pointA.y)
      const b = imageToLocal(pointB.x, pointB.y)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffe14a'
      ctx.stroke()
    }

    if (loupePoint) {
      drawLoupe(ctx, loupePoint.x, loupePoint.y, loupePoint.localX, loupePoint.localY)
    }
  }

  function clearResultText() {
    els.resultInches.textContent = ''
    els.resultCentimeters.textContent = ''
    els.resultMeta.textContent = ''
  }

  function renderResult(reading) {
    els.resultInches.textContent = `${reading.inches.toFixed(1)} in`
    els.resultCentimeters.textContent = `(${reading.cm.toFixed(1)} cm)`
    const noun = reading.reference === 'letter' ? 'sheet' : 'card'
    els.resultMeta.textContent = `${noun} ${Math.round(reading.cardLongPx)} px · ${reading.imageW}×${reading.imageH} · tilt β ${formatAngle(reading.beta)} γ ${formatAngle(reading.gamma)}`
  }

  function finishMeasurement() {
    if (!homography || !pointA || !pointB) return
    const mm = planarDistanceMm(homography, pointA, pointB)
    if (mm == null || !Number.isFinite(mm)) {
      showTemporaryInstruction(homographyFailInstruction(), MESSAGE_HOLD_MS)
      return
    }
    const inches = inchesFromMm(mm)
    currentReading = {
      mode,
      reference: referenceKind,
      mm,
      inches,
      cm: mm / 10,
      cardLongPx,
      imageW: captureWidth,
      imageH: captureHeight,
      beta: captureBeta,
      gamma: captureGamma,
      detect: detectIsManual() ? 'manual' : detectKind,
    }
    renderResult(currentReading)
    phase = 'result'
    instructionHoldUntil = 0
    setPrimaryButton()
    renderInstruction()
    drawMarks()
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

  function clipRoi(tapX, tapY, imgW, imgH) {
    const shortSide = Math.min(imgW, imgH)
    let side = 0.35 * shortSide
    if (side < 32) side = Math.min(shortSide, 32)
    if (side > imgW) side = imgW
    if (side > imgH) side = imgH
    let x = tapX - side / 2
    let y = tapY - side / 2
    if (x < 0) x = 0
    if (y < 0) y = 0
    if (x + side > imgW) x = imgW - side
    if (y + side > imgH) y = imgH - side
    return {
      x: Math.max(0, Math.floor(x)),
      y: Math.max(0, Math.floor(y)),
      width: Math.max(1, Math.floor(side)),
      height: Math.max(1, Math.floor(side)),
    }
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
    const mat = cv.matFromArray(count, 1, cv.CV_32SC2, xy)
    const line = new cv.Mat()
    cv.fitLine(mat, line, cv.DIST_L2, 0, 0.01, 0.01)
    const vx = line.data32F[0]
    const vy = line.data32F[1]
    const x0 = line.data32F[2]
    const y0 = line.data32F[3]
    mat.delete()
    line.delete()
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return lineFromSegment(p0, p1)
    return {vx, vy, x0, y0}
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

  function detectCard(tapX, tapY) {
    if (typeof cv === 'undefined' || !cv || typeof cv.imread !== 'function') return null
    const src = cv.imread(captureCanvas)
    const gray = new cv.Mat()
    const blur = new cv.Mat()
    const canny = new cv.Mat()
    const dilated = new cv.Mat()
    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    let kernel = null
    let roi = null
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
      cv.Canny(blur, canny, 50, 150)
      kernel = cv.Mat.ones(3, 3, cv.CV_8U)
      cv.dilate(canny, dilated, kernel)
      const imgW = src.cols
      const imgH = src.rows
      const box = clipRoi(tapX, tapY, imgW, imgH)
      const rect = new cv.Rect(box.x, box.y, box.width, box.height)
      roi = dilated.roi(rect)
      cv.findContours(roi, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
      const minArea = 0.005 * box.width * box.height
      const tapInRoi = new cv.Point(tapX - box.x, tapY - box.y)
      let best = null
      let bestArea = 0
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)
        if (area < minArea) {
          contour.delete()
          continue
        }
        const approx = new cv.Mat()
        const peri = cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, 0.02 * peri, true)
        const quad = readQuadPoints(approx)
        let keep = false
        if (quad && cv.isContourConvex(approx)) {
          const rotated = cv.minAreaRect(approx)
          const long = Math.max(rotated.size.width, rotated.size.height)
          const short = Math.min(rotated.size.width, rotated.size.height)
          const ratio = short > 1 ? long / short : 0
          const contains = cv.pointPolygonTest(approx, tapInRoi, false) >= 0
          const spec = currentReference()
          const minRatio = spec.ratio * 0.82
          const maxRatio = spec.ratio * 1.20
          if (ratio >= minRatio && ratio <= maxRatio && contains) keep = true
        }
        if (keep && area > bestArea) {
          bestArea = area
          best = quad.map((p) => point(p.x + box.x, p.y + box.y))
        }
        approx.delete()
        contour.delete()
      }
      if (!best) return null
      return refineCorners(canny, orderCorners(best))
    } finally {
      src.delete()
      gray.delete()
      blur.delete()
      canny.delete()
      dilated.delete()
      contours.delete()
      hierarchy.delete()
      if (kernel) kernel.delete()
      if (roi) roi.delete()
    }
  }

  function placeCardAtTap(tapX, tapY) {
    let corners = null
    try {
      corners = detectCard(tapX, tapY)
    } catch (err) {
      logDiagnostic(`detect threw: ${errorMessage(err)}`)
      corners = null
    }
    if (corners && corners.length === 4) {
      cardCorners = corners
      originalCorners = corners.map(copyPoint)
      detectKind = 'auto'
      const longPx = meanLongEdgePx(orderCorners(cardCorners))
      logDiagnostic(`${referenceNoun(false)} auto-detected: long edge ${Math.round(longPx)} px`)
    } else {
      cardCorners = defaultQuadAt(tapX, tapY, captureWidth, captureHeight, currentReference())
      originalCorners = cardCorners.map(copyPoint)
      detectKind = 'manual'
      logDiagnostic(`${referenceNoun(false)} auto-detect failed`)
      showTemporaryInstruction(`Drag the corners onto the ${referenceNoun(false)}'s edges`, MESSAGE_HOLD_MS)
    }
    phase = 'adjust-card'
    setPrimaryButton()
    renderInstruction()
    drawMarks()
  }

  function confirmCard() {
    if (!cardCorners || cardCorners.length !== 4) {
      showTemporaryInstruction(tapReferenceInstruction(), MESSAGE_HOLD_MS)
      return
    }
    const result = homographyPixelsToMm(cardCorners, currentReference())
    if (!result || !result.H) {
      showTemporaryInstruction(homographyFailInstruction(), MESSAGE_HOLD_MS)
      return
    }
    homography = result.H
    cardCorners = result.ordered
    cardLongPx = result.cardLongPx
    if (detectIsManual()) detectKind = 'manual'
    logDiagnostic(`${referenceNoun(false)} confirmed: long edge ${Math.round(cardLongPx)} px detect=${detectKind}`)
    phase = 'point-a'
    setPrimaryButton()
    if (cardLongPx < SMALL_CARD_PX) {
      showTemporaryInstruction(
        `${referenceNoun(true)} is small in the image (${Math.round(cardLongPx)} px). Retake closer for better accuracy.`,
        MESSAGE_HOLD_MS
      )
    } else {
      instructionHoldUntil = 0
      renderInstruction()
    }
    drawMarks()
  }

  function hitHandle(localX, localY, imagePoint) {
    const screen = imageToLocal(imagePoint.x, imagePoint.y)
    return hypot2(localX, localY, screen.x, screen.y) <= HANDLE_HIT_PX / 2
  }

  function onStagePointerDown(event) {
    if (phase === 'live') return
    event.preventDefault()
    els.stage.setPointerCapture(event.pointerId)
    const loc = clientToImage(event.clientX, event.clientY)
    if (phase === 'need-card-tap') {
      placeCardAtTap(loc.x, loc.y)
      return
    }
    if (phase === 'adjust-card' && cardCorners) {
      for (let i = 0; i < 4; i++) {
        if (hitHandle(loc.localX, loc.localY, cardCorners[i])) {
          dragTarget = {kind: 'corner', index: i}
          loupePoint = {x: cardCorners[i].x, y: cardCorners[i].y, localX: loc.localX, localY: loc.localY}
          drawMarks()
          return
        }
      }
      return
    }
    if (phase === 'point-a' || phase === 'point-b' || phase === 'result') {
      if (pointA && hitHandle(loc.localX, loc.localY, pointA)) {
        dragTarget = {kind: 'a'}
        loupePoint = {x: pointA.x, y: pointA.y, localX: loc.localX, localY: loc.localY}
        drawMarks()
        return
      }
      if (pointB && hitHandle(loc.localX, loc.localY, pointB)) {
        dragTarget = {kind: 'b'}
        loupePoint = {x: pointB.x, y: pointB.y, localX: loc.localX, localY: loc.localY}
        drawMarks()
        return
      }
      if (phase === 'point-a' && !pointA) {
        pointA = point(loc.x, loc.y)
        phase = 'point-b'
        instructionHoldUntil = 0
        renderInstruction()
        drawMarks()
        return
      }
      if (phase === 'point-b' && !pointB) {
        pointB = point(loc.x, loc.y)
        finishMeasurement()
      }
    }
  }

  function onStagePointerMove(event) {
    if (!dragTarget) return
    event.preventDefault()
    const loc = clientToImage(event.clientX, event.clientY)
    if (dragTarget.kind === 'corner') {
      cardCorners[dragTarget.index] = point(loc.x, loc.y)
      loupePoint = {x: loc.x, y: loc.y, localX: loc.localX, localY: loc.localY}
    } else if (dragTarget.kind === 'a') {
      pointA = point(loc.x, loc.y)
      loupePoint = {x: loc.x, y: loc.y, localX: loc.localX, localY: loc.localY}
    } else if (dragTarget.kind === 'b') {
      pointB = point(loc.x, loc.y)
      loupePoint = {x: loc.x, y: loc.y, localX: loc.localX, localY: loc.localY}
    }
    drawMarks()
  }

  function onStagePointerUp(event) {
    if (!dragTarget) return
    event.preventDefault()
    const was = dragTarget
    dragTarget = null
    loupePoint = null
    if ((was.kind === 'a' || was.kind === 'b') && pointA && pointB && homography) {
      finishMeasurement()
    } else {
      drawMarks()
    }
  }

  function showStill() {
    els.stage.classList.add('is-still')
  }

  function showLive() {
    els.stage.classList.remove('is-still')
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
    cardCorners = null
    originalCorners = null
    homography = null
    cardLongPx = 0
    pointA = null
    pointB = null
    currentReading = null
    detectKind = 'manual'
    clearResultText()
    showStill()
    phase = 'need-card-tap'
    setPrimaryButton()
    instructionHoldUntil = 0
    renderInstruction()
    resizeMarks()
    logDiagnostic(`capture ${width}×${height} ref=${referenceKind} β=${formatAngle(captureBeta)} γ=${formatAngle(captureGamma)}`)
  }

  function retake() {
    cardCorners = null
    originalCorners = null
    homography = null
    cardLongPx = 0
    pointA = null
    pointB = null
    currentReading = null
    dragTarget = null
    loupePoint = null
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
    if (phase === 'live' || phase === 'need-card-tap' || phase === 'adjust-card') {
      pointA = null
      pointB = null
      currentReading = null
      clearResultText()
      drawMarks()
      return
    }
    if (!homography) {
      showTemporaryInstruction(needReferenceInstruction(), MESSAGE_HOLD_MS)
      return
    }
    pointA = null
    pointB = null
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
    if (phase === 'adjust-card') {
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
      const noun = reading.reference === 'letter' ? 'sheet' : 'card'
      row.textContent = `${i + 1} · ${reading.mode} · ${reading.reference} ${reading.inches.toFixed(1)} in (${reading.cm.toFixed(1)} cm) · ${noun} ${Math.round(reading.cardLongPx)} px · tilt β ${formatAngle(reading.beta)} γ ${formatAngle(reading.gamma)} · ${reading.detect}`
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
      showTemporaryInstruction(NEED_BOTH_INSTRUCTION, MESSAGE_HOLD_MS)
      return
    }
    measurements.push({
      mode: currentReading.mode,
      reference: currentReading.reference,
      inches: currentReading.inches,
      cm: currentReading.cm,
      cardLongPx: currentReading.cardLongPx,
      imageW: currentReading.imageW,
      imageH: currentReading.imageH,
      beta: currentReading.beta,
      gamma: currentReading.gamma,
      detect: currentReading.detect,
    })
    renderList()
    els.logButton.innerHTML = 'Saved'
    clearTimeout(saveLabelTimer)
    saveLabelTimer = setTimeout(() => {
      els.logButton.innerHTML = stackedLabel('Save', 'to list')
    }, 1200)
    showTemporaryInstruction('Saved. Press Reset points or Retake for the next reading.', MESSAGE_HOLD_MS)
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
    els.cardReferenceButton.addEventListener('click', () => setReference('card'))
    els.letterReferenceButton.addEventListener('click', () => setReference('letter'))
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
  }

  function onViewportChange() {
    refreshButtonLabels()
    resizeMarks()
    requestAnimationFrame(() => resizeMarks())
  }

  function startApp() {
    cacheElements()
    bindControls()
    resizeMarks()
    renderTilt()
    refreshButtonLabels()
    renderInstruction()
    logDiagnostic('reference.js loaded')

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
