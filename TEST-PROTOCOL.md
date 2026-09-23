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

`method` is **SLAM** or **Reference**. Use the SLAM columns (`raw_*`, `ratio`, `est_height_in`, tracking) for SLAM rows. For Reference rows, put the three still-photo inches in `reading1` / `reading2` / `reading3`, leave the raw/ratio/height/tracking cells blank or `n/a`, and write `reference` (`template:letter-v2`, `card`, `letter`, `legal:11.75x8.5`, `notepad:11.5x8.5`, `a4:11.69x8.27`, or `custom:11.5x8.5`), `1ref` or `2refs`, `card_long_px`, and the tilt angles in notes. For a template row also write `print_scale`, `print_scale_source` (`paper` / `bar` / `none`), `markers_found`, `marker_rms_mm`, and `auto_markers` (`y` when markers were used). Also note `aspect_ratio_est` and `focal_source` from the meta line.

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

This tab does not use SLAM. It takes a still photo and uses a known rectangle in the picture as the scale. Use it on the same doors as the SLAM tab so the two methods can be compared. Open **Reference** in the top bar (full navigation; the camera from SLAM is released).

The camera fills the screen. The top bar is one translucent row: **SLAM** / **Reference** / **Template** pills, then **Floor** / **Wall**, **1 ref** / **2 refs**, and **Reference**, then **ⓘ**. ⓘ shows or hides the status line (vision library, camera size, tilt). On iPhone, **Enable tilt** is on that line; it only records the angle. The instruction under the bar is one line; tap it to read the rest. The bottom sheet is collapsed to one row: the result on the left, the four buttons on the right. Tap the handle (the bar and the chevron) to open the session list, the debug log, and the credits. While your finger is down on a point, the sheet and the instruction hide so they do not cover the magnifier or the edge of the photo.

**Reference** opens the size list. The default is still **Printer paper (Letter) 11 × 8.5**, marked recommended. **Printed template (Letter)** is the first row; its hint is **detected automatically when present**. You do not have to select that row. If the photo contains the printed sheet, the page uses the markers whichever row is selected. The picker only chooses the size of plain paper. Keep Letter as the default until the template is proven. The other rows are **Credit card 3.370 × 2.125**, **Legal pad 11.75 × 8.5**, **Notepad 11.5 × 8.5**, **A4 11.69 × 8.27**, and **Custom…** (enter the long edge and the short edge in inches and tap **Apply**). The chip shows the current choice (`Letter`, `Template`, `Card`). Use plain printer paper: every Letter sheet is exactly 11 × 8.5. Notepads vary — a notepad page of 11.5 in read 1.4 in low until the size was corrected. Pick the matching preset or measure the page. A business card or a phone is the wrong size. A Letter sheet gives about three times the accuracy of a card. The choice is remembered until you reload.

### Printed template

This is the measurement to try first when you can print. Shadows and floor planks cannot be mistaken for the sheet because each corner has an ArUco marker with an id.

1. Open **Template** in the top bar. Print the Letter landscape page at **100 % (Actual size)**. Do not use “Fit to page”. The title on the sheet must say **v2**. Discard any print whose title says v1 — those sheets used a 0.60 in margin, and the bottom markers may be clipped even when white paper still shows below them.
2. Check the thin grey frame. All four corners of that frame must be visible on the paper. If any corner is missing, the printer clipped the page — use a larger margin or another printer, and do not measure with that sheet.
3. After printing, lay a credit card inside the centre outline. If its edges do not line up with the box, the print is scaled — do not use that copy, or measure the 6 in bar and type that length into **Bar measured (in)** on the Reference picker (that number wins over the automatic paper-edge scale).
4. Check the 6.00 in bar with a tape measure. It should read 6.00. If it reads 5.82, enter `5.82` in **Bar measured (in)**.
5. On **Reference**, choose **Floor** or **Wall**, and **1 ref** or **2 refs**. You do not have to select **Printed template** — markers are detected automatically, and the picker only matters for a plain sheet. Mode, layout, and reference lock after Capture.
6. Lay the sheet on the threshold line (any orientation is fine). Step back so both jambs and the sheet are in view. Tap **Capture**, then tap the sheet.
7. The page looks for markers 0–3 even if the picker says Letter. A green flash, **Printed template detected — check the outer marker corners, then Confirm**, means the yellow quad should sit on the **outermost corner of each marker** (the rectangle that is 9.30 × 6.80 in on a 100 % print). Confirm, then place the two jamb points (1 ref) or tap the second sheet (2 refs). The reading's `reference` is `template:letter-v2` and `auto_markers` is `y`. If the picker says Printed template and no markers are found, the flash is **No markers found — treating as plain Letter paper**: the token is `letter` and `auto_markers` is `n`.

