# You Deserve It (《活该》) — Web-Spiel-MVP

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [**Deutsch**](README.de.md) · [日本語](README.ja.md)

Ein Online-Moraldebatten-Spiel mit KI für zwei Spieler, die sich über einen Raumcode einladen. Auf jeder Schiene platziert das System zufällig eine „gute" Person, und jeder Spieler stellt zwei eigene Figuren auf; beide Seiten bestreiten drei Runden Angriff und Verteidigung und hinterlassen sechs unveränderliche Argumente, um dann die endgültige Schienenentscheidung des KI-Zugführers und ein gemeinsames düsteres philosophisches Urteil zu akzeptieren.

**Demo live ausprobieren:** https://game.sadsunset.cloud/

Die Bühne ist in einem einzigen `100dvh`-Bildschirm fixiert. Der Angreifer der ersten Runde ist zufällig und wechselt von Runde zu Runde; Angriffe, Wartezeiten, Verteidigungen und Rundenausgänge laufen alle in Modals ab. DeepSeek übernimmt getrennt den Gewinn oder Verlust jeder Runde, Leben oder Tod der gesamten Schiene und den ironischen Kommentar nach dem Spiel, mit Eingaben wie der Persönlichkeit des Zugführers, den Namen und Hintergründen der Figuren, den Merkmalskarten, den Siegerargumenten und allen Argumenten. Spieler können jederzeit aufgeben und sammeln Überlebenspunkte über die pro Raum festgelegte Anzahl von Runden.

## Lokale Ausführung

Erfordert Node.js 24+ und pnpm 11+.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

Im Entwicklungsmodus ist das Frontend unter `http://localhost:5173` und die API unter `http://localhost:3000` erreichbar. Die KI nutzt die offizielle OpenAI-kompatible Schnittstelle von DeepSeek, Standardmodell `deepseek-v4-flash`. Der Gastgeber muss vor dem Erstellen eines Raums einen eigenen DeepSeek-Schlüssel eingeben und testen; der Schlüssel wird nur im Serverspeicher dieses Raums aufbewahrt und am Ende der Partie gelöscht.

## Produktion

```powershell
pnpm build
$env:SESSION_SECRET='eine zufällige Zeichenfolge mit mindestens 32 Zeichen'
pnpm start
```

Der Produktionsserver stellt Webseite, REST-API und Socket.IO von derselben Herkunft bereit. Öffentliche Bereitstellungen müssen hinter einem HTTPS-Reverse-Proxy laufen, wobei `/socket.io` für WebSocket-Upgrades konfiguriert ist. SQLite-Daten werden standardmäßig nach `data/game.db` geschrieben.

## Docker

Erstellen Sie `.env` und füllen Sie mindestens `SESSION_SECRET` aus:

```powershell
docker compose up --build
```

Die Daten liegen im Volume `game-data`. Sichern Sie, indem Sie neue Räume stoppen oder den Container pausieren und dann `game.db`, `game.db-wal` und `game.db-shm` aus diesem Volume kopieren.

## Verifikation

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Die formale Browser-Abnahmebasis ist ein Desktop-Viewport von 1280×720 oder mehr. Kleine Bildschirme werden aufgefordert, den Querformat- oder Desktop-Modus zu verwenden.
