// Door-width prototype: two floor taps, metric distance, session log in memory only.

const INCHES_PER_METER = 39.3701
const DOM_WRITE_INTERVAL_MS = 200
const SINGLE_TAP_DELAY_MS = 80
const FLASH_HOLD_MS = 1100
const MESSAGE_HOLD_MS = 1700
const DIAGNOSTIC_CAP = 60
const FRAME_LOG_INTERVAL = 300
// Floor width scales with camera height. NORMAL can still be drifting, so taps
// wait until height has held inside this band for the whole window.
const STABILITY_WINDOW_MS = 8000
const STABILITY_TOLERANCE_M = 0.05
// A camera under 30 cm is not a hand-held height, so it is not settled scale.
const STABILITY_MIN_Y_M = 0.3
const CALIBRATION_MIN_INCHES = 12
const CALIBRATION_MAX_INCHES = 80

const WAIT_INSTRUCTION = 'Point at the floor, then push the phone forward and pull it back until tracking is NORMAL'
const LEFT_INSTRUCTION = 'Tap where the LEFT jamb meets the floor'
const RIGHT_INSTRUCTION = 'Tap where the RIGHT jamb meets the floor'
const RESULT_INSTRUCTION = 'Result is on screen. Save to list, or tap the floor to measure again.'
const CAMERA_DENIED_INSTRUCTION = 'Camera permission was denied. Reload the page and allow camera access.'
const BROWSER_TOO_OLD_INSTRUCTION = 'This browser is too old for the prototype. Use Safari on iOS 16.4 or newer, or Chrome on Android.'
const NOT_NORMAL_INSTRUCTION = 'Tracking must be NORMAL before you tap. Push the phone forward and pull it back.'
const SCALE_SETTLING_INSTRUCTION = 'Hold on — scale is still settling. Keep the floor in view and move the phone forward and back.'
const MISS_INSTRUCTION = 'Tap on the floor, not the wall'
const NEED_BOTH_INSTRUCTION = 'Place both jamb points before saving.'
const NEED_SAVED_INSTRUCTION = 'Save a measurement to the list first.'
const CALIBRATION_RANGE_INSTRUCTION = 'Enter the tape-measured phone height in inches (12–80)'
const CALIBRATION_WAIT_INSTRUCTION = 'Wait for scale stable before calibrating'

const els = {}
const measurements = []
const diagnosticLines = []

let scene = null
let camera = null
let raycaster = null
let tapNdc = null
let floorPlane = null
let markerGeometry = null
let markerMaterial = null
let lineMaterial = null

let trackingStatus = ''
let trackingReason = ''
let cameraDenied = false
let browserTooOld = false
let lastDomWriteMs = 0
let instructionHoldUntil = 0
let singleTapTimer = 0
let copyLabelTimer = 0
let saveLabelTimer = 0
let controlsBound = false
let listenersBound = false
let loggingDiagnostic = false
let frameCount = 0
let loggedFirstUpdate = false
const heightHistory = []
let scaleStable = false
let heightSpanMs = 0
// Session only. Reset does not clear this; recenter keeps the ratio because
// it is a tape measure, not a map point. A reload drops it (no persistence).
let calibration = null

let pointA = null
let pointB = null
let featureA = null
let featureB = null
let sphereA = null
let sphereB = null
let measureLine = null
let currentReading = null

