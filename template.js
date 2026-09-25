// Renders TEMPLATE_LETTER_V1 onto the printable page. measure.js must load
// first; this file no-ops without #page so the measuring page is unaffected.

function arucoMipBits(id) {
  const api = (window.JSARUCO && window.JSARUCO.AR) || (typeof AR !== 'undefined' ? AR : null)
  const dict = api && api.DICTIONARIES && api.DICTIONARIES.ARUCO_MIP_36h12
  if (!dict || dict.codeList[id] == null) return null
  return Number(dict.codeList[id]).toString(2).padStart(36, '0')
}

// Outer black square is the full 2.00 in SVG (8×8 cells, 1-cell border).
function markerSvgMarkup(id, sizeIn) {
  const bits = arucoMipBits(id)
  const cells = 8
  const cell = sizeIn / cells
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeIn}in" height="${sizeIn}in" viewBox="0 0 ${sizeIn} ${sizeIn}" aria-label="ArUco MIP 36h12 id ${id}">`
  svg += `<rect x="0" y="0" width="${sizeIn}" height="${sizeIn}" fill="#000"/>`
  if (bits) {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        if (bits[y * 6 + x] === '1') {
          svg += `<rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${cell}" height="${cell}" fill="#fff"/>`
        }
      }
    }
  }
  svg += '</svg>'
  return svg
}

function inchStyle(x, y, w, h) {
  let css = `left:${x}in;top:${y}in;`
  if (w != null) css += `width:${w}in;`
  if (h != null) css += `height:${h}in;`
  return css
}

function printedPageSizePx() {
  const spec = (typeof TEMPLATE_LETTER_V1 !== 'undefined' && TEMPLATE_LETTER_V1.pageIn)
    ? TEMPLATE_LETTER_V1.pageIn
    : [11, 8.5]
  return {pageW: spec[0] * 96, pageH: spec[1] * 96}
}

function fitPrintedPage() {
  const page = document.getElementById('page')
  const stage = document.getElementById('pageStage')
  if (!page || !stage) return
  // True CSS size (11in × 8.5in), not the laid-out box. A flex item with
  // overflow:hidden otherwise shrinks on a phone and the scale is wrong.
  const size = printedPageSizePx()
  const pageW = size.pageW
  const pageH = size.pageH
  if (!(pageW > 0) || !(pageH > 0)) return
  const cs = window.getComputedStyle(stage)
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  const maxW = Math.max(1, stage.clientWidth - padX)
  // Fit the stage width. Cap by leftover height only on large screens.
  let scale = Math.min(maxW / pageW, 1)
  if (window.innerWidth >= 720) {
    const maxH = Math.max(160, window.innerHeight - 220)
    scale = Math.min(scale, maxH / pageH)
  }
  page.style.transform = `scale(${scale})`
  stage.style.height = `${Math.ceil(pageH * scale)}px`
}

function renderTemplatePage() {
  const page = document.getElementById('page')
  if (!page || typeof TEMPLATE_LETTER_V1 === 'undefined' || typeof templateInteriorLayoutIn !== 'function') return
  const spec = TEMPLATE_LETTER_V1
  const size = spec.markerSizeIn
  const layout = templateInteriorLayoutIn()
  page.replaceChildren()

  const frameInset = 0.4
  const frame = document.createElement('div')
  frame.className = 'clip-frame'
  frame.style.cssText = inchStyle(
    frameInset,
    frameInset,
    spec.pageIn[0] - 2 * frameInset,
    spec.pageIn[1] - 2 * frameInset
  )
  const frameCaption = document.createElement('p')
  frameCaption.className = 'clip-caption'
  frameCaption.textContent = 'All four corners of this grey frame must show on the print.'
  frame.append(frameCaption)
  page.append(frame)

  const title = document.createElement('p')
  title.className = 'page-title'
  title.textContent = 'Adapta door-width sheet. Print on US Letter, landscape.'
  page.append(title)

  for (let i = 0; i < spec.ids.length; i++) {
    const id = spec.ids[i]
    const square = spec.outerSquaresIn[id]
    const holder = document.createElement('div')
    holder.className = 'marker'
    holder.style.cssText = inchStyle(square[0], square[1], size, size)
    holder.innerHTML = markerSvgMarkup(id, size)
    page.append(holder)
  }

  const line = document.createElement('div')
  line.className = 'scale-bar-line'
  line.style.cssText = inchStyle(layout.barLine.x, layout.barLine.y, layout.barLine.w, layout.barLine.h)
  page.append(line)

  for (let i = 0; i < layout.ticks.length; i++) {
    const tickBox = layout.ticks[i]
    const tick = document.createElement('div')
    tick.className = 'scale-tick'
    tick.style.cssText = inchStyle(tickBox.x, tickBox.y, tickBox.w, tickBox.h)
    page.append(tick)
    const numBox = layout.nums[i]
    const num = document.createElement('p')
    num.className = 'scale-num'
    num.style.cssText = inchStyle(numBox.x, numBox.y, numBox.w, numBox.h)
    num.textContent = numBox.label
    page.append(num)
  }

  const barLabel = document.createElement('p')
  barLabel.className = 'bar-label'
  barLabel.style.cssText = inchStyle(layout.barCaption.x, layout.barCaption.y, layout.barCaption.w, layout.barCaption.h)
  barLabel.textContent = 'Tape-measure this line. Enter its length on your phone.'
  page.append(barLabel)

  fitPrintedPage()
}

function shareIsAbort(error) {
  return !!(error && (error.name === 'AbortError' || error.name === 'NotAllowedError'))
}

function shareSheetPdf() {
  const pdfUrl = new URL('adapta-door-sheet-letter.pdf', window.location.href).href
  const fallback = () => navigator.share({
    title: 'Adapta door-width sheet',
    url: window.location.href,
  })
  const tryFiles = fetch(pdfUrl).then((res) => {
    if (!res.ok) throw new Error('pdf missing')
    return res.blob()
  }).then((blob) => {
    const file = new File([blob], 'adapta-door-sheet-letter.pdf', {type: 'application/pdf'})
    let canFiles = false
    try {
      canFiles = !!(navigator.canShare && navigator.canShare({files: [file]}))
    } catch (err) {
      canFiles = false
    }
    if (!canFiles) return fallback()
    return navigator.share({
      title: 'Adapta door-width sheet',
      files: [file],
    })
  })
  return tryFiles.catch((err) => {
    if (shareIsAbort(err)) return
    return fallback()
  }).catch((err) => {
    if (shareIsAbort(err)) return
  })
}

function bootTemplatePage() {
  if (!document.getElementById('page')) return
  renderTemplatePage()
  const printButton = document.getElementById('printButton')
  if (printButton) printButton.addEventListener('click', () => window.print())
  const shareButton = document.getElementById('shareButton')
  if (shareButton) {
    if (typeof navigator.share !== 'function') shareButton.hidden = true
    else shareButton.addEventListener('click', () => { shareSheetPdf() })
  }
  window.addEventListener('resize', fitPrintedPage)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTemplatePage)
  else bootTemplatePage()
}
