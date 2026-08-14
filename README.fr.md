# You Deserve It (《活该》) — MVP du jeu web

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [**Français**](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

Un jeu en ligne de débat moral par IA pour deux joueurs, invités via un code de salle. Sur chaque voie, le système place aléatoirement une personne « bonne », et chaque joueur place deux personnages ; les deux camps disputent trois rounds d'attaque et de défense, laissant six arguments immuables, puis acceptent la décision finale du conducteur IA et un verdict philosophique sombre partagé.

**Essayez la démo en ligne :** https://game.sadsunset.cloud/

La scène est fixée dans un unique écran de `100dvh`. L'attaquant du premier round est aléatoire et alterne à chaque round ; attaques, attentes, défenses et résultats de round se déroulent dans des modales. DeepSeek gère séparément la victoire ou la défaite de chaque round, la vie ou la mort de toute la voie et le commentaire ironique d'après-match, avec des entrées incluant la personnalité du conducteur, les noms et histoires des personnages, les cartes de traits, les arguments gagnants et tous les arguments. Les joueurs peuvent abandonner à tout moment et accumulent des points de survie selon le nombre de rounds configuré dans la salle.

## Exécution locale

Requiert Node.js 24+ et pnpm 11+.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

En développement, le frontend est sur `http://localhost:5173` et l'API sur `http://localhost:3000`. L'IA utilise l'interface officielle compatible OpenAI de DeepSeek, avec le modèle par défaut `deepseek-v4-flash`. L'hôte doit saisir et tester sa propre clé DeepSeek avant de créer une salle ; la clé n'est conservée que dans la mémoire serveur de cette salle et est supprimée à la fin de la partie.

## Production

```powershell
pnpm build
$env:SESSION_SECRET='une chaîne aléatoire d'au moins 32 caractères'
pnpm start
```

Le serveur de production sert la page web, l'API REST et Socket.IO depuis la même origine. Les déploiements publics doivent s'exécuter derrière un proxy inverse HTTPS avec `/socket.io` configuré pour les mises à niveau WebSocket. Les données SQLite sont écrites dans `data/game.db` par défaut.

## Docker

Créez `.env` et remplissez au moins `SESSION_SECRET` :

```powershell
docker compose up --build
```

Les données sont stockées dans le volume `game-data`. Pour sauvegarder, arrêtez les nouvelles salles ou mettez le conteneur en pause, puis copiez `game.db`, `game.db-wal` et `game.db-shm` depuis ce volume.

## Vérification

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

La référence d'acceptation navigateur est un viewport de bureau de 1280×720 ou plus. Les petits écrans sont invités à utiliser le mode paysage ou un appareil de bureau.
