# You Deserve It (《活该》) — MVP de juego web

[English](README.md) · [简体中文](README.zh-CN.md) · [**Español**](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

Un juego en línea de debate moral con IA para dos jugadores, invitados mediante código de sala. En cada vía, el sistema coloca aleatoriamente una persona "buena", y cada jugador coloca dos personajes propios; ambos bandos disputan tres rondas de ataque y defensa, dejando seis argumentos inmutables, para después aceptar la decisión final de la vía por parte del conductor IA y un veredicto filosófico oscuro compartido.

**Prueba la demo en vivo:** https://game.sadsunset.cloud/

El escenario está fijado dentro de una única pantalla de `100dvh`. El atacante de la primera ronda es aleatorio y se alterna ronda a ronda; los ataques, las esperas, las defensas y los resultados de ronda ocurren todos en ventanas modales. DeepSeek maneja por separado la victoria o derrota de cada ronda, la vida o la muerte de la vía completa y el comentario irónico posterior, con entradas que incluyen la personalidad del conductor, los nombres y trasfondos de los personajes, las tarjetas de rasgos, los argumentos ganadores y todos los argumentos. Los jugadores pueden rendirse en cualquier momento y acumulan puntos de supervivencia según el número de rondas configurado en la sala.

## Ejecución local

Requiere Node.js 24+ y pnpm 11+.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

En desarrollo, el frontend está en `http://localhost:5173` y la API en `http://localhost:3000`. La IA usa la interfaz oficial compatible con OpenAI de DeepSeek, con el modelo por defecto `deepseek-v4-flash`. El anfitrión debe ingresar y probar su propia clave de DeepSeek antes de crear una sala; la clave se guarda solo en la memoria del servidor de esa sala y se elimina al terminar la partida.

## Producción

```powershell
pnpm build
$env:SESSION_SECRET='una cadena aleatoria de al menos 32 caracteres'
pnpm start
```

El servidor de producción sirve la página web, la API REST y Socket.IO desde el mismo origen. Los despliegues públicos deben ejecutarse detrás de un proxy inverso HTTPS con `/socket.io` configurado para las actualizaciones WebSocket. Los datos SQLite se escriben en `data/game.db` por defecto.

## Docker

Crea `.env` y completa al menos `SESSION_SECRET`:

```powershell
docker compose up --build
```

Los datos se guardan en el volumen `game-data`. Para hacer una copia de seguridad, detén las nuevas salas o pausa el contenedor y copia `game.db`, `game.db-wal` y `game.db-shm` de ese volumen.

## Verificación

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

La línea base de aceptación en navegador es de viewports de escritorio de 1280×720 o superiores. Las pantallas pequeñas reciben un aviso para usar el modo horizontal o un dispositivo de escritorio.
