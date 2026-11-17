# Phone ⇄ PC transfer: flick, NFC sticker, button

Move what's playing on Ghosttunes Mobile to Ghosttunes on your PC (same song, same second, same queue), and back.

| Trigger | Works when | Where |
| --- | --- | --- |
| **Flick** | App open, or (setting on) music playing with the screen on | Flick the phone toward the PC |
| **NFC sticker** | Always, even with the app closed | Tap the phone on a sticker by the PC |
| **Send to PC button** | App open | Now Playing → device button → "Ghosttunes on your PC" |
| **Quick Settings tile** | Always | Pull down the shade → "Send to PC" |

All four run the same logic:

- **Phone is playing → PUSH.** The phone sends the track, queue, position and device name. The PC starts the song at the same second. The phone **keeps playing** until the PC reports it is actually playing, then fades out over 0.9 s and pauses. Pill: "Sending to PC…" → "Now playing on your PC".
- **Phone is idle, PC is playing → PULL.** The phone asks the PC what it's playing, starts that song at the live position (plus load time), lands on the exact second once ExoPlayer is playing, and tells the PC to fade out. Pill: "Moved to your phone".
- **Neither playing →** "Nothing is playing on your PC."
- **Errors:** "Open Ghosttunes on your PC first." (desktop app not open) · "Can't reach your PC. Same Wi-Fi?" · "Your PC didn't start playing in time." (15 s; the phone keeps playing and sends a release so both don't play).

## Setup

1. **Same network.** Phone and PC on the same Wi-Fi. (University and office Wi-Fi often isolate devices; a phone hotspot or home Wi-Fi works.)
2. **Ghosttunes open on the PC.** The desktop app runs the server on port 3001 and listens for handoffs.
3. **PC address in the app.** First launch asks for it. *Find my PC* scans your Wi-Fi subnet for `:3001/api/health`. Change it later in Settings → Your PC.
4. **Firewall.** Windows must allow Ghosttunes inbound on TCP 3001. Windows asks the first time the desktop app runs; allow it. (See the final report for the exact check on this PC.)

## Writing the NFC sticker

Any NTAG213/215/216 sticker.

1. Install **NFC Tools** (wakdev) from the Play Store.
2. **Write** → **Add a record** → **Custom URL / URI**.
3. Enter `ghosttunes://handoff` → OK.
4. Tap **Write** and hold a blank sticker to the back of the phone until it confirms.
5. Stick it near your PC.

Tapping it opens a tiny transparent screen that shows the pill and closes itself; the full app doesn't open. NFC must be on (Settings → Connected devices → NFC). A second read within 4 s is ignored.

## The flick

Hold the phone and give it a short, sharp flick toward your PC, like flicking water off your hand: a quick push that **stops abruptly**. The phone buzzes once when it fires.

What counts as a flick (Medium sensitivity):

- A push of **≥ 19 m/s²**, with more than **70%** of it on one axis, held for at least **40 ms**.
- Then **braking ≥ 11 m/s²** in the opposite direction within **380 ms**.
- The phone was fairly steady just before: no spike ≥ 12 m/s² and an average under 3.5 m/s² in the ~0.45 s before the push. (This is what rejects walking, running and pocket motion; a small wind-up is fine.)
- Not in a pocket (proximity sensor "near") and not face down.
- **5 s cooldown** after each flick.

Sensitivity in Settings → Send to PC scales the push and brake thresholds: **Low ×1.2** (firmer flick), **Medium ×1.0**, **High ×0.85** (lighter flick).

**Background flick** (Settings → "Flick works in background"): while music is playing and the screen is on, the playback service (already a foreground service) listens even when you're in another app. It unregisters the sensor when playback pauses or the screen turns off, so it costs nothing while idle. When the app is open on screen, the activity listens instead; there's only ever one listener.

Sensor: `TYPE_LINEAR_ACCELERATION` at 100 Hz. Phones without it fall back to the accelerometer with a low-pass gravity filter.

### Tuning on your phone: the debug screen

Settings → About → tap **Version** 7 times. The **Flick debug** screen shows:

- which sensor is used and the current thresholds,
- a live graph of x / y / z acceleration with the push and brake thresholds dashed,
- every detection with a timestamp,
- **Simulate flick**: feeds a synthetic flick through a real detector with your sensitivity. If it's detected it triggers a **real** handoff (useful for testing PUSH without moving the phone).

If real flicks don't register, check the graph peaks: if your flicks peak around 15–18 m/s², switch to High. If something else triggers it, switch to Low and tell me what motion did it.

### Tests

`./gradlew :app:testDebugUnitTest` runs `FlickDetectorTest`: 20 simulated 100 Hz traces.

- **Fire:** a flick on each axis in both directions; a flick from raw accelerometer data (gravity filter path); a flick with a backswing; sensitivity levels; the cooldown.
- **Never fire:** walking 60 s, running 60 s (in hand and on the raw path), picking the phone up at 4 intensities, picking up while rotating 70°, putting it on a table with impacts of 20, 30 and 40 m/s², dropping it face down, 60 s in a pocket (with and without a proximity sensor), a push without braking, braking too late, a diagonal push, a weak flick, motion with no history, and 20 random noise seeds for each case.

## How it works

The PC's server (`serverHandoff.js`) relays between the two apps:

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `GET /api/handoff/events` | Desktop | SSE: `handoff` {id, snapshot, stampedAt}, `release`; 15 s heartbeat |
| `POST /api/handoff/presence` | Desktop | What the PC is playing, every 2 s (expires after 8 s) |
| `GET /api/handoff/desktop` | Phone | `{online, nowPlaying}` with the live position |
| `POST /api/handoff/push` | Phone | Sends the snapshot; `409 desktop_offline` if the PC app isn't connected |
| `GET /api/handoff/:id` | Phone | Polled every 300 ms after a push |
| `POST /api/handoff/:id/status` | Desktop | `playing` or `failed` |
| `POST /api/handoff/release` | Phone | Tells the PC to fade out |

**Exact second.** A push is stamped with server time, which is PC time, so the PC seeks to `position + (now − stampedAt)/1000 + 0.35 s` on load. A pull uses the position the server brought up to date and the moment the reply arrived on the phone, then corrects once ExoPlayer is playing.

**Track data.** The phone sends the same Track shape as the desktop (`src/types.ts`), never device-local URLs: non-https artwork becomes `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. The queue is capped at 300 around the current song (on the phone and again on the server).

**Android pieces.** `HandoffActivity` (translucent, `excludeFromRecents`) handles `NDEF_DISCOVERED` and `VIEW` for `ghosttunes://handoff` and the tile. `HandoffCoordinator` does PUSH/PULL through the same `MediaController` as the UI, so it works without the main screen. `FlickSensor` + `FlickDetector` (pure Kotlin, JVM-tested) detect the gesture. `SendToPcTileService` is the Quick Settings tile.
