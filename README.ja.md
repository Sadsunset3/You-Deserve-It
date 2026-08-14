# You Deserve It（《活该》）ウェブゲーム MVP

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [**日本語**](README.ja.md)

ルームコード招待制のオンライン2人対戦AI道徳ディベートゲーム。各レールにシステムが「善人」を1人ランダムに配置し、各プレイヤーは自分のキャラクターを2人配置します。双方は3ラウンドの攻防を行い、変更できない6つの論証を残した上で、AI車掌による最終的なレールの決定と、共通の暗い哲学的審判を受け入れます。

**ライブデモを試す:** https://game.sadsunset.cloud/

舞台は単一の `100dvh` 画面内に固定されます。最初のラウンドの攻撃側はランダムで、ラウンドごとに交代します。攻撃、待機、防御、ラウンド結果はすべてモーダルで行われます。DeepSeekは各ラウンドの勝敗、レール全体の生死、試合後の皮肉な講評をそれぞれ処理し、入力には車掌の人格、キャラクター名と背景、タグカード、勝利論証、すべての論証が含まれます。プレイヤーはいつでも降参でき、ルーム設定の局数分の生存ポイントを累積します。

## ローカル実行

Node.js 24+ と pnpm 11+ が必要です。

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

開発モードでは、フロントエンドは `http://localhost:5173`、APIは `http://localhost:3000` にあります。AIはDeepSeekの公式OpenAI互換インターフェースを使用し、デフォルトモデルは `deepseek-v4-flash` です。ホストはルームを作成する前に自分のDeepSeekキーを入力してテストする必要があります。キーはそのルームのサーバーメモリにのみ保持され、ゲーム終了時に削除されます。

## 本番実行

```powershell
pnpm build
$env:SESSION_SECRET='32文字以上のランダムな文字列'
pnpm start
```

本番サーバーは、ウェブページ、REST、Socket.IOを同一オリジンで提供します。公開デプロイはHTTPSリバースプロキシの背後で実行し、`/socket.io` をWebSocketアップグレード用に設定する必要があります。SQLiteデータはデフォルトで `data/game.db` に書き込まれます。

## Docker

`.env` を作成し、少なくとも `SESSION_SECRET` を記入します:

```powershell
docker compose up --build
```

データは `game-data` ボリュームに保存されます。バックアップ時は新しいルームを停止するかコンテナを一時停止してから、そのボリューム内の `game.db`、`game.db-wal`、`game.db-shm` をコピーします。

## 検証

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

正式なブラウザ受け入れ基準は1280×720以上のデスクトップビューポートです。小さい画面では横向きまたはデスクトップデバイスの使用を促します。
