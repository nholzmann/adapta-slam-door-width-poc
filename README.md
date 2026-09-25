# Adapta — door-width measuring POC

A phone webpage that measures a doorway from a still photo, using a printed Adapta sheet (or plain US Letter paper) as the scale. No app install, no LiDAR, no SLAM.

- `BRIEF.md` — the original spike brief.
- `RESEARCH.md` — verified findings and locked measurement math.
- `index.html` / `measure.js` — the guided three-step measuring page.
- `template.html` / `template.js` — printable US Letter landscape sheet with four ARUCO_MIP_36h12 markers and a 6 in line. Tape-measure that line after printing; the length you enter corrects any shrinking.
- `adapta-door-sheet-letter.pdf` — ready-to-print Letter landscape PDF of that sheet. Regenerate it with `tools/make-sheet-pdf.sh` whenever `template.html` or `template.js` print output changes.
- `reference.html` — redirect stub so older tester links still open the measuring page.
- `TEST-PROTOCOL.md` — how testers measure real doors and record results.
- `tools/check-homography.js` — Node self-check for the planar math.

Live page (GitHub Pages, served from `main`):
https://nholzmann.github.io/adapta-slam-door-width-poc/

HTTPS is required for camera access on phones.

## How it works

1. **Your sheet.** Tape-measure the line on the printed sheet and confirm that length (checkbox, or type the actual length between 5 and 6.5 in). That value is remembered on the phone and corrects printer shrinking. Plain US Letter paper is the fallback.
2. **Place the sheet.** Open the camera, lay the sheet on the floor between the door jambs (or on the wall for a height), and take a photo.
3. **Mark the two sides.** The page looks for the printed sheet on its own. Tap the left and right jambs where they meet the floor. The reading is the perpendicular width along the sheet’s axis.

Height mode (floor to a mark on the wall) is a toggle on step 2.

## How to test

Follow [TEST-PROTOCOL.md](TEST-PROTOCOL.md) on the phone’s own browser (Safari on iPhone, Chrome on Android), not an in-app browser. Tape-measure the door first, print the sheet (PDF or from the sheet page), tape the line, then take three readings and paste Copy results into your notes.

Needs Safari on iOS 16.4 or newer, or Chrome 89 or newer on Android.

The ⋯ menu holds the session list, Copy results (tab-separated), a link to print the sheet, and the Debug log (vision library, camera size, tilt).

## Self-check

From the repo root:

```
node tools/check-homography.js
```

It must end with `PASS`. No build step, no `npm install`. The page is static HTML and JS.