function cacheElements() {
  els.overlay = document.getElementById('overlay')
  els.trackingStatus = document.getElementById('trackingStatus')
  els.cameraHeight = document.getElementById('cameraHeight')
  els.instructionText = document.getElementById('instructionText')
  els.resultInches = document.getElementById('resultInches')
  els.resultCentimeters = document.getElementById('resultCentimeters')
  els.resultRaw = document.getElementById('resultRaw')
  els.resultSecondary = document.getElementById('resultSecondary')
  els.calibrationSummary = document.getElementById('calibrationSummary')
  els.actualHeightInput = document.getElementById('actualHeightInput')
  els.applyCalibrationButton = document.getElementById('applyCalibrationButton')
  els.resetButton = document.getElementById('resetButton')
  els.recenterButton = document.getElementById('recenterButton')
  els.logButton = document.getElementById('logButton')
  els.copyResultsButton = document.getElementById('copyResultsButton')
  els.measurementSummary = document.getElementById('measurementSummary')
  els.measurementRows = document.getElementById('measurementRows')
  els.clipboardFallback = document.getElementById('clipboardFallback')
  els.diagnosticsPanel = document.getElementById('diagnosticsPanel')
  els.diagnosticsSummary = document.getElementById('diagnosticsSummary')
  renderDiagnostics()
}

function logDiagnostic(text) {
  const seconds = (performance.now() / 1000).toFixed(1)
  diagnosticLines.push(`[+${seconds}s] ${text}`)
  if (diagnosticLines.length > DIAGNOSTIC_CAP) diagnosticLines.shift()
  // Rendering the log touches the DOM. A throw there would re-enter the
  // window error listener, which logs by calling this again.
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

// Loading-layer taps must pass through until the camera runs.
function markOverlayLive() {
  const overlay = document.getElementById('overlay')
  if (overlay) overlay.classList.add('is-live')
}

function explainBrowserTooOld() {
  browserTooOld = true
  instructionHoldUntil = 0
  const overlay = document.getElementById('overlay')
  const instruction = document.getElementById('instructionText')
  if (!overlay || !instruction) return
  markOverlayLive()
  instruction.classList.remove('is-flashing')
  instruction.textContent = BROWSER_TOO_OLD_INSTRUCTION
  // The XRExtras loading layer is z-index 800 and stays up if XR8.run never
  // starts. Lift the overlay so this line is what the tester actually sees.
  overlay.style.zIndex = '2000'
  overlay.style.background = '#101118'
}

function inchesFromMeters(meters) {
  return meters * INCHES_PER_METER
}

function formatHeight(meters) {
  return `${meters.toFixed(2)} m / ${inchesFromMeters(meters).toFixed(1)} in`
}

function instructionForState() {
  if (browserTooOld) return BROWSER_TOO_OLD_INSTRUCTION
  if (cameraDenied) return CAMERA_DENIED_INSTRUCTION
  if (currentReading) return RESULT_INSTRUCTION
  if (trackingStatus !== 'NORMAL') return WAIT_INSTRUCTION
  // Green NORMAL is not enough: a moving scale still stretches the floor width.
  if (!scaleStable) return SCALE_SETTLING_INSTRUCTION
  if (!pointA) return LEFT_INSTRUCTION
  return RIGHT_INSTRUCTION
}

function renderInstruction() {
  if (performance.now() < instructionHoldUntil) return
  const el = els.instructionText
  el.classList.remove('is-flashing')
  const next = instructionForState()
  if (el.textContent !== next) el.textContent = next
}

function showTemporaryInstruction(text, holdMs) {
  const el = els.instructionText
  el.textContent = text
  el.classList.remove('is-flashing')
  // Restart the animation if a second rejected tap arrives while it is running.
  void el.offsetWidth
  el.classList.add('is-flashing')
  instructionHoldUntil = performance.now() + holdMs
}

function settlingSecondsRemaining() {
  const remainingMs = STABILITY_WINDOW_MS - heightSpanMs
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / 1000)
}

function statusLabel() {
  if (!trackingStatus) return 'NO STATUS YET'
  if (trackingStatus === 'NORMAL') {
    if (scaleStable) return 'NORMAL · scale stable'
    return `NORMAL · scale settling (${settlingSecondsRemaining()}s)`
  }
  if (trackingReason) return `${trackingStatus} — ${trackingReason}`
  return trackingStatus
}

function renderTrackingReadout() {
  const label = statusLabel()
  if (els.trackingStatus.textContent !== label) els.trackingStatus.textContent = label
  // Amber until the window is actually steady. NORMAL alone stays unsettled.
  els.trackingStatus.classList.toggle('is-normal', scaleStable)
  els.cameraHeight.textContent = camera ? formatHeight(camera.position.y) : '— m / — in'
  renderInstruction()
}

