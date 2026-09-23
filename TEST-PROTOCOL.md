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

`method` is **SLAM** or **Reference**. Use the SLAM columns (`raw_*`, `ratio`, `est_height_in`, tracking) for SLAM rows. For Reference rows, put the three still-photo inches in `reading1` / `reading2` / `reading3`, leave the raw/ratio/height/tracking cells blank or `n/a`, and write `reference` (`card`, `letter`, or `custom:11.75x8.5`), `1ref` or `2refs`, `card_long_px`, and the tilt angles in notes.

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

This tab does not use SLAM. It takes a still photo and uses a credit card, a Letter sheet, or a custom rectangle in the picture as the scale. Use it on the same doors as the SLAM tab so the two methods can be compared. Open **Reference** in the top bar (full navigation; the camera from SLAM is released).

The camera fills the screen. The top bar is one translucent row: **SLAM** / **Reference** pills, then **Floor** / **Wall**, **1 ref** / **2 refs**, and **Card** / **Sheet** / **Custom**, then **ⓘ**. ⓘ shows or hides the status line (vision library, camera size, tilt). On iPhone, **Enable tilt** is on that line; it only records the angle. The instruction under the bar is one line; tap it to read the rest. The bottom sheet is collapsed to one row: the result on the left, the four buttons on the right. Tap the handle (the bar and the chevron) to open the session list, the debug log, and the credits. While your finger is down on a point, the sheet and the instruction hide so they do not cover the magnifier or the edge of the photo.

Needs a physical **credit card, debit card, or other ISO ID-1 card** (the common US wallet card, 85.60 mm × 53.98 mm), or a **US Letter sheet** (279.4 mm × 215.9 mm). A business card or a phone is the wrong size. A Letter sheet gives about three times the accuracy of a card. **Custom** is for a page that is neither: enter the long edge and the short edge in inches and tap **Apply**. The hint under the fields lists Letter 11 × 8.5, Legal pad 11.75 × 8.5, A4 11.69 × 8.27, and Credit card 3.370 × 2.125. The size is remembered until you reload. Try the sheet and, if the page in your hand is a legal pad, the legal-pad preset, on the same door.

Any comfortable camera angle is fine. The page does not need the phone to be level. Capture never waits for tilt. **2 refs** is the measurement to use. **1 ref** is the older flow and is easy to get wrong.

### Two references (recommended)

The door width is the perpendicular distance between the two jamb faces, not the distance between two dots. Put one reference against each jamb so both ends of that gap are a known length.

**Floor.** Both references lie flat on the floor. The long edge of each runs along the door. One short edge of the left reference touches the left jamb face, and one short edge of the right reference touches the right jamb face. They do not have to line up with each other along the jamb. Cards and sheets are both fine. Both references are the same kind (both cards, both sheets, or both the custom size).

**Wall.** The lower reference lies flat on the wall with its bottom long edge on the floor line. The upper reference lies flat on the wall with its top long edge on the height mark. The height is the gap between those two edges.

1. Choose **Floor** or **Wall**, **2 refs**, and **Card**, **Sheet**, or **Custom**, before Capture. Those chips lock after Capture.
2. Step back so both references and both jambs (or the floor line and the height mark) are in view. Turn the phone sideways if the door does not fit. Get each reference at least as big as the dashed box.
3. Tap **Capture**.
4. Tap the left reference (on a wall, the lower one). Check the corners, drag a handle if one is off — the magnifier appears while your finger is down — then tap **Confirm**.
5. Tap the right reference (on a wall, the upper one). Confirm it the same way.
6. The result appears immediately. There are no jamb taps in this mode. The big number is the perpendicular width. **Reset refs** clears both references and keeps the photo. **Retake** takes a new photo.
7. Tap **Save to list**. Three captures per door.

Amber lines under the result:

