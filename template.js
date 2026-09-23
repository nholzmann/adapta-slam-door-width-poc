// Renders TEMPLATE_LETTER_V1 onto the printable page. reference.js must load
// first; this file no-ops without #page so the Reference tab is unaffected.

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
  if (!page || typeof TEMPLATE_LETTER_V1 === 'undefined') return
  const spec = TEMPLATE_LETTER_V1
  const size = spec.markerSizeIn
  page.replaceChildren()

  const title = document.createElement('p')
  title.className = 'page-title'
  title.textContent = 'ADAPTA door-width reference · Letter · v1 · print at 100 % (Actual size). Do not use \'Fit to page\'.'
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

  const cardW = spec.cardOutlineIn[0]
  const cardH = spec.cardOutlineIn[1]
  const cardX = (spec.pageIn[0] - cardW) / 2
  const cardY = (spec.pageIn[1] - cardH) / 2
  const card = document.createElement('div')
  card.className = 'card-outline'
  card.style.cssText = inchStyle(cardX, cardY, cardW, cardH)
  page.append(card)

  const cardLabel = document.createElement('p')
  cardLabel.className = 'card-label'
  cardLabel.style.cssText = inchStyle(cardX - 0.4, cardY + cardH + 0.08, cardW + 0.8)
  cardLabel.textContent = 'Lay a credit card inside this outline. If its edges do not line up with the box, the print is scaled.'
  page.append(cardLabel)

  const barW = spec.barIn
  const barX = (spec.pageIn[0] - barW) / 2
  const barY = cardY + cardH + 0.55
  const bar = document.createElement('div')
  bar.className = 'scale-bar'
  bar.style.cssText = inchStyle(barX, barY, barW, 0.55)
  const line = document.createElement('div')
  line.className = 'scale-bar-line'
  bar.append(line)
  for (let inch = 0; inch <= 6; inch++) {
    const tick = document.createElement('div')
    tick.className = 'scale-tick'
    tick.style.left = `${inch}in`
    bar.append(tick)
    const num = document.createElement('p')
    num.className = 'scale-num'
    num.style.left = `${inch}in`
    num.textContent = String(inch)
    bar.append(num)
  }
  page.append(bar)

  const barLabel = document.createElement('p')
  barLabel.className = 'bar-label'
  barLabel.style.cssText = inchStyle(barX, barY + 0.52, barW)
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
