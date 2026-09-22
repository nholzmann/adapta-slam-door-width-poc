// Door-width prototype: two floor taps, metric distance, session log in memory only.

const INCHES_PER_METER = 39.3701
const DOM_WRITE_INTERVAL_MS = 200
const SINGLE_TAP_DELAY_MS = 80
const FLASH_HOLD_MS = 1100
const MESSAGE_HOLD_MS = 1700

const WAIT_INSTRUCTION = 'Move the phone slowly for a few seconds until tracking is NORMAL'
const LEFT_INSTRUCTION = 'Tap where the LEFT jamb meets the floor'
const RIGHT_INSTRUCTION = 'Tap where the RIGHT jamb meets the floor'
const RESULT_INSTRUCTION = 'Result is on screen. Save to list, or tap the floor to measure again.'
const CAMERA_DENIED_INSTRUCTION = 'Camera permission was denied. Reload the page and allow camera access.'
const BROWSER_TOO_OLD_INSTRUCTION = 'This browser is too old for the prototype. Use Safari on iOS 16.4 or newer, or Chrome on Android.'
const NOT_NORMAL_INSTRUCTION = 'Tracking must be NORMAL before you tap. Move the phone slowly.'
const MISS_INSTRUCTION = 'Tap on the floor, not the wall'
const NEED_BOTH_INSTRUCTION = 'Place both jamb points before saving.'
const NEED_SAVED_INSTRUCTION = 'Save a measurement to the list first.'

const els = {}
const measurements = []

let scene = null
let camera = null
let raycaster = null
let tapNdc = null
let floorPlane = null
let markerGeometry = null
let markerMaterial = null
let lineMaterial = null

let trackingStatus = 'INITIALIZING'
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
  els.resultSecondary = document.getElementById('resultSecondary')
  els.resetButton = document.getElementById('resetButton')
  els.recenterButton = document.getElementById('recenterButton')
  els.logButton = document.getElementById('logButton')
  els.copyResultsButton = document.getElementById('copyResultsButton')
  els.measurementSummary = document.getElementById('measurementSummary')
  els.measurementRows = document.getElementById('measurementRows')
  els.clipboardFallback = document.getElementById('clipboardFallback')
}

function showOverlay() {
  els.overlay.classList.add('is-ready')
}

