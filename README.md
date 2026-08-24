# Canvas Notify

A Chrome extension that watches Canvas for upcoming assignments and sends
reminders to Telegram, so a deadline never depends on remembering to open
Canvas.

The point of it is the timing. A reminder that fires the same number of days
ahead for every assignment is useless, because a 5-point discussion post and a
300-point project need very different amounts of warning.

## How the lead time is decided

Lead time scales with what the assignment is worth, then adjusts for what kind
of work it is:

| Points | First reminder |
| --- | --- |
| ≤ 10 | 12 hours ahead |
| ≤ 50 | 1 day |
| ≤ 150 | 3 days |
| ≤ 300 | 1 week |
| > 300 | 2 weeks |

A quiz shifts one step earlier (you can sit down and finish it). An upload
shifts one step later (it needs real work first). Small assignments send at
9:30pm, when there is still time to knock one out; big ones send at 10:00am.

It also picks up new course announcements.

## Setup

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. Open the popup → **Settings**, and fill in:
   - **Canvas token** — Canvas → Account → Settings → New Access Token
   - **Telegram bot token** — from [@BotFather](https://t.me/BotFather)
   - **Chat ID** — message the bot, then open
     `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. **Send Test Message** to confirm, then **Save**.

Polls every 30 minutes. Credentials live in `chrome.storage.local` on your own
machine and are sent only to Canvas and Telegram.

## Pointing it at another school

The Canvas host is hardcoded to `utampa.instructure.com`. Change the two
`fetch` URLs in `background.js` and the matching `host_permissions` entry in
`manifest.json`.
