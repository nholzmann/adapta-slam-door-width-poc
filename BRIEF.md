# Adapta — SLAM Door-Width POC (Claude Code Brief)

2026-09-22 · @Someone

## Goal & Context

Adapta's verification flow needs to measure door widths as part of the 56-feature checklist — "Exterior door 36in or wider" and "Interior doors 36in or wider" are both tagged **measure**. The design prototype's preferred tier (06a) assumes native ARKit/ARCore LiDAR depth scanning, which only \~30% of the US phone market can run and which requires a native app.

This POC tests a possible middle tier: camera-based SLAM (via 8th Wall's free Distributed Engine Binary) running directly in a browser — no install, no LiDAR hardware required — to see whether it can measure a door width accurately enough to be useful. This is a feasibility spike, not a production build. The outcome determines whether "web AR-assisted measurement" becomes a real third option alongside manual entry and native LiDAR in the platform decision.

## Scope & Constraints

- **Throwaway prototype.** New, isolated repo/folder — not integrated into any Adapta codebase, no shared dependencies with future production work.
- **Single static page.** One HTML file + minimal JS. No backend, no auth, no database, no build pipeline beyond what's needed to load the engine.
- **No design polish.** Functional only — a live camera view, a way to mark two points, a number on screen.
- **Engine:** 8th Wall Distributed Engine Binary (free, commercial-use license, closed-source, includes SLAM). Not the MIT open-source framework — that doesn't include SLAM.
- **License compliance:** the binary's distribution license requires a visible copyright notice and link to the LICENSE file somewhere in the experience (e.g., an about/credits line) — small but non-optional per 8th Wall's license terms.
- **Test device:** any modern iPhone (no LiDAR required — that's the point) running Safari, no app install.
- **Out of scope:** production UI, error handling beyond basic camera-permission failure, support for Android/other browsers, integration with Adapta's real data model.

## Success Criteria

**Proposed tolerance (assumption — not yet confirmed with Eli):** measured width within ±0.5in of actual, across a sample of 5+ real doors spanning the 32–36in range this checklist item cares about. This threshold isn't specified anywhere in the requirements doc — flagging it as a placeholder the actual product decision should confirm, since it directly affects a checklist item's pass/fail line.

**Also worth resolving during the spike, not before it:** whether the checklist item wants frame-to-frame width or clear opening width (the usable passage width once door swing/hinges are accounted for — a standard ADA-adjacent distinction). The prototype should measure frame-to-frame first, since that's simpler to validate, and note the gap.

**Pass/fail for this POC:**

- **Viable** — accuracy within tolerance, tracking stable enough for a non-technical user to complete a measurement in a few seconds, no crashes across the test sample.
- **Not viable** — accuracy inconsistent, tracking drifts, or the interaction is too fragile for a property owner to use unsupervised. If not viable, the platform decision reverts to manual entry (06b) as the only non-native option.

## Claude Code Prompts

Run sequentially, one at a time — each in its own context, `/clear` between them.

### 1. Explore

```
Use the Explore agent for this task.

DO NOT WRITE CODE YET. Research only.

We want to prototype camera-based room measurement in the browser using 8th Wall's free Distributed Engine Binary (released Jan 2026, includes SLAM, binary-only license). Investigate:

- How to integrate the Distributed Engine Binary into a plain static HTML/JS page (no build framework required)
- What the engine exposes for world tracking / placing anchor points in 3D space, and how to read back real-world distance between two anchors
- Confirm it runs in iOS Safari with no install, using the camera feed directly
- The license's copyright-notice requirement and where it needs to appear

Create a summary with:
- Findings
- The minimal integration path (files needed, CDN/script tags vs. package install)
- Recommendation for the implementation approach
```

### 2. Implement

```
Use the general-purpose agent for this task.

Build a minimal working prototype, informed by the Explore findings above.

Goal: a single static HTML page that opens the device camera, runs 8th Wall's SLAM tracking, lets the user tap two points on screen corresponding to the two sides of a door frame, and displays the real-world distance between those two points in inches.

Requirements:
- One HTML file, minimal JS, no backend, no build step beyond what the engine needs
- Live camera view with SLAM tracking active
- Tap-to-place two points; show the computed distance on screen immediately
- A visible copyright notice + LICENSE link per 8th Wall's distribution license
- Works in iOS Safari with no install

Don't build: login, data persistence, production styling, Android support, or anything beyond this one measurement flow.
```

### 3. Verify

```
Use the test-engineer agent for this task.

We need real-world accuracy data for the door-measurement prototype, not automated tests.

Produce a short test protocol a human can follow: measure 5+ real doors with a tape measure first (actual width, frame-to-frame), then measure the same doors with the prototype, and record both numbers plus the delta.

Report:
- Measured vs. actual for each door, and the error in inches
- Whether tracking felt stable or drifted during use
- Whether results stayed within ±0.5in across the sample
- A viable / not viable recommendation per the Success Criteria section of this doc
```