function explainBrowserTooOld() {
  browserTooOld = true
  instructionHoldUntil = 0
  const overlay = document.getElementById('overlay')
  const instruction = document.getElementById('instructionText')
  if (!overlay || !instruction) return
  instruction.classList.remove('is-flashing')
  instruction.textContent = BROWSER_TOO_OLD_INSTRUCTION
  // The XRExtras loading layer is z-index 800 and stays up if XR8.run never
  // starts. Lift the overlay so this line is what the tester actually sees.
  overlay.style.zIndex = '2000'
  overlay.style.background = '#101118'
  overlay.classList.add('is-ready')
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

function statusLabel() {
  if (trackingStatus !== 'NORMAL' && trackingReason) {
    return `${trackingStatus} — ${trackingReason}`
  }
  return trackingStatus
}

function renderTrackingReadout() {
  const label = statusLabel()
  if (els.trackingStatus.textContent !== label) els.trackingStatus.textContent = label
  els.trackingStatus.classList.toggle('is-normal', trackingStatus === 'NORMAL')
  if (camera) els.cameraHeight.textContent = formatHeight(camera.position.y)
  renderInstruction()
}

function renderResult(reading) {
  els.resultInches.textContent = `${inchesFromMeters(reading.floorMeters).toFixed(1)} in`
  els.resultCentimeters.textContent = `(${(reading.floorMeters * 100).toFixed(1)} cm)`
  els.resultSecondary.textContent = reading.featureMeters == null
    ? 'feature hit: none'
    : `feature hit: ${inchesFromMeters(reading.featureMeters).toFixed(1)} in`
}

function clearResultText() {
  els.resultInches.textContent = ''
  els.resultCentimeters.textContent = ''
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
  // look like drift, so the points are cleared with the map.
  XR8.XrController.recenter()
  clearMeasurement()
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
  const featureMeters = (featureA && featureB) ? featureA.distanceTo(featureB) : null
  currentReading = {
    floorMeters: pointA.distanceTo(pointB),
    featureMeters,
    cameraHeightMeters: camera.position.y,
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

function featureCell(reading) {
  if (reading.featureMeters == null) return '—'
  return `${inchesFromMeters(reading.featureMeters).toFixed(1)} in`
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
    row.textContent = `${i + 1} · floor ${inchesFromMeters(reading.floorMeters).toFixed(1)} in · feature ${featureCell(reading)} · height ${inchesFromMeters(reading.cameraHeightMeters).toFixed(1)} in · ${reading.tracking}`
    els.measurementRows.append(row)
  }
}

function buildTsv() {
  const lines = ['n\tfloor_in\tfeature_in\tcamera_height_in\ttracking']
  for (let i = 0; i < measurements.length; i++) {
    const reading = measurements[i]
    const feature = reading.featureMeters == null
      ? 'none'
      : inchesFromMeters(reading.featureMeters).toFixed(1)
    lines.push([
      String(i + 1),
      inchesFromMeters(reading.floorMeters).toFixed(1),
      feature,
      inchesFromMeters(reading.cameraHeightMeters).toFixed(1),
      reading.tracking,
    ].join('\t'))
  }
  return `${lines.join('\n')}\n`
}

function markCopied() {
  els.copyResultsButton.textContent = 'Copied'
  clearTimeout(copyLabelTimer)
  copyLabelTimer = setTimeout(() => {
    els.copyResultsButton.textContent = 'Copy results'
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
    cameraHeightMeters: currentReading.cameraHeightMeters,
    tracking: currentReading.tracking,
  })
  renderList()
  els.logButton.textContent = 'Saved'
  clearTimeout(saveLabelTimer)
  saveLabelTimer = setTimeout(() => {
    els.logButton.textContent = 'Save to list'
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
}

function doorWidthPipelineModule() {
  return {
    name: 'door-width',

    onStart: ({canvas}) => {
      // renderer is created by XR8.Threejs. FullWindowCanvas resizes it; we only
      // add objects and read the camera pose back.
      const {scene: nextScene, camera: nextCamera, renderer} = XR8.Threejs.xrScene()
      scene = nextScene
      camera = nextCamera
      void renderer

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
      showOverlay()
      renderTrackingReadout()
    },

    onUpdate: ({processCpuResult}) => {
      const reality = processCpuResult && processCpuResult.reality
      if (reality) {
        if (typeof reality.trackingStatus === 'string') trackingStatus = reality.trackingStatus
        trackingReason = typeof reality.trackingReason === 'string' ? reality.trackingReason : ''
      }

      const now = performance.now()
      if (now - lastDomWriteMs < DOM_WRITE_INTERVAL_MS) return
      lastDomWriteMs = now
      renderTrackingReadout()
    },

    onCameraStatusChange: ({status}) => {
      if (status !== 'failed') return
      cameraDenied = true
      showOverlay()
      instructionHoldUntil = 0
      if (els.instructionText) {
        els.instructionText.classList.remove('is-flashing')
        els.instructionText.textContent = CAMERA_DENIED_INSTRUCTION
      }
    },
  }
}

const onxrloaded = () => {
  // Import maps (and therefore three.js) are absent on older Safari/Chrome.
  // Touching THREE here used to throw and leave the loading screen up.
  if (window.THREE === undefined) {
    explainBrowserTooOld()
    return
  }

  // r152+ color-manages hex materials and would shift the marker colors.
  // The placeground sample turns this off so the authored colors stay put.
  if (THREE.ColorManagement) THREE.ColorManagement.enabled = false

  raycaster = new THREE.Raycaster()
  tapNdc = new THREE.Vector2()
  floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  // 'absolute' is meters. The default 'responsive' scale is not metric, so a
  // door width would not be real inches. Required before the controller module.
  XR8.XrController.configure({scale: 'absolute'})

  // Order matches the placeground sample. Ours is last so onStart runs after
  // XR8.Threejs has created the scene.
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XRExtras.AlmostThere.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    doorWidthPipelineModule(),
  ])

  // Opens the back camera and starts SLAM. SLAM is back-camera only.
  XR8.run({canvas: document.getElementById('camerafeed')})
}

// The three.js import is an inline module. If it fails, window.THREE stays unset.
// Resource errors from xr.js or xrextras have a src or filename; leave those alone.
window.addEventListener('error', (event) => {
  if (window.THREE !== undefined) return
  const target = event.target
  if (target && target !== window && target.src) return
  const filename = typeof event.filename === 'string' ? event.filename : ''
  if (/xr\.js|xrextras/.test(filename)) return
  explainBrowserTooOld()
}, true)

// Loading.showLoading paints the startup screen and, on iOS, the motion-permission tap.
const load = () => { XRExtras.Loading.showLoading({onxrloaded}) }
window.onload = () => {
  cacheElements()
  window.XRExtras ? load() : window.addEventListener('xrextrasloaded', load)
}
