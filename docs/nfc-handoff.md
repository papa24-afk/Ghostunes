# Tap / flick to transfer (phone ⇄ PC handoff)

Move what's playing on your Android phone to Ghosttunes on your PC — same song, same second, same queue — and back again. There are three ways to trigger it:

| Trigger | Works when | How |
| --- | --- | --- |
| **NFC sticker** | App open *or in the background* | Tap the phone on a sticker near your PC |
| **Flick** | App open on screen | Flick the phone toward your PC |
| **Button** | App open | Full-screen Now Playing → **Send to PC** / **Get from PC** |

What happens depends on the phone:

- **Phone is playing → push.** The PC starts the same song at the same position. The phone keeps playing until the PC reports it is actually playing, then fades out (~0.9 s). No silent gap.
- **Phone is not playing, PC is → pull.** The phone picks up the PC's song, queue and position. Once the phone is actually playing, the PC fades out.
- **Neither is playing →** "Nothing is playing on your PC."

## Setup

1. **Same network.** Phone and PC on the same Wi-Fi (or the PC on Ethernet in the same LAN).
2. **Open Ghosttunes on the PC.** The desktop app runs the music server on port `3001` and keeps a connection open for handoffs.
3. **Server address on the phone.** The APK is built with `VITE_API_BASE_URL=http://<PC-IP>:3001`. To change it later: About → **Music server** → enter `http://<PC-IP>:3001` → *Save and reconnect*. Find the PC's IP with `ipconfig` (the IPv4 address of your Wi-Fi or Ethernet adapter, not WSL/Hyper-V/VPN).
4. **Firewall.** Windows must allow inbound TCP 3001 on *Private* networks. Windows usually asks the first time Ghosttunes starts; choose *Private networks*. To add the rule manually (admin PowerShell):

   ```powershell
   New-NetFirewallRule -DisplayName "Ghosttunes (TCP 3001)" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
   ```

   Also make sure your Wi-Fi network is set to *Private* in Windows settings.

## Writing the NFC sticker

Any NTAG213/215/216 sticker works.

1. Install **NFC Tools** (wakdev) from the Play Store.
2. **Write** → **Add a record** → **Custom URL / URI**.
3. Enter `ghosttunes://handoff` and confirm.
4. Tap **Write** and hold the sticker to the back of the phone.
5. Stick it somewhere near your PC (desk, monitor stand, speaker).

Tapping the sticker opens Ghosttunes (or brings it to the front) and triggers the handoff. NFC must be turned on in Android settings. A double read within 4 s is ignored.

## The flick gesture

With Ghosttunes open on screen, hold the phone and give it a short, sharp flick toward the PC — a quick push that stops abruptly, like flicking water off your hand. The phone vibrates briefly when it registers.

- It needs a strong push (≥ 19 m/s²) mostly along one axis, then braking in the opposite direction within 380 ms.
- The phone has to be fairly steady just before the flick, so walking, running and picking the phone up don't trigger it (`tests/flick-gesture.cjs` simulates these).
- After a flick there is a 5 s cooldown. It only listens while the app is visible.
- Turn it off in About → **Flick to PC**.

## How it works

The PC's server (`serverHandoff.js`) relays between the two apps:

| Endpoint | Who | Purpose |
| --- | --- | --- |
| `GET /api/handoff/events` | Desktop | SSE stream: `handoff` `{id, snapshot, stampedAt}` and `release` events, 15 s heartbeat |
| `POST /api/handoff/presence` | Desktop | Every 2 s: what the PC is playing (stamped with server time, expires after 8 s) |
| `GET /api/handoff/desktop` | Phone | `{online, nowPlaying}`, with the position brought up to date |
| `POST /api/handoff/push` | Phone | Sends `{track, queue, queueIndex, position, isPlaying, deviceName}`; `409 desktop_offline` if the PC app isn't connected |
| `POST /api/handoff/:id/status` | Desktop | `playing` or `failed` |
| `GET /api/handoff/:id` | Phone | Polled every 300 ms after a push |
| `POST /api/handoff/release` | Phone | Tells the PC to fade out (after a pull, or a timed-out push) |

**Landing on the exact second.** The server runs on the PC, so a push is stamped with server time, which is PC time. When the PC loads the song it seeks to `position + (now − stampedAt)/1000 + 0.35 s`. On a pull, the server brings the PC's position up to date and the phone uses the moment the reply arrived.

**Privacy and local files.** Before anything leaves a device, offline file paths and `file://` / custom-protocol artwork are stripped. Artwork falls back to `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. The PC still checks its own offline copies. The queue is capped at 300 tracks around the current song.

**Failures.** If the PC fails to play, or doesn't confirm within ~15 s, the phone keeps playing. On a timeout the phone also sends a release, so you never end up with both playing.

**Android.** `MainActivity` handles `ghosttunes://handoff` from `NDEF_DISCOVERED` and `VIEW` intents (in `onCreate` and `onNewIntent`), and dispatches a `ghosttunes:handoff` window event. On a cold start it retries every 500 ms until the web app sets `window.__ghosttunesHandoffReady`.