function renderResult(reading) {
  const showCorrected = reading.correctedFloorMeters != null
  const displayMeters = showCorrected ? reading.correctedFloorMeters : reading.floorMeters
  els.resultInches.textContent = `${inchesFromMeters(displayMeters).toFixed(1)} in`
  els.resultCentimeters.textContent = `(${(displayMeters * 100).toFixed(1)} cm)`
  if (showCorrected) {
    els.resultRaw.textContent = `raw ${inchesFromMeters(reading.floorMeters).toFixed(1)} in · ratio ${reading.ratio.toFixed(2)}`
  } else {
    els.resultRaw.textContent = `uncalibrated · est. height ${reading.cameraHeightMeters.toFixed(2)} m`
  }
  if (reading.featureMeters == null) {
    els.resultSecondary.textContent = 'feature hit: none'
  } else if (reading.correctedFeatureMeters != null) {
    const correctedIn = inchesFromMeters(reading.correctedFeatureMeters).toFixed(1)
    const rawIn = inchesFromMeters(reading.featureMeters).toFixed(1)
    els.resultSecondary.textContent = `feature hit: ${correctedIn} in (raw ${rawIn})`
  } else {
    els.resultSecondary.textContent = `feature hit: ${inchesFromMeters(reading.featureMeters).toFixed(1)} in`
  }
}

function clearResultText() {
  els.resultInches.textContent = ''
  els.resultCentimeters.textContent = ''
  els.resultRaw.textContent = ''
  els.resultSecondary.textContent = ''
}

function removeObject(object) {
  if (!object || !scene) return
  scene.remove(object)
  if (object.geometry && object.geometry !== markerGeometry) object.geometry.dispose()
}

function clearMeasurement() {
  clearTimeout(singleTapTimer)
  singleTapTimer = 0
  removeObject(sphereA)
  removeObject(sphereB)
  removeObject(measureLine)
  sphereA = null
  sphereB = null
  measureLine = null
  pointA = null
  pointB = null
  featureA = null
  featureB = null
  currentReading = null
  instructionHoldUntil = 0
  clearResultText()
  renderInstruction()
}

function recenterTracking() {
  // recenter() rebuilds the world origin. Markers from the old origin would
  // look like drift, so the points are cleared with the map. The height
  // history is the old map's scale and has to start over. Calibration stays.
  XR8.XrController.recenter()
  clearScaleHistory()
  clearMeasurement()
  if (els.trackingStatus) renderTrackingReadout()
}

function placeSphere(position) {
  const mesh = new THREE.Mesh(markerGeometry, markerMaterial)
  mesh.position.copy(position)
  scene.add(mesh)
  return mesh
}

function placeLine(a, b) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b])
  geometry.computeBoundingSphere()
  const line = new THREE.Line(geometry, lineMaterial)
  scene.add(line)
  return line
}

function nearestFeatureHit(normX, normY) {
  // hitTest coordinates are the fraction of the camera feed from the top-left.
  // The nearest returned feature is the secondary distance, compared later.
  const hits = XR8.XrController.hitTest(normX, normY, [
    'FEATURE_POINT',
    'ESTIMATED_SURFACE',
    'DETECTED_SURFACE',
  ])
  if (!Array.isArray(hits) || hits.length === 0) return null

  let best = null
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    if (!hit || !hit.position || typeof hit.distance !== 'number') continue
    if (!best || hit.distance < best.distance) best = hit
  }
  if (!best) return null
  // Copy immediately: the engine may reuse the position object next frame.
  return new THREE.Vector3(best.position.x, best.position.y, best.position.z)
}