- **References disagree** — the two outlines do not agree about scale (the fit is worse than 2 mm, or one reference looks more than 5% off the other's size). Both must lie flat on the same surface. Retake.
- **Cards are not both flush against the jambs** — the two outer edges are more than 3° off parallel. Re-seat them so each short edge (on a wall, each long edge) is actually against the jamb or the mark, then Retake.

### One reference

Use this only when you cannot put a reference on both jambs. The reference must lie **on** the line between the two jamb lines, and bigger is better. A card a step further from the camera than the taps, and off that line, has read 98 in on a 32 in door. The page learned the perspective from edges only about 35 px tall, and a small edge error stretched across that gap.

After Confirm, place **two points on each jamb**, not one. Press and slide, with the magnifier, for all four.

### Floor mode (door width)

1. Tape-measure the door first, the same way as the SLAM section.
2. Choose **1 ref**, **Card**, **Sheet**, or **Custom**, and **Floor** if it is not already selected. Mode, layout, and reference cannot be changed after Capture.
3. Lay the card or sheet **on the floor on the line between the jambs**, as large in the frame as you can. Do not set it a step closer or further than the jambs.
4. Step back so **both jambs and the reference are in view**. Turn the phone sideways (landscape) if the door does not fit. Aim at the threshold at whatever angle is comfortable.
5. Get the reference **at least as big as the dashed box** ("card at least this big" or "sheet at least this big"). If the box says the reference is small after you confirm it, Retake from closer.
6. Tap **Capture**.
7. Tap the reference. The page looks for the card or sheet on its own. A green flash and **Card found — check the corners, then Confirm** (or **Sheet found**) means check that the yellow quad sits on the four edges. The handles are the virtual sharp corners, slightly outside rounded corners. Press a handle and the magnifier appears immediately; slide it if a corner is off. An amber flash and **Card not found — drag the corners onto its edges** (or **Sheet not found**) means detection missed: drag each corner onto an edge. Then tap **Confirm card** or **Confirm sheet**.
8. Place four points by press-and-slide, two along each jamb. Press on the left jamb base for the first point, keep your finger down, slide until the crosshair sits on the jamb edge, then lift. Press a second point further along the same jamb, a few inches from the first. Do the same pair on the right jamb. The round magnifier stays above your finger (or below it near the top of the screen), and a faint vertical line shows whether the point is on the jamb edge. A quick tap still leaves the point where the finger landed; sliding is how you line it up. The big number is the perpendicular width (`⊥ width`). The smaller raw figure is the straight distance between the first left point and the first right point, which reads high when those two points are not side by side.
9. Tap **Save to list**. Repeat for **three** captures per door (Retake between them, not only Reset points). Reset points keeps the reference and clears all four points; Retake takes a new photo.

If either jamb's scale is more than 1.5× the scale at the reference, an amber line stays under the result: **Unreliable: reference is far from the points or too small.** Move the reference onto the line between the points, use a larger sheet, or switch to **2 refs**. If the two jamb lines are more than 3° off parallel, the page says the lines are not parallel — place both points along each jamb face.

### Wall mode (one per tester)

Do this once per person, not once per door. Prefer **2 refs** (lower reference on the floor line, upper reference on the height mark). In **1 ref**, the same rules apply: any comfortable angle, the reference on the line between the two marks, at least as big as the dashed box, and press-and-slide for all four points.

1. Tape-measure a known height (floor to a handrail, or floor to a piece of tape).
2. Hold the card or sheet **flat against the wall** on the line between the floor and the height mark.
3. Switch to **Wall** *before* Capture. Get the **floor line** and the **height mark** in view, then Capture.
4. Tap the reference and confirm the corners. In **1 ref**, press-and-slide two points along the **floor line**, then two points along the **top of the handrail or tape**. In **2 refs**, tap the lower reference, confirm, tap the upper reference, confirm.
5. Save to list. Write `method = Reference` and `Wall` in notes.

### Copy results (Reference)

The Reference **Copy results** paste is tab-separated and looks like this:

```
n	mode	reference	inches	cm	card_long_px	image_w	image_h	tilt_beta	tilt_gamma	detect	detect_strategy	layout	fit_rms_mm	scale_drift	ref_a_px	ref_b_px	lines_angle_deg	lines_spread_mm	raw_point_in	scale_ratio_a	scale_ratio_b
1	floor	custom:11.75x8.5	32.0	81.3	690	3840	2160	41.0	-0.5	auto	flood30+otsu	2refs	0.60	1.020	690	670	0.80	0.40	none	none	none
2	floor	card	36.0	91.4	214	3840	2160	43.0	-1.2	auto	edges50	1ref	none	none	none	none	0.40	1.20	36.5	1.020	1.080
```

`reference` is `card`, `letter`, or `custom:11.75x8.5` (the long and short edges in inches). `layout` is `2refs` or `1ref`. `inches` is the perpendicular width. `card_long_px` is the reference's long edge in the photo; in two-reference mode it is the first reference, and `ref_a_px` / `ref_b_px` list both. `fit_rms_mm` is how far the eight corners miss the fitted rectangles, in millimetres. `scale_drift` is how much the two references disagree about size (1.00 means they agree). `lines_angle_deg` is the angle between the two jamb lines (0 means parallel). `lines_spread_mm` is the spread of the four edge-to-edge distances. `raw_point_in` is the straight point-to-point distance in one-reference mode, for comparison with the perpendicular width. `scale_ratio_a` and `scale_ratio_b` compare the local scale at each jamb with the scale at the reference (one-reference mode). Empty values say `none`.

`tilt_beta` and `tilt_gamma` are degrees at the moment of Capture, or `none` if tilt was not available. `detect` is `auto` if the reference was found and the corners were not dragged more than 3 px, otherwise `manual`. In two-reference mode `detect` is `manual` if either reference was dragged. `detect_strategy` is which search found the outline: `edges30`, `edges50`, `edges80`, `flood18`, `flood30`, `otsu`, or `otsu-inv`. It is `manual` when none of those matched and the page used the default rectangle. Two references join the two searches with `+`, for example `flood30+otsu`. If you drag an auto-found corner more than 3 px, `detect` becomes `manual` and `detect_strategy` stays the search that found it. The list is only in the phone's memory. Closing the tab clears it.
