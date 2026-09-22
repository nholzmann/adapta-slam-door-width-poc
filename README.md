# Adapta — SLAM Door-Width POC

Throwaway feasibility spike: can browser-based camera SLAM (8th Wall Distributed
Engine Binary) measure a door's frame-to-frame width accurately enough to be
useful, on a phone with no app install and no LiDAR?

- `BRIEF.md` — the original spike brief (goal, scope, success criteria).
- `RESEARCH.md` — verified integration findings and locked implementation decisions.
- `index.html` / `app.js` — the prototype (built by Grok Build, supervised from Claude Code).
- `TEST-PROTOCOL.md` — how testers measure real doors and record results.

Live page (GitHub Pages, served from `main`):
https://nholzmann.github.io/adapta-slam-door-width-poc/

HTTPS is required for camera access on phones.

## How to test

Follow [TEST-PROTOCOL.md](TEST-PROTOCOL.md) on the phone's own browser
(Safari on iPhone, Chrome on Android), not an in-app browser. Tape-measure
the door first, then take three readings and paste Copy results into your notes.
Needs Safari on iOS 16.4 or newer, or Chrome 89 or newer on Android.
The Debug log drop-down logs startup and tracking on the phone. The coaching overlay is MIT-licensed from 8th Wall.

Engine attribution: the page loads the 8th Wall engine binary from jsDelivr under
its limited-use license. Copyright © 2026 Niantic Spatial, Inc. All rights reserved.
License: https://github.com/8thwall/engine/blob/main/LICENSE