function finishMeasurement() {
  measureLine = placeLine(pointA, pointB)
  const floorMeters = pointA.distanceTo(pointB)
  const featureMeters = (featureA && featureB) ? featureA.distanceTo(featureB) : null
  // Raw distances stay raw. The ratio is a snapshot of this tap, so a later
  // Apply does not rewrite a width that was already taken.
  const ratio = calibration ? calibration.ratio : null
  const actualHeightMeters = calibration ? calibration.actualHeightMeters : null
  currentReading = {
    floorMeters,
    featureMeters,
    correctedFloorMeters: ratio == null ? null : floorMeters * ratio,
    correctedFeatureMeters: (ratio == null || featureMeters == null) ? null : featureMeters * ratio,
    ratio,
    actualHeightMeters,
    cameraHeightMeters: camera.position.y,
    scaleStableAtTap: scaleStable,
    tracking: trackingStatus,
  }
  renderResult(currentReading)
}

function handleFloorTap(clientX, clientY) {
  if (cameraDenied || !camera || !raycaster) return
  if (trackingStatus !== 'NORMAL') {
    showTemporaryInstruction(NOT_NORMAL_INSTRUCTION, FLASH_HOLD_MS)
    return
  }
  if (!scaleStable) {
    showTemporaryInstruction(SCALE_SETTLING_INSTRUCTION, FLASH_HOLD_MS)
    return
  }

  const canvas = document.getElementById('camerafeed')
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const normX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const normY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))

  // The controller writes the SLAM pose onto the camera between renders.
  camera.updateMatrixWorld(true)
  tapNdc.x = normX * 2 - 1
  tapNdc.y = -(normY * 2 - 1)
  raycaster.setFromCamera(tapNdc, camera)

  // The engine's only plane is the floor at y = 0. A math plane still hits
  // when the finger is over empty camera pixels rather than a mesh.
  const floorPoint = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(floorPlane, floorPoint)) {
    showTemporaryInstruction(MISS_INSTRUCTION, MESSAGE_HOLD_MS)
    return
  }

  const featurePoint = nearestFeatureHit(normX, normY)

  // A third tap starts a new pair: this tap becomes point A.
  if (pointA && pointB) clearMeasurement()

  if (!pointA) {
    pointA = floorPoint
    featureA = featurePoint
    sphereA = placeSphere(pointA)
  } else {
    pointB = floorPoint
    featureB = featurePoint
    sphereB = placeSphere(pointB)
    finishMeasurement()
  }
  instructionHoldUntil = 0
  renderInstruction()
}

function onTouchStart(event) {
  // A tap meant to dismiss the height keyboard must not also place a jamb.
  if (els.actualHeightInput && document.activeElement === els.actualHeightInput) {
    els.actualHeightInput.blur()
    event.preventDefault()
    return
  }

  // Keep the browser from turning the tap into a scroll or a double-tap zoom.
  event.preventDefault()

  if (event.touches.length >= 2) {
    clearTimeout(singleTapTimer)
    singleTapTimer = 0
    recenterTracking()
    return
  }
  if (event.touches.length !== 1) return

  const touch = event.touches[0]
  const x = touch.clientX
  const y = touch.clientY
  // A two-finger tap fires touchstart with one finger first. Wait one beat
  // so the second finger can cancel placement and recenter instead.
  clearTimeout(singleTapTimer)
  singleTapTimer = setTimeout(() => {
    singleTapTimer = 0
    handleFloorTap(x, y)
  }, SINGLE_TAP_DELAY_MS)
}

function onTouchMove(event) {
  event.preventDefault()
}

function floorCell(reading) {
  const raw = inchesFromMeters(reading.floorMeters).toFixed(1)
  if (reading.correctedFloorMeters == null) return `${raw} in`
  const corrected = inchesFromMeters(reading.correctedFloorMeters).toFixed(1)
  return `${raw} → ${corrected} in`
}

function featureCell(reading) {
  if (reading.featureMeters == null) return '—'
  const raw = inchesFromMeters(reading.featureMeters).toFixed(1)
  if (reading.correctedFeatureMeters == null) return `${raw} in`
  const corrected = inchesFromMeters(reading.correctedFeatureMeters).toFixed(1)
  return `${raw} → ${corrected} in`
}

