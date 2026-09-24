# Door-width test protocol

You are checking whether a phone webpage can measure a door as well as a tape measure. You do not need to install an app. The list of readings lives only in the phone’s memory until you copy it, so paste Copy results into your notes before you leave.

## Open the page in the phone’s own browser

Live page: https://nholzmann.github.io/adapta-slam-door-width-poc/

Needs Safari on iOS 16.4 or newer, or Chrome 89 or newer on Android.

- iPhone: open that link in **Safari**. Not inside Mail, Messages, Instagram, or Facebook. If you are already in one of those apps, copy the link and paste it into Safari.
- Android: open that link in **Chrome**. Not an in-app browser.
- When the phone asks, allow **camera**. If you tapped Don’t Allow, the page cannot photograph. Reload and allow access.
- The page must stay open. Switching apps or locking the phone can stop the camera. If the list of readings matters, copy it first (see the last section).

## Before you use the phone: tape the door

Do this first, while the number is still unknown, so the phone reading cannot sway you.

1. Close or open the door so you can see both side frames where they meet the floor.
2. Measure **frame to frame along the floor**, not the clear gap once the door is in the way, and not across the middle of the frame.
3. Write down the width in inches to one decimal (for example `36.0`) before you open the page.

Measure at least five doors if you can, including doors around 32 to 36 inches.

## Print the sheet at 100 %

1. Open **Print the sheet** from the ⋯ menu, or go to `template.html`.
2. Print the Letter landscape page at **100 % (Actual size)**. Do not use “Fit to page”. The title on the sheet must say **v2**.
3. Check the thin grey frame. All four corners of that frame must be visible on the paper. If any corner is missing, the printer clipped the page — use a larger margin or another printer, and do not measure with that sheet.
4. Tape-measure the **6 in line** on the printout. Write that length down. Home printers often print it slightly short, like 5.88.

If you cannot print, you can use a blank US Letter sheet (8.5 × 11 in) instead. The printed sheet is the measurement to try first.

## Step 1 — Your sheet

1. Open the measuring page. The camera does not start yet.
2. For the printed sheet: the line-length field starts empty. Type the taped line length (between 5.5 and 6.5 in), or tick **It measures exactly 6 in**. The Open camera button stays off until you do one of those, or a remembered length from last time is filled in. Ticking the checkbox or typing 6.00 counts as a tape measurement of 6 in.
3. If you do not have the sheet, tap **Using plain printer paper instead** and tick **It’s US Letter, 8.5 × 11 in**.
4. Tap **Open camera** and allow the camera if asked.

## Step 2 — Place the sheet

1. Choose **Door width** (or **Height** for a wall measurement).
2. Lay the sheet **flat on the floor between the door jambs**, square to the door. Back up until both jambs are in view. Turn the phone sideways if the door does not fit.
3. For height: hold the sheet flat on the wall between the floor and the height mark, and back up until both are in view.
4. On the printed-sheet path, a chip may say **Looking for the sheet…** then **Sheet found**. You can still take the photo either way.
5. Tap the round shutter (**Take photo**).

## Step 3 — Mark the two sides

1. If the page found the printed sheet, a green outline flashes, then stays thin. You can tap **Adjust sheet** if a corner is off, then **Done**.
2. If it did not find the sheet: tap the sheet (or the paper, on the Letter path). Drag a corner if needed, then **Looks right** or **Done**.
3. Tap **where the left jamb meets the floor**. Press and slide; a magnifier appears while your finger is down. Lift when the crosshair sits on the jamb.
4. Tap **where the right jamb meets the floor** the same way. For height: tap the floor at the wall, then the height mark.
5. The big number is the width to the nearest ⅛ in. The smaller line is decimal inches and centimeters. A quiet line says where the scale came from. If you used plain Letter paper and the printed sheet was found anyway, and you never entered a line length, you may see **print scale unverified** — tape the 6 in line in step 1, then retake. A confirmed 6.00 in line does not show that warning.
6. Tap **Save measurement**. Repeat for **three** captures per door. Use **Retake** between them (this keeps the step 1 settings). **Clear points** keeps the photo and the sheet outline.

A reading whose `print_warning` is `y` is uncorrected. Home printers often shrink to about 97 %, which would read a 36 in door as about 37.1 in.

## Three readings on every door

