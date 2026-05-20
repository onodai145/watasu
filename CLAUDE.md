# CLAUDE.md

このファイルはリポジトリ内のコードを扱う Claude Code (claude.ai/code) へのガイダンスを提供します。

## コマンド

```bash
pnpm install          # 依存関係のインストール（client/ も含む）
pnpm migrate          # DB設定反映（DATABASE_URLからprovider自動検出 → prisma db push）
pnpm start            # Hono サーバー起動（tsx で TypeScript を直接実行）
pnpm dev              # ウォッチモードで起動（ファイル変更時に自動再起動）
pnpm typecheck        # バックエンドの型チェック（tsc --noEmit）
pnpm build:ui         # Vue フロントエンドをビルドして public/spa/ に出力
pnpm test             # テストを一度だけ実行
pnpm test:watch       # ウォッチモードでテスト実行
pnpm test:coverage    # カバレッジレポート付きでテスト実行
```

単一テストファイルの実行:
```bash
pnpm vitest run tests/unit/users.test.ts
pnpm vitest run tests/integration/auth.test.ts
```

フロントエンド開発（HMR あり）:
```bash
# ターミナル1: Hono サーバー
pnpm dev

# ターミナル2: Vite 開発サーバー（http://localhost:5173）
pnpm dev:ui
```

型チェック（バックエンド・フロントエンド）:
```bash
pnpm typecheck                 # バックエンド（server/**/*.ts）
cd client && pnpm typecheck    # フロントエンド（client/src/**）
```

## アーキテクチャ

WebRTC P2P ファイル転送アプリ。ファイルデータはサーバーを経由しない — サーバーは認証と WebRTC シグナリングのみを担う。

**リクエストフロー:**
1. `server/index.ts` — エントリーポイント: `.env` 読み込み・DB マイグレーション実行・OIDC 初期化・HTTP サーバー起動・WebSocket アタッチ
2. `server/app.ts` — `secureHeaders`・`hono/logger`・`hono-rate-limiter`・`@hono/session`・3つのルーターを持つ Hono アプリ。`createAdaptorServer` で `http.Server` として export
3. `server/ws.ts` — WebSocket シグナリングサーバー。`server/session.ts` の `getSessionFromRequest` で JWE Cookie を復号してセッションを共有

**ルーター** (`server/routes/`):
- `auth.ts` — OIDC フロー (`/auth/login`, `/auth/callback`, `/auth/logout`) + ローカルログイン (`POST /auth/local/login`) + TOTP 認証 (`/auth/totp/verify`) + 初回セットアップ (`/setup`) + 自己登録 (`GET|POST /auth/register`、`ALLOW_REGISTRATION=true` 時のみ有効) — 認証系 GET ルートはすべて `public/spa/index.html` を配信
- `api.ts` — `/api/me`（自分のプロフィール更新）、`/api/ice-servers`（WebRTC ICE 設定）、TOTP セットアップ
- `admin.ts` — `GET /admin`（`requireAdmin` 後に SPA を配信）とユーザー管理 CRUD API（admin 限定）

**データベース (`server/prisma.ts`):** Prisma Client（v6）を使用。`prisma/schema.prisma` でスキーマを定義。`DATABASE_URL` のプレフィックスから DB を自動判別（`file:` → SQLite、`postgresql://` → PostgreSQL、`mysql://` → MySQL）。`pnpm migrate` を実行すると `scripts/update-provider.mjs` が `schema.prisma` の `provider` を自動書き換えてから `prisma db push` を適用するため、`.env` の `DATABASE_URL` を変更して `pnpm migrate` を叩くだけで DB 切り替えが完結する。テスト時は `DATABASE_URL=file:./data/test.db` を使用し、`singleFork` モードで直列実行。

**認証モデル:**
- ローカルユーザー: bcrypt パスワード + 任意の TOTP（otplib）。`server/users.ts` の `safeUser()` が `password_hash`・`totp_secret` を返却オブジェクトから除去する。
- OIDC ユーザー: セッションのみ・DB レコードなし — TOTP やプロフィール変更は不可。
- ロールは `user`（WebSocket で送信可能）と `admin`（ユーザー管理）の 2 種類。
- セッションは `@hono/session`（JWE 暗号化 Cookie + サーバーサイド Map ストア）で管理。`server/session.ts` に型・ストア・WebSocket 用復号ヘルパーをまとめている。

**WebSocket シグナリング (`server/ws.ts`):** ルームベース（1ルーム最大 2 ピア）。`sender` ロールには有効なセッションが必要、`receiver` は匿名可。`offer`・`answer`・`ice` メッセージをピア間でリレーする。空になったルームは削除される。

**フロントエンド構成:**
- `public/index.html` + `public/app.js` — メインの P2P 転送 UI（バニラ JS、変更なし）
- `public/spa/` — Vite でビルドされた Vue SPA。`/login`・`/login/totp`・`/setup`・`/admin` の各ルートを担う
- `client/` — Vue SPA のソース（Vite + Vue 3 + TypeScript）
  - `client/src/router/index.ts` — Vue Router 設定。`beforeEach` で `/admin` の認証チェック、`afterEach` で `body.center-page` クラスの付け外し（ログイン系ページの縦横中央寄せ）
  - `client/src/views/` — ページコンポーネント（`AdminView`・`LoginView`・`TotpView`・`SetupView`）
  - `client/src/services/api.ts` — ジェネリック fetch ラッパー

**SPA と Hono の認証境界:** HTML の配信は Hono が引き続きルートガード（`requireAdmin`・`requireSetup`）で保護する。SPA 側は Vue Router の `beforeEach` でも API 呼び出しにより認証を確認する。API エンドポイントは常に Hono 側で認証チェックを行う。

## テスト

supertest を使いインメモリ SQLite の実 Hono アプリ（`http.Server` として export）に対してテストを行う。DB のモックは使用しない。テストヘルパー (`tests/helpers/db.ts`) が `setup` / `teardown` / `reset` を提供し、`beforeAll`/`afterAll`/`beforeEach` で使用する。

SPA 移行後、HTML の内容チェックは `<div id="app">` の存在確認に変更済み（コンテンツはクライアント側でレンダリングされるため）。

`server/index.ts` はサーバー起動の副作用のみを含むためカバレッジ対象から除外されている。vitest は TypeScript ファイルをネイティブに処理するため、別途コンパイルは不要。

## 主要な環境変数

実行前に `.env.example` を `.env` にコピーする。最低限必要なのは `SESSION_SECRET`（本番では必ず変更）。OIDC は任意 — `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` を省略すると OIDC が無効になる。リバースプロキシの背後に置く場合は `TRUST_PROXY` を設定する（レートリミッターのクライアント IP 検出に影響）。自己登録を有効にするには `ALLOW_REGISTRATION=true` を設定し、必要に応じて `ALLOWED_EMAIL_DOMAINS` でドメインを制限する。