function stableCell(reading) {
  return reading.scaleStableAtTap ? 'y' : 'n'
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
    row.textContent = `${i + 1} · floor ${floorCell(reading)} · feature ${featureCell(reading)} · height ${inchesFromMeters(reading.cameraHeightMeters).toFixed(1)} in · stable ${stableCell(reading)} · ${reading.tracking}`
    els.measurementRows.append(row)
  }
}

function tsvInches(meters) {
  if (meters == null || !Number.isFinite(meters)) return 'none'
  return inchesFromMeters(meters).toFixed(1)
}

function tsvRatio(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 'none'
  return ratio.toFixed(2)
}

function buildTsv() {
  const lines = [[
    'n',
    'raw_floor_in',
    'corrected_floor_in',
    'ratio',
    'feature_in',
    'est_height_in',
    'actual_height_in',
    'stable',
    'tracking',
  ].join('\t')]
  for (let i = 0; i < measurements.length; i++) {
    const reading = measurements[i]
    lines.push([
      String(i + 1),
      tsvInches(reading.floorMeters),
      tsvInches(reading.correctedFloorMeters),
      tsvRatio(reading.ratio),
      tsvInches(reading.featureMeters),
      tsvInches(reading.cameraHeightMeters),
      tsvInches(reading.actualHeightMeters),
      stableCell(reading),
      reading.tracking,
    ].join('\t'))
  }
  return `${lines.join('\n')}\n`
}

function markCopied() {
  // Static labels only. Diagnostic and user text stay on textContent.
  els.copyResultsButton.innerHTML = 'Copied'
  clearTimeout(copyLabelTimer)
  copyLabelTimer = setTimeout(() => {
    els.copyResultsButton.innerHTML = 'Copy<br>results'
  }, 1500)
}

function selectFallback(text) {
  const area = els.clipboardFallback
  area.value = text
  area.focus()
  area.select()
  area.setSelectionRange(0, text.length)
  // execCommand is the clipboard fallback that uses the selected textarea.
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
  // Must run inside the tap. iOS Safari rejects a clipboard write that waits.
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
    floorMeters: currentReading.floorMeters,
    featureMeters: currentReading.featureMeters,
    correctedFloorMeters: currentReading.correctedFloorMeters,
    correctedFeatureMeters: currentReading.correctedFeatureMeters,
    ratio: currentReading.ratio,
    actualHeightMeters: currentReading.actualHeightMeters,
    cameraHeightMeters: currentReading.cameraHeightMeters,
    scaleStableAtTap: currentReading.scaleStableAtTap,
    tracking: currentReading.tracking,
  })
  renderList()
  els.logButton.innerHTML = 'Saved'
  clearTimeout(saveLabelTimer)
  saveLabelTimer = setTimeout(() => {
    els.logButton.innerHTML = 'Save<br>to list'
  }, 1200)
  showTemporaryInstruction('Saved. Press Reset before the next reading.', MESSAGE_HOLD_MS)
}

function bindControls() {
  if (controlsBound) return
  controlsBound = true
  els.resetButton.addEventListener('click', () => clearMeasurement())
  els.recenterButton.addEventListener('click', () => recenterTracking())
  els.logButton.addEventListener('click', () => saveReading())
  els.copyResultsButton.addEventListener('click', () => copyResults())
  els.applyCalibrationButton.addEventListener('click', () => applyCalibration())
  // The keyboard covers Apply. Enter from the field runs the same action.
  els.actualHeightInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    applyCalibration()
  })
}

function cameraYText() {
  if (!camera || !camera.position || typeof camera.position.y !== 'number') return '—'
  return camera.position.y.toFixed(2)
}

