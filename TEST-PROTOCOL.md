# Door-width test protocol

You are checking whether a phone webpage can measure a door as well as a tape measure. You do not need to install an app. The page does not save anything after you close it, so paste your results into your notes before you leave.

## Open the page in the phone's own browser

Live page: https://nholzmann.github.io/adapta-slam-door-width-poc/

Needs Safari on iOS 16.4 or newer, or Chrome 89 or newer on Android.

- iPhone: open that link in **Safari**. Not inside Mail, Messages, Instagram, or Facebook. If you are already in one of those apps, copy the link and paste it into Safari.
- Android: open that link in **Chrome**. Not an in-app browser.
- When the phone asks, allow **camera** and **motion**. If you tapped Don't Allow, the page cannot measure. Reload and allow access.
- The page must stay open. Switching apps or locking the phone can stop the camera. If the list of readings matters, copy it first (see the last section).

## Before you use the phone: tape the door

Do this first, while the number is still unknown, so the phone reading cannot sway you.

1. Close or open the door so you can see both side frames where they meet the floor.
2. Measure **frame to frame along the floor**, not the clear gap once the door is in the way, and not across the middle of the frame.
3. Write down the width in inches to one decimal (for example `36.0`) before you open the page.

Measure at least five doors if you can, including doors around 32 to 36 inches.

## Start a reading

1. Open the page and point the **back** camera at the floor in front of the door.
2. Point the camera at a textured floor about a meter in front of you, then slowly push the phone forward about a foot and pull it back, two or three times, keeping the floor in view. The on-screen animation shows the motion. The animation disappears when tracking reaches NORMAL. A floor with some texture (wood grain, tile grout, a rug pattern) works better. A plain carpet or a shiny floor makes tracking worse. Note the floor type and the lighting later.
3. Wait until the top-left reads **NORMAL · scale stable** and the text is green. Amber **NORMAL · scale settling** means keep the floor in view and move the phone forward and back. Taps are refused until it says scale stable. If it says INITIALIZING, LIMITED, or NOT_AVAILABLE, push the phone forward and pull it back again. Do not tap yet. Words after the status (for example EXCESSIVE_MOTION) mean the phone wants you to slow down or show it more texture. If the status leaves NORMAL, the settling wait starts over.
4. Look at the top-right number, like `0.81 m / 31.9 in`. That is how high the phone thinks it is above the floor. It will often not match a tape measure; the calibration step below corrects that. If the height is nonsense (a few inches, or up near the ceiling), tap **Recenter**, then push the phone forward and pull it back again until the top-left reads **NORMAL · scale stable**.

## Calibrate once per session (before the first door)

Do this with the phone held at your normal measuring height, after the top-left reads **NORMAL · scale stable**, and before the first door.

Have someone tape-measure from the floor to the phone's camera, or measure it yourself against a mark on the wall, to the nearest half inch. Open **Calibration**, enter that height in inches, and tap **Apply**. The summary shows the ratio. Keep holding the phone at roughly that same height when measuring doors. If you reload the page, calibrate again.

## If nothing shows on screen

Open the **Debug log** drop-down at the bottom. Read the last lines of the panel. Send a screenshot of that panel to the person collecting results.

## Mark the door

1. When the instruction says so, tap the floor **where the left jamb meets the floor**. A small dot should stick to that spot.
2. Tap the floor **where the right jamb meets the floor**. A second dot and a line should appear.
3. The big number is the floor measurement, in inches, with centimeters under it. If you calibrated, the big number is the corrected width, and the line under the centimeters shows the raw width and the ratio (`raw 21.1 in · ratio 1.62`). If you did not calibrate, that line says uncalibrated and the estimated height. The smaller line (`feature hit: …`) is a second method. If it says `feature hit: none`, that is fine — write that down, do not retry just to force a feature hit. When calibrated, the feature line shows the corrected inches and the raw inches.
4. If you tap the wall or above the floor line, the page says `Tap on the floor, not the wall` and does not count that tap.
5. Step side to side. The dots should stay on the jambs. If they swim or slide, tracking is not stable — write that in the notes.
6. Tap **Save to list**. The session list at the bottom gains one row.

A third tap on the floor throws away both dots and starts over. Save first if you want to keep the number.

## Three readings on every door

For each door, take **three** readings.

1. Take reading 1. Save to list.
2. Tap **Reset** (this clears the dots only — it does not restart tracking). Take reading 2. Save to list.
3. Before you reset for reading 3, take one step away from the door and walk back. Watch the dots. If they left the jambs, the tracking drifted — circle **n** in the table.
4. Tap **Reset**, not Recenter. Take reading 3. Save to list.

Use **Recenter** only when tracking is lost or the camera-height number looks wrong (a few inches, or up near the ceiling). Recenter starts tracking over, clears the dots, and clears the scale-stable wait, so you must see **NORMAL · scale stable** again before the next tap. Calibration stays. Do not use it between the three readings, or the drift check is wasted.

Write down the estimated camera height in inches (`est_height_in`, from the top right or the saved row) and the calibration ratio for that door. Also write the floor type (wood, tile, carpet, concrete, rug) and the lighting (daylight, overhead lights, dim, mixed).

