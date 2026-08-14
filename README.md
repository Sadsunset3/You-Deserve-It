# You Deserve It (《活该》) — Web Game MVP

[**English**](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

An online two-player AI moral debate game, invited by room code. On each track the system randomly places one "good" person, and each player places two characters of their own; both sides fight three rounds of attack and defense, leaving six immutable arguments, then accept the AI conductor's final track decision and a shared dark philosophical verdict.

**Try the live demo:** https://game.sadsunset.cloud/

The stage is fixed within a single `100dvh` screen. The first-round attacker is random and alternates round by round; attacks, waits, defenses, and round results all happen in modals. DeepSeek separately handles single-round win/loss, whole-track life-or-death, and post-match ironic commentary, with input that includes the conductor's persona, character names and backgrounds, trait cards, winning arguments, and all arguments. Players may surrender at any time, and survival points accumulate across the number of rounds set per room.

## Running locally

Requires Node.js 24+ and pnpm 11+.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

In development, the frontend is at `http://localhost:5173` and the API at `http://localhost:3000`. The AI uses DeepSeek's official OpenAI-compatible interface, defaulting to the `deepseek-v4-flash` model. The host must enter and test their own DeepSeek key before creating a room; the key is kept only in that room's server memory and is deleted when the game ends.

## Production

```powershell
pnpm build
$env:SESSION_SECRET='a random string of at least 32 characters'
pnpm start
```

The production server serves the web page, REST API, and Socket.IO from the same origin. Public deployments must run behind an HTTPS reverse proxy with `/socket.io` configured for WebSocket upgrades. SQLite data is written to `data/game.db` by default.

## Docker

Create `.env` and fill in at least `SESSION_SECRET`:

```powershell
docker compose up --build
```

Data is stored in the `game-data` volume. To back up, stop new rooms or pause the container, then copy `game.db`, `game.db-wal`, and `game.db-shm` from that volume.

## Verification

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The formal browser acceptance baseline is desktop viewports of 1280×720 and above. Small screens are prompted to use landscape mode or a desktop device.