function scanHeightHistory() {
  const count = heightHistory.length
  if (count === 0) return {span: 0, range: 0, stable: false}
  let minY = heightHistory[0].y
  let maxY = minY
  for (let i = 1; i < count; i++) {
    const y = heightHistory[i].y
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const span = heightHistory[count - 1].t - heightHistory[0].t
  const range = maxY - minY
  const stable = trackingStatus === 'NORMAL'
    && span >= STABILITY_WINDOW_MS
    && range <= STABILITY_TOLERANCE_M
    && minY >= STABILITY_MIN_Y_M
  return {span, range, stable}
}

function pruneHeightHistory(now) {
  // Drop samples only once the next one still reaches back across the full
  // window. Cutting at the cutoff leaves the span a frame short of 8000 ms.
  const cutoff = now - STABILITY_WINDOW_MS
  let drop = 0
  while (drop + 1 < heightHistory.length && heightHistory[drop + 1].t <= cutoff) {
    drop += 1
  }
  if (drop > 0) heightHistory.splice(0, drop)
}

function noteScaleTransition(wasStable, rangeMeters) {
  if (!wasStable && scaleStable) {
    logDiagnostic(`scale stable at camY=${cameraYText()}`)
  } else if (wasStable && !scaleStable) {
    logDiagnostic(`scale unstable (range=${rangeMeters.toFixed(3)} m)`)
  }
}

function updateScaleStability(now) {
  const wasStable = scaleStable
  if (
    trackingStatus !== 'NORMAL'
    || !camera
    || typeof camera.position.y !== 'number'
    || !Number.isFinite(camera.position.y)
  ) {
    // A LIMITED frame must restart the 8 s wait, not leave the old samples.
    const rangeMeters = scanHeightHistory().range
    heightHistory.length = 0
    heightSpanMs = 0
    scaleStable = false
    noteScaleTransition(wasStable, rangeMeters)
    return
  }

  heightHistory.push({t: now, y: camera.position.y})
  pruneHeightHistory(now)
  const stats = scanHeightHistory()
  heightSpanMs = stats.span
  scaleStable = stats.stable
  noteScaleTransition(wasStable, stats.range)
}

function clearScaleHistory() {
  const wasStable = scaleStable
  const rangeMeters = scanHeightHistory().range
  heightHistory.length = 0
  heightSpanMs = 0
  scaleStable = false
  noteScaleTransition(wasStable, rangeMeters)
}

function renderCalibrationSummary() {
  if (!els.calibrationSummary) return
  if (!calibration) {
    els.calibrationSummary.textContent = 'Calibration: none'
    return
  }
  const ratio = calibration.ratio.toFixed(2)
  const estimated = calibration.estimatedHeightMeters.toFixed(2)
  const actual = calibration.actualHeightMeters.toFixed(2)
  els.calibrationSummary.textContent = `Calibration: ratio ${ratio} (est ${estimated} m, actual ${actual} m)`
}

function applyCalibration() {
  const inches = els.actualHeightInput.valueAsNumber
  if (!Number.isFinite(inches) || inches < CALIBRATION_MIN_INCHES || inches > CALIBRATION_MAX_INCHES) {
    showTemporaryInstruction(CALIBRATION_RANGE_INSTRUCTION, MESSAGE_HOLD_MS)
    return
  }
  if (!scaleStable || !camera || !Number.isFinite(camera.position.y) || camera.position.y <= 0) {
    showTemporaryInstruction(CALIBRATION_WAIT_INSTRUCTION, MESSAGE_HOLD_MS)
    return
  }
  const actualHeightMeters = inches / INCHES_PER_METER
  const estimatedHeightMeters = camera.position.y
  const ratio = actualHeightMeters / estimatedHeightMeters
  calibration = {
    actualHeightMeters,
    estimatedHeightMeters,
    ratio,
    appliedAt: performance.now(),
  }
  logDiagnostic(
    `calibration applied: ratio=${ratio.toFixed(2)} est=${estimatedHeightMeters.toFixed(2)} actual=${actualHeightMeters.toFixed(2)}`
  )
  renderCalibrationSummary()
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

function doorWidthPipelineModule() {
  return {
    name: 'door-width',

    onBeforeRun: () => {
      logDiagnostic('onBeforeRun')
    },

    onAttach: () => {
      logDiagnostic('onAttach')
    },

    onDetach: () => {
      logDiagnostic('onDetach')
    },

    // Do not rethrow: a throw here would skip later modules' onException handlers.
    onException: (error) => {
      logDiagnostic(`onException: ${errorMessage(error)}`)
    },

    onStart: ({canvas}) => {
      markOverlayLive()
      logDiagnostic('onStart entered')
      frameCount = 0
      loggedFirstUpdate = false
      try {
        // renderer is created by XR8.Threejs. FullWindowCanvas resizes it; we only
        // add objects and read the camera pose back.
        const {scene: nextScene, camera: nextCamera, renderer} = XR8.Threejs.xrScene()
        scene = nextScene
        camera = nextCamera
        void renderer
        logDiagnostic(`onStart: xrScene ok (camera y=${cameraYText()})`)

        // Markers are unlit. The light keeps the scene from being black if the
        // pipeline composites any lit content of its own.
        scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2))

        markerGeometry = new THREE.SphereGeometry(0.015, 20, 16)
        markerMaterial = new THREE.MeshBasicMaterial({color: 0x39f3ff})
        lineMaterial = new THREE.LineBasicMaterial({color: 0xffe14a})

        // 1.4 m is a hand-held guess above the y = 0 floor. Absolute scale
        // replaces this once SLAM has estimated the ground; camera y is then meters.
        camera.position.set(0, 1.4, 0)
        XR8.XrController.updateCameraProjectionMatrix({
          origin: camera.position,
          facing: camera.quaternion,
        })

        const feed = canvas || document.getElementById('camerafeed')
        if (!listenersBound) {
          listenersBound = true
          feed.addEventListener('touchstart', onTouchStart, {capture: true, passive: false})
          feed.addEventListener('touchmove', onTouchMove, {passive: false})
        }

        bindControls()
        renderList()
        renderTrackingReadout()
      } catch (err) {
        logDiagnostic(`onStart: ${errorMessage(err)}`)
        throw err
      } finally {
        logDiagnostic('onStart done')
      }
    },

    onUpdate: ({processCpuResult}) => {
      frameCount += 1
      // No remote console on the phone. Record the reality payload shape once.
      if (!loggedFirstUpdate) {
        loggedFirstUpdate = true
        const realityObject = (processCpuResult && processCpuResult.reality) || {}
        const resultObject = processCpuResult || {}
        logDiagnostic(`first onUpdate; reality keys: ${Object.keys(realityObject).join(',')}; result keys: ${Object.keys(resultObject).join(',')}`)
      }

      const reality = processCpuResult && processCpuResult.reality
      if (reality) {
        const previousStatus = trackingStatus
        const previousReason = trackingReason
        if (typeof reality.trackingStatus === 'string') trackingStatus = reality.trackingStatus
        trackingReason = typeof reality.trackingReason === 'string' ? reality.trackingReason : ''
        if (trackingStatus !== previousStatus || trackingReason !== previousReason) {
          logDiagnostic(`tracking: ${trackingStatus} (${trackingReason})`)
        }
      }

      const now = performance.now()
      updateScaleStability(now)

      if (frameCount % FRAME_LOG_INTERVAL === 0) {
        logDiagnostic(`frames=${frameCount} status=${trackingStatus} camY=${cameraYText()} stable=${scaleStable ? 'y' : 'n'}`)
      }

      if (now - lastDomWriteMs < DOM_WRITE_INTERVAL_MS) return
      lastDomWriteMs = now
      renderTrackingReadout()
    },

    onCameraStatusChange: ({status, reason}) => {
      logDiagnostic(`onCameraStatusChange: ${status} (${reason})`)
      if (status !== 'failed') return
      markOverlayLive()
      cameraDenied = true
      instructionHoldUntil = 0
      if (els.instructionText) {
        els.instructionText.classList.remove('is-flashing')
        els.instructionText.textContent = CAMERA_DENIED_INSTRUCTION
      }
    },
  }
}