For each door, take **three** readings.

1. Take reading 1. Save measurement.
2. Tap **Retake**. Take reading 2. Save measurement.
3. Tap **Retake**. Take reading 3. Save measurement.

Write down the floor type (wood, tile, carpet, concrete, rug) and the lighting (daylight, overhead lights, dim, mixed).

## If nothing shows on screen

Open **⋯**, then **Debug log**. Read the last lines. Send a screenshot of that panel to the person collecting results.

## Results table

Copy this into your notes. One row per door. Leave the pass/fail judgment to the person collecting the sheets. Both **±0.5 in** and **±1.0 in** will be looked at.

`reading1`, `reading2`, and `reading3` are the big tape-style inches from the three still photos. `delta_from_actual` = mean minus the tape measure. Keep the sign. If the tape says 36.0 and the mean is 35.8, delta is **-0.2** (the page read low). Mean is the three readings added together, divided by 3, to one decimal.

In notes also write `reference` (`template:letter-v2` or `letter`), `print_scale`, `print_scale_source` (`paper` / `bar` / `paper-remembered` / `none`), `print_warning` (`y` when the print scale was unverified), `markers_found`, `marker_rms_mm`, `auto_markers` (`y` when markers were used), `aspect_ratio_est`, and `focal_source`.

| door | actual_in | reading1 | reading2 | reading3 | mean | delta_from_actual | phone model + OS | floor type | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |

## Paste the copied results

After each door, or before you close the page, open **⋯** and tap **Copy results**. Paste that into your notes under the table. It is tab-separated and looks like this:

```
n	mode	reference	inches	cm	card_long_px	image_w	image_h	tilt_beta	tilt_gamma	detect	detect_strategy	layout	fit_rms_mm	scale_drift	ref_a_px	ref_b_px	lines_angle_deg	lines_spread_mm	raw_point_in	scale_ratio_a	scale_ratio_b	orient_a	orient_b	axis_angle_deg	print_scale	print_scale_source	markers_found	marker_rms_mm	auto_markers	aspect_ratio_est	focal_source	print_warning
1	floor	template:letter-v2	32.1	81.6	980	3840	2160	41.0	-0.5	auto	markers4	1ref	none	none	none	none	none	none	32.2	1.010	1.020	none	none	3.10	0.9800	bar	4	0.40	y	1.37	estimated	n
2	floor	letter	32.0	81.3	690	3840	2160	41.0	-0.5	auto	flood30	1ref	none	none	none	none	none	none	32.1	1.020	1.080	none	none	4.20	none	none	none	none	n	1.29	estimated	n
```

`reference` is `template:letter-v2` or `letter` on this page. `layout` is `1ref`. `inches` is the perpendicular width. `card_long_px` is the reference’s long edge in the photo. `raw_point_in` is the straight point-to-point distance, for comparison with the perpendicular width. `scale_ratio_a` and `scale_ratio_b` compare the local scale at each jamb with the scale at the reference. `axis_angle_deg` is how far the two taps miss the sheet’s edge direction, in degrees. `print_scale` is the factor applied to the printed template (`0.9700`, or `unverified`) and `print_scale_source` is `paper`, `bar`, `paper-remembered`, or `none`. `print_warning` is `y` when a template reading was uncorrected (`print_scale_source` `none`) and `n` otherwise. `markers_found` is how many of the four ArUco markers were read. `marker_rms_mm` is the millimetre reprojection of those marker corners. `auto_markers` is `y` when those markers supplied the quad. `aspect_ratio_est` is the sheet’s recovered long/short ratio, two decimals (Letter is 1.29, either lay direction). `focal_source` is `estimated` when the photo’s perspective gave a focal length, `fallback` when the page used `0.72 ×` the longer image side, or `none` when the aspect could not be recovered. For Letter, retake if `aspect` is far from 1.29. Empty values say `none`.

`tilt_beta` and `tilt_gamma` are degrees at the moment of Capture, or `none` if tilt was not available. `detect` is `auto` if the reference was found and the corners were not dragged more than 3 px, otherwise `manual`. `detect_strategy` is which search found the outline (`markers4`, `edges30`, `flood30`, `otsu`, or `manual`). The list is only in the phone’s memory. Closing the tab clears the list. The typed line length is remembered on the phone for next time.
