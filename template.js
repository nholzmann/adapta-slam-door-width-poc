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

function fitPrintedPage() {
  const page = document.getElementById('page')
  const stage = document.getElementById('pageStage')
  if (!page || !stage) return
  const pageW = page.offsetWidth
  const pageH = page.offsetHeight
  if (!(pageW > 0) || !(pageH > 0)) return
  const maxW = stage.clientWidth
  const maxH = Math.max(160, window.innerHeight - 220)
  const scale = Math.min(maxW / pageW, maxH / pageH, 1)
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
  frameCaption.textContent = 'All four corners of this grey frame must be visible on the print. If any is missing, the printer clipped the page — use a larger margin or another printer.'
  frame.append(frameCaption)
  page.append(frame)

  const title = document.createElement('p')
  title.className = 'page-title'
  title.textContent = 'ADAPTA door-width reference · Letter · v2 · print at 100 % (Actual size). Do not use \'Fit to page\'.'
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

  const card = document.createElement('div')
  card.className = 'card-outline'
  card.style.cssText = inchStyle(layout.card.x, layout.card.y, layout.card.w, layout.card.h)
  page.append(card)

  const cardLabel = document.createElement('p')
  cardLabel.className = 'card-label'
  cardLabel.style.cssText = inchStyle(layout.cardCaption.x, layout.cardCaption.y, layout.cardCaption.w, layout.cardCaption.h)
  cardLabel.textContent = 'Lay a credit card inside this outline. If its edges do not line up with the box, the print is scaled.'
  page.append(cardLabel)

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
  barLabel.textContent = 'This bar should measure 6.00 in with a tape measure.'
  page.append(barLabel)

  fitPrintedPage()
}

function bootTemplatePage() {
  if (!document.getElementById('page')) return
  renderTemplatePage()
  const printButton = document.getElementById('printButton')
  if (printButton) printButton.addEventListener('click', () => window.print())
  window.addEventListener('resize', fitPrintedPage)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTemplatePage)
  else bootTemplatePage()
}