const onxrloaded = () => {
  logDiagnostic('xrloaded / onxrloaded entered')
  // Import maps (and therefore three.js) are absent on older Safari/Chrome.
  // Touching THREE here used to throw and leave the loading screen up.
  if (window.THREE === undefined) {
    logDiagnostic('THREE missing')
    explainBrowserTooOld()
    return
  }
  logDiagnostic(`THREE r${THREE.REVISION}`)

  if (typeof XR8.version !== 'undefined') logDiagnostic(`XR8 version ${XR8.version}`)
  else logDiagnostic('XR8 version undefined')

  // r152+ color-manages hex materials and would shift the marker colors.
  // The placeground sample turns this off so the authored colors stay put.
  if (THREE.ColorManagement) THREE.ColorManagement.enabled = false

  raycaster = new THREE.Raycaster()
  tapNdc = new THREE.Vector2()
  floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  // 'absolute' is meters. The default 'responsive' scale is not metric, so a
  // door width would not be real inches. Required before the controller module.
  XR8.XrController.configure({scale: 'absolute'})
  logDiagnostic('XrController.configure scale=absolute ok')

  // Order matches the placeground sample. Ours is last so onStart runs after
  // XR8.Threejs has created the scene. Coaching is after RuntimeError so its
  // prompt is installed before our module reads tracking.
  const modules = [
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XRExtras.AlmostThere.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
  ]
  if (window.CoachingOverlay) {
    // Absolute scale needs a forward/back translation. The overlay shows that
    // motion until tracking is NORMAL, then hides itself.
    CoachingOverlay.configure({
      promptText: 'To find scale, push the phone forward and pull it back',
      promptColor: '#ffffff',
      animationColor: '#39f3ff',
    })
    modules.push(CoachingOverlay.pipelineModule())
  } else {
    logDiagnostic('CoachingOverlay missing')
  }
  modules.push(doorWidthPipelineModule())
  XR8.addCameraPipelineModules(modules)

  // Opens the back camera and starts SLAM. SLAM is back-camera only.
  XR8.run({canvas: document.getElementById('camerafeed')})
  logDiagnostic('XR8.run called')
}