## Results table

Copy this into your notes. One row per door. Leave the pass/fail judgment to the person collecting the sheets. Both **±0.5 in** and **±1.0 in** will be looked at. Both the corrected delta and the raw delta are wanted.

`reading1`, `reading2`, and `reading3` are the big floor-method inches (not the feature-hit line). When you calibrated, those are the corrected inches. `raw_reading1`, `raw_reading2`, and `raw_reading3` are the raw inches from the `raw … in` line under the big number. If you were not calibrated, the raw readings are the same as the big number.

`delta_from_actual` = corrected mean minus the tape measure. `raw_delta` = raw mean minus the tape measure. Keep the sign. If the tape says 36.0 and the corrected mean is 35.8, delta is **-0.2** (the page read low). Mean is the three readings added together, divided by 3, to one decimal. Do that once for the corrected readings and once for the raw readings.

`ratio` is the calibration ratio from the summary (or `none` if you did not calibrate). `est_height_in` is the estimated camera height in inches at that door.

If the ratio is similar across doors and sessions, the bias is constant and calibration may make the method viable. If the ratio wanders, the method is not viable.

`method` is **SLAM** or **Reference**. Use the SLAM columns (`raw_*`, `ratio`, `est_height_in`, tracking) for SLAM rows. For Reference rows, put the three still-photo inches in `reading1` / `reading2` / `reading3`, leave the raw/ratio/height/tracking cells blank or `n/a`, and write `card_long_px` plus level y/n in notes.

| door | method | actual_in | reading1 | reading2 | reading3 | mean | delta_from_actual | raw_reading1 | raw_reading2 | raw_reading3 | raw_mean | raw_delta | ratio | est_height_in | phone model + OS | floor type | tracking felt stable (y/n) | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Paste the copied results

After each door, or before you close the page, tap **Copy results**. Paste that into your notes under the table. It is tab-separated and looks like this:

```
n	raw_floor_in	corrected_floor_in	ratio	feature_in	est_height_in	actual_height_in	stable	tracking
1	21.1	34.2	1.62	12.7	31.9	52.0	y	NORMAL
```

Empty values say `none`. `feature_in` is the raw feature-hit inches. `stable` is `y` or `n`. If you had not calibrated, `corrected_floor_in`, `ratio`, and `actual_height_in` say `none`. The list is only in the phone's memory. Closing the tab clears it. The paste is the record.

The on-page list shows the same readings. When that reading was calibrated, the floor cell shows raw → corrected. Feature inches there are `—` when there was no feature hit. Height is the estimated camera height in inches at the moment the second jamb was tapped. `stable` is `y` or `n`. Tracking is the status word at that moment.

## Reference tab

This tab does not use SLAM. It takes a still photo, finds a US credit card in the picture as the scale, then converts two taps through the card's plane into inches. Use it on the same doors as the SLAM tab so the two methods can be compared. Open **Reference** at the top of the page (full navigation; the camera from SLAM is released).

Needs a physical **credit card, debit card, or other ISO ID-1 card** (the common US wallet card, 85.60 mm × 53.98 mm). A business card or a phone is the wrong size.

### Floor mode (door width)

1. Tape-measure the door first, the same way as the SLAM section.
2. Put the card **flat on the floor in the middle of the threshold**, long edge roughly parallel to the door.
3. Choose **Floor (door width)** if it is not already selected. Mode cannot be changed after Capture.
4. Hold the phone **parallel to the floor at chest height**, camera looking down at the card and both jambs. On iPhone, tap **Enable level** if that button is showing, then allow motion.
5. Wait until the level badge is **green**, then tap **Capture**.
6. Tap the card. Check that the yellow quad sits on the four edges (the handles are the virtual sharp corners, slightly outside the rounded plastic). Drag with the loupe if needed, then tap **Confirm card**. If it says the card is small, Retake closer.
7. Tap point A at the **left jamb at the floor**, then point B at the **right jamb at the floor**. Drag the dots if the tap landed off the jamb.
8. Tap **Save to list**. Repeat for **three** captures per door (Retake between them, not only Reset points). Reset points keeps the card and clears A/B; Retake takes a new photo.

### Wall mode (one per tester)

Do this once per person, not once per door.

1. Tape-measure a known height (floor to a handrail, or floor to a piece of tape).
2. Hold the card **flat against the wall** at that height (or anywhere on the wall in the same plane).
3. Switch to **Wall (height)** *before* Capture. Hold the phone upright in portrait, camera facing the wall, until the level badge is green, then Capture.
4. Tap the card, confirm the corners, tap point A on the **floor line**, tap point B at the **top of the handrail or tape**.
5. Save to list. Write `method = Reference` and `Wall` in notes.

### Copy results (Reference)

The Reference **Copy results** paste is tab-separated and looks like this:

```
n	mode	inches	cm	card_long_px	image_w	image_h	beta	gamma	level	detect
1	floor	36.1	91.7	214	3840	2160	1.2	-0.4	y	auto
```

`detect` is `auto` if the card was found and the corners were not dragged more than 3 px, otherwise `manual`. `level` is `y` or `n` at the moment of Capture. The list is only in the phone's memory. Closing the tab clears it.