The meta line may show **print ×0.97 (paper)** or **print ×0.97 (bar)** or **print unverified**.

- **print ×0.97 (paper)** — the page found the Letter paper outline and it was larger than the printed ink, so the printer scaled the content to about 97 %. The reading is corrected by that factor. A 97 % print would otherwise read a 36 in door as about 37.1 in.
- **print ×0.97 (bar)** — you typed a bar length other than 6.00 in, and that value won over the paper-edge estimate.
- **print unverified** — no paper outline in the right size band, or the long and short paper ratios disagreed by more than 1 %, and the bar field is still 6.00. Treat the inches as if the print were 100 %. Retake, or measure the bar.

For **2 refs**, print two copies and put one against each jamb, same as two Letter sheets. Write `reference = template:letter-v2` and `auto_markers = y` in the results table.

If the debug log says the template is not flat, or `marker_rms_mm` is above 1.5, the sheet is warped or the print is uneven — flatten it and retake.

Any comfortable camera angle is fine. The page does not need the phone to be level. Capture never waits for tilt. **2 refs** is the measurement to use. **1 ref** is the older flow and is easy to get wrong.

### Two references (recommended)

The door width is the perpendicular distance between the two jamb faces, not the distance between two dots. Put one reference against each jamb so both ends of that gap are a known length.

**Floor.** Both references lie flat on the floor. Either orientation is fine: what matters is one edge flush against each jamb face, and both references flat. They do not have to line up with each other along the jamb. The fit reports which way it found each one (`long-across` means the long edge spans the doorway, `short-across` means the short edge does). Both references are the same kind.

**Wall.** The lower reference lies flat on the wall with one edge on the floor line. The upper reference lies flat on the wall with one edge on the height mark. Either orientation is fine. The height is the gap between those two edges.

1. Choose **Floor** or **Wall**, **2 refs**, and the reference size, before Capture. Those chips lock after Capture.
2. Step back so both references and both jambs (or the floor line and the height mark) are in view. Turn the phone sideways if the door does not fit. Get each reference at least as big as the dashed box.
3. Tap **Capture**.
4. Tap the left reference (on a wall, the lower one). Check the corners, drag a handle if one is off — the magnifier appears while your finger is down — then tap **Confirm**.
5. Tap the right reference (on a wall, the upper one). Confirm it the same way.
6. The result appears immediately. There are no jamb taps in this mode. The big number is the perpendicular width. **Reset refs** clears both references and keeps the photo. **Retake** takes a new photo.
7. Tap **Save to list**. Three captures per door.

Amber lines under the result:

- **References disagree** — the two outlines do not agree about scale (the fit is worse than 2 mm, or one reference looks more than 5% off the other's size). Both must lie flat on the same surface. Retake.
- **The outer edges are not parallel** — they are more than 3° off parallel. Re-seat each reference so one edge is flush against the jamb or the mark, then Retake. The result line names the orientation the fit chose for each reference.

### One reference

Use this only when you cannot put a reference on both jambs. The reference must lie **on** the line between the two jambs, and bigger is better. Plain paper may lie in either orientation. The page estimates the sheet's true proportions from perspective, so the 11 in edge may point across the door or away from the camera. For Letter, if the meta line shows `aspect` far from 1.29, retake — the sheet's long/short ratio was not recovered. A card a step further from the camera than the taps, and off that line, has read 98 in on a 32 in door. The page learned the perspective from edges only about 35 px tall, and a small edge error stretched across that gap.

After Confirm, place **one point on each jamb**. Press and slide, with the magnifier. The width is not the straight line between those two taps. The sheet's edges are axis-aligned in its own millimetre frame, and the doorway is whichever of those axes the two taps run along. The big number is that component (the perpendicular width). A tap that slides along the jamb changes the raw chord and not the width. If the taps miss the sheet's edge direction by more than 12°, the page warns that the sheet may not be square to the door, or a tap is off the jamb, and it still shows the raw chord.

### Floor mode (door width)

1. Tape-measure the door first, the same way as the SLAM section.
2. Choose **1 ref** and **Floor** if it is not already selected. Leave **Reference** on **Letter** unless the page in your hand is a different preset. Mode, layout, and reference cannot be changed after Capture.
3. Lay a plain sheet of printer paper **on the floor on the line between the jambs**, either orientation, as large in the frame as you can. Do not set it a step closer or further than the jambs. After the result, check the meta line: Letter should show `aspect` near **1.29**. If it is far from that, retake.
4. Step back so **both jambs and the reference are in view**. Turn the phone sideways (landscape) if the door does not fit. Aim at the threshold at whatever angle is comfortable.
5. Get the reference **at least as big as the dashed box** ("card at least this big" or "sheet at least this big"). If the box says the reference is small after you confirm it, Retake from closer.
6. Tap **Capture**.
7. Tap the reference. The page looks for the card or sheet on its own. A green flash and **Card found — check the corners, then Confirm** (or **Sheet found**) means check that the yellow quad sits on the four edges. The handles are the virtual sharp corners, slightly outside rounded corners. Press a handle and the magnifier appears immediately; slide it if a corner is off. An amber flash and **Card not found — drag the corners onto its edges** (or **Sheet not found**) means detection missed: drag each corner onto an edge. Then tap **Confirm card** or **Confirm sheet**.
8. Place two points by press-and-slide, one on each jamb. Press on the left jamb where it meets the floor, keep your finger down, slide until the crosshair sits on the jamb edge, then lift. Do the same on the right jamb. The round magnifier stays above your finger (or below it near the top of the screen), and a faint vertical line shows whether the point is on the jamb edge. A quick tap still leaves the point where the finger landed; sliding is how you line it up. The big number is the perpendicular width along the sheet's axis (`⊥ width`). The smaller raw figure is the straight distance between the two taps, which reads high when those taps are not side by side.
9. Tap **Save to list**. Repeat for **three** captures per door (Retake between them, not only Reset points). Reset points keeps the reference and clears both points; Retake takes a new photo.

If either jamb's scale is more than 1.3× the scale at the reference, an amber line stays under the result: **Unreliable: reference is far from the points or too small.** Move the reference onto the line between the points, use a larger sheet, or switch to **2 refs**. If the two taps do not run along the sheet's edge direction (more than 12° off), the page says so and shows the raw chord — the sheet may not be square to the door, or a tap is off the jamb.

### Wall mode (one per tester)

Do this once per person, not once per door. Prefer **2 refs** (lower reference on the floor line, upper reference on the height mark). In **1 ref**, the same rules apply: any comfortable angle, the reference on the line between the two marks, at least as big as the dashed box, and press-and-slide for one point on each mark. The width is the sheet-axis component, with the same 12° warning.

1. Tape-measure a known height (floor to a handrail, or floor to a piece of tape).
2. Hold the card or sheet **flat against the wall** on the line between the floor and the height mark.
3. Switch to **Wall** *before* Capture. Get the **floor line** and the **height mark** in view, then Capture.
4. Tap the reference and confirm the corners. In **1 ref**, press-and-slide one point on the **floor line**, then one point on the **top of the handrail or tape**. In **2 refs**, tap the lower reference, confirm, tap the upper reference, confirm.
5. Save to list. Write `method = Reference` and `Wall` in notes.

### Copy results (Reference)

The Reference **Copy results** paste is tab-separated and looks like this:

```
n	mode	reference	inches	cm	card_long_px	image_w	image_h	tilt_beta	tilt_gamma	detect	detect_strategy	layout	fit_rms_mm	scale_drift	ref_a_px	ref_b_px	lines_angle_deg	lines_spread_mm	raw_point_in	scale_ratio_a	scale_ratio_b	orient_a	orient_b	axis_angle_deg	print_scale	print_scale_source	markers_found	marker_rms_mm	auto_markers	aspect_ratio_est	focal_source
1	floor	letter	32.0	81.3	690	3840	2160	41.0	-0.5	auto	flood30+otsu	2refs	0.60	1.020	690	670	0.80	0.40	none	none	none	short-across	short-across	none	none	none	none	none	n	1.29	estimated
2	floor	notepad:11.5x8.5	36.0	91.4	214	3840	2160	43.0	-1.2	auto	edges50	1ref	none	none	none	none	none	none	36.5	1.020	1.080	none	none	4.20	none	none	none	none	n	1.35	estimated
3	floor	template:letter-v2	23.0	58.4	980	3840	2160	41.0	-0.5	auto	markers4	1ref	none	none	none	none	none	none	23.1	1.010	1.020	none	none	3.10	0.9700	paper	4	0.40	y	1.37	estimated
```

`reference` is `template:letter-v2`, `card`, `letter`, `legal:11.75x8.5`, `notepad:11.5x8.5`, `a4:11.69x8.27`, or `custom:11.5x8.5` (long and short edges in inches). `layout` is `2refs` or `1ref`. `inches` is the perpendicular width. `card_long_px` is the reference's long edge in the photo; in two-reference mode it is the first reference, and `ref_a_px` / `ref_b_px` list both. `fit_rms_mm` is how far the eight corners miss the fitted rectangles, in millimetres. `scale_drift` is how much the two references disagree about size (1.00 means they agree). `lines_angle_deg` is the angle between the two outer edges in two-reference mode (0 means parallel). `lines_spread_mm` is the spread of the four edge-to-edge distances. One-reference rows write `none` for both of those. `raw_point_in` is the straight point-to-point distance in one-reference mode, for comparison with the perpendicular width. `scale_ratio_a` and `scale_ratio_b` compare the local scale at each jamb with the scale at the reference (one-reference mode). `orient_a` and `orient_b` are `long-across` or `short-across` (which physical edge spans the doorway) in two-reference mode, and `none` for one reference. `axis_angle_deg` is how far the two taps miss the sheet's edge direction, in degrees, in one-reference mode, and `none` for two references. `print_scale` is the factor applied to the printed template (`0.9700`, or `unverified`) and `print_scale_source` is `paper`, `bar`, or `none`. `markers_found` is how many of the four ArUco markers were read. `marker_rms_mm` is the millimetre reprojection of those marker corners. `auto_markers` is `y` when those markers supplied the quad, and `n` when the page used the picker's plain sheet (including a Printed-template picker that found no markers and fell back to Letter). `aspect_ratio_est` is the sheet's recovered long/short ratio, two decimals (Letter is 1.29, either lay direction). In two-reference mode the column is the first sheet and the meta line lists both. `focal_source` is `estimated` when the photo's perspective gave a focal length, `fallback` when the page used `0.72 ×` the longer image side, or `none` when the aspect could not be recovered. For Letter, retake if `aspect` on the meta line is far from 1.29. Empty values say `none`.

`tilt_beta` and `tilt_gamma` are degrees at the moment of Capture, or `none` if tilt was not available. `detect` is `auto` if the reference was found and the corners were not dragged more than 3 px, otherwise `manual`. In two-reference mode `detect` is `manual` if either reference was dragged. `detect_strategy` is which search found the outline: `edges30`, `edges50`, `edges80`, `flood18`, `flood30`, `otsu`, or `otsu-inv`. It is `manual` when none of those matched and the page used the default rectangle. Two references join the two searches with `+`, for example `flood30+otsu`. If you drag an auto-found corner more than 3 px, `detect` becomes `manual` and `detect_strategy` stays the search that found it. The list is only in the phone's memory. Closing the tab clears it.