// The three.js import is an inline module. If it fails, window.THREE stays unset.
// Resource errors from xr.js or xrextras have a src or filename; leave those alone.
window.addEventListener('error', (event) => {
  const message = event && typeof event.message === 'string' ? event.message : ''
  const filename = typeof event.filename === 'string' ? event.filename : ''
  const lineno = event && event.lineno != null ? event.lineno : ''
  logDiagnostic(`error: ${message} @ ${filename}:${lineno}`)

  if (window.THREE !== undefined) return
  const target = event.target
  if (target && target !== window && target.src) return
  if (/xr\.js|xrextras/.test(filename)) return
  explainBrowserTooOld()
}, true)

window.addEventListener('unhandledrejection', (event) => {
  logDiagnostic(`unhandledrejection: ${errorMessage(event && event.reason)}`)
})

// Loading.showLoading paints the startup screen and, on iOS, the motion-permission tap.
const load = () => { XRExtras.Loading.showLoading({onxrloaded}) }

function onDomReady() {
  // Pipeline callbacks can run as soon as the engine starts. Cache the nodes
  // before that, not only on window load.
  cacheElements()
  logDiagnostic('DOMContentLoaded')
}

function onWindowLoad() {
  cacheElements()
  logDiagnostic('window load')
  if (window.XRExtras) {
    logDiagnostic('XRExtras already present')
    load()
  } else {
    window.addEventListener('xrextrasloaded', () => {
      logDiagnostic('xrextrasloaded seen')
      load()
    })
  }
}

logDiagnostic('app.js loaded')
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onDomReady)
} else {
  onDomReady()
}
// addEventListener, not window.onload, so a later assignment cannot drop this handler.
window.addEventListener('load', onWindowLoad)
