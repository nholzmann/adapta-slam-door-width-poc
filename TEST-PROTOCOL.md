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
2. Point the camera at a textured floor about a meter in front of you, then slowly push the phone forward about a foot and pull it back, two or three times, keeping the floor in view. The on-screen animation shows the motion. The animation disappears and the status turns green **NORMAL** when scale is found. A floor with some texture (wood grain, tile grout, a rug pattern) works better. A plain carpet or a shiny floor makes tracking worse. Note the floor type and the lighting later.
3. Wait until the top-left word is **NORMAL** and the text is green. If it says INITIALIZING, LIMITED, or NOT_AVAILABLE, push the phone forward and pull it back again. Do not tap yet. Words after the status (for example EXCESSIVE_MOTION) mean the phone wants you to slow down or show it more texture.
4. Look at the top-right number, like `1.32 m / 52.0 in`. That is how high the phone thinks it is above the floor. It should look like the height of the phone in your hand, roughly 1.1–1.6 m (about 43–63 in). If NORMAL is green but the height is nonsense (a few inches, or up near the ceiling), tap **Recenter**, then push the phone forward and pull it back again until both look right.

## If nothing shows on screen

Open the **Debug log** drop-down at the bottom. Read the last lines of the panel. Send a screenshot of that panel to the person collecting results.

## Mark the door

1. When the instruction says so, tap the floor **where the left jamb meets the floor**. A small dot should stick to that spot.
2. Tap the floor **where the right jamb meets the floor**. A second dot and a line should appear.
3. The big number is the floor measurement, in inches, with centimeters under it. The smaller line (`feature hit: …`) is a second method. If it says `feature hit: none`, that is fine — write that down, do not retry just to force a feature hit.
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

Use **Recenter** only when tracking is lost or the camera-height number looks wrong. Recenter starts tracking over and clears the dots. Do not use it between the three readings, or the drift check is wasted.

Write down the camera-height inches from the top right (or from the saved row) for that door. Also write the floor type (wood, tile, carpet, concrete, rug) and the lighting (daylight, overhead lights, dim, mixed).

## Results table

Copy this into your notes. One row per door. Leave the pass/fail judgment to the person collecting the sheets. Both **±0.5 in** and **±1.0 in** will be looked at. The raw delta is what matters.

`delta_from_actual` = mean minus the tape measure. Keep the sign. If the tape says 36.0 and the mean is 35.8, delta is **-0.2** (the page read low). Mean is the three readings added together, divided by 3, to one decimal.

| door | actual_in | reading1 | reading2 | reading3 | mean | delta_from_actual | camera_height_in | phone model + OS | floor type | tracking felt stable (y/n) | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |

`reading1`, `reading2`, and `reading3` are the big floor-method inches (not the feature-hit line). You can add the feature-hit number in notes if you want.

## Paste the copied results

After each door, or before you close the page, tap **Copy results**. Paste that into your notes under the table. It is tab-separated and looks like this:

```
n	floor_in	feature_in	camera_height_in	tracking
1	35.8	35.6	52.0	NORMAL
```

If there was no feature hit, that column says `none`. The list is only in the phone's memory. Closing the tab clears it. The paste is the record.

The on-page list shows the same readings. Feature inches there are `—` when there was no feature hit. Height is the camera height in inches at the moment the second jamb was tapped. Tracking is the status word at that moment.
