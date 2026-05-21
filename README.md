# Watasu

> 🤖 Built with [Claude Code](https://claude.ai/code) — [MIT License](./LICENSE)

WebRTC DataChannel によるブラウザ間 P2P ファイル転送アプリ。  
ファイルはサーバーを経由せず直接送受信されます。

## 機能

- **P2P 転送** — WebRTC DataChannel でファイルをチャンク分割転送。サーバーにデータは残らない
- **認証済みユーザーのみ送信可** — 受信者はアカウント不要
- **ローカルアカウント** — 管理者がサーバー側でユーザーを作成、または `ALLOW_REGISTRATION=true` でユーザー自己登録を有効化
- **OIDC 認証** — Google・Keycloak・Auth0 など任意の OIDC プロバイダに対応
- **ロール管理** — `user` / `admin` の 2 ロール
- **2段階認証 (TOTP)** — Google Authenticator などの認証アプリに対応
- **設定パネル** — ログイン後にアバターをクリックして表示名・パスワード・TOTP を変更
- **管理画面** — admin ロールのユーザーがユーザー CRUD・ロール変更・サーバー情報を確認
- **マルチ DB 対応** — SQLite（デフォルト・設定不要）/ PostgreSQL / MySQL を `DATABASE_URL` で切り替え
- **ICE サーバー設定** — 自前の STUN/TURN サーバーを設定可能

## 必要環境

- Node.js 22 以上（`.nvmrc` 参照）
- pnpm（`corepack enable` で有効化）

## 開発

```bash
pnpm migrate    # DB スキーマ適用（初回・DATABASE_URL 変更後に実行）

# ターミナル1: Hono サーバー（ファイル変更時に自動再起動）
pnpm dev

# ターミナル2: Vite 開発サーバー（HMR）
pnpm dev:ui
# → http://localhost:5173 でフロントエンドにアクセス
```

フロントエンドのビルド:
```bash
pnpm build:ui   # public/spa/ に出力
```

型チェック:
```bash
pnpm typecheck                 # バックエンド（server/**/*.ts）
cd client && pnpm typecheck    # フロントエンド（client/src/**）
```

## Docker で起動

```bash
cp .env.example .env
# .env を編集（SESSION_SECRET は必ず変更）

docker compose up -d
```

初回は http://localhost:3000/setup で管理者アカウントを作成。

**データの永続化**  
`app-data` ボリュームに SQLite ファイルが保存されます。ログは標準出力に出力されます。

```bash
# ログを確認
docker compose logs -f
```

**PostgreSQL を使う場合**  
`docker-compose.yml` の `db` サービスのコメントを外し、`.env` に以下を設定してください：

```env
DATABASE_URL=postgresql://p2p:password@db:5432/p2p
```

`pnpm migrate`（DB への接続とスキーマ適用）は Docker 起動時に自動実行されます。

## 通常起動

```bash
cp .env.example .env
# .env を編集（最低限 SESSION_SECRET を変更）
pnpm install
pnpm migrate    # DB スキーマ適用
pnpm build:ui   # Vue フロントエンドをビルド
pnpm start
```

http://localhost:3000 にアクセス。

初回起動時はユーザーが 0 人のため、http://localhost:3000/setup にアクセスして管理者アカウントを作成します。  
一度ユーザーが作成されると `/setup` は自動的に無効化されます。

その後 http://localhost:3000/admin で管理画面にアクセスできます。

## 環境変数

### アプリ

| 変数 | 説明 | デフォルト |
|---|---|---|
| `PORT` | リスンポート | `3000` |
| `BASE_URL` | アプリのベース URL（OIDC リダイレクト URI に使用） | `http://localhost:3000` |
| `SESSION_SECRET` | セッション署名キー（**本番では必ず変更**） | `dev-secret-...` |
| `ALLOW_REGISTRATION` | `true` のときユーザー自己登録を有効化 | 無効 |
| `ALLOWED_EMAIL_DOMAINS` | 登録を許可するドメイン（カンマ区切り。未設定時は制限なし） | 無制限 |

### リバースプロキシ

| 変数 | 説明 | デフォルト |
|---|---|---|
| `TRUST_PROXY` | プロキシが存在するネットワークセグメント | 未設定（プロキシなし） |

`X-Forwarded-For` のうち、指定セグメントから付加されたエントリのみを信頼し、それ以外の最初の IP をクライアント IP として扱います（レートリミット・ログの IP に影響）。

```env
# CIDR 指定（推奨）: プロキシが存在するサブネット
TRUST_PROXY=10.0.0.0/8

# 複数セグメントをカンマ区切りで列挙
TRUST_PROXY=10.0.0.1,192.168.1.0/24

# ホップ数指定（プロキシのサブネットが不明な場合のフォールバック）
TRUST_PROXY=1
```

### データベース

| 変数 | 説明 | デフォルト |
|---|---|---|
| `DATABASE_URL` | DB 接続 URL（未設定なら SQLite を自動使用） | — |

```env
# SQLite（デフォルト）→ 設定不要。data/app.db を自動で使用

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# MySQL / MariaDB
DATABASE_URL=mysql://user:password@localhost:3306/mydb
```

`DATABASE_URL` を変更したら `pnpm migrate` を実行してスキーマを適用してください。

### OIDC（任意）

| 変数 | 説明 |
|---|---|
| `OIDC_ISSUER` | OIDC プロバイダの issuer URL |
| `OIDC_CLIENT_ID` | クライアント ID |
| `OIDC_CLIENT_SECRET` | クライアントシークレット |

リダイレクト URI は `{BASE_URL}/auth/callback` に設定してください。

対応プロバイダ例：

```env
# Google
OIDC_ISSUER=https://accounts.google.com

# Keycloak
OIDC_ISSUER=https://your-keycloak/realms/myrealm

# Auth0
OIDC_ISSUER=https://your-tenant.auth0.com
```

### ICE サーバー（WebRTC）

| 変数 | 説明 | デフォルト |
|---|---|---|
| `STUN_URLS` | STUN サーバー URL（カンマ区切り） | Google の公開 STUN |
| `TURN_URL` | TURN サーバー URL | — |
| `TURN_USERNAME` | TURN ユーザー名 | — |
| `TURN_CREDENTIAL` | TURN パスワード | — |

### ログ

| 変数 | 説明 | デフォルト |
|---|---|---|
| `LOG_LEVEL` | `trace` / `debug` / `info` / `warn` / `error` | `info` |
| `LOG_FILE` | ファイル出力先（stdout にも同時出力） | 未設定（stdout のみ） |
| `LOG_PRETTY` | `0` でカラー表示を無効化 | 開発時は有効、`NODE_ENV=production` で無効 |

ログを取るイベント：HTTP リクエスト全般・認証の成功/失敗・TOTP 操作・管理者によるユーザー操作・WebSocket の入退室。

```bash
# 開発（カラー表示）
pnpm dev

# 本番（JSON + ファイル出力）
NODE_ENV=production LOG_FILE=logs/app.log pnpm start
```

## DB の切り替え

`.env` の `DATABASE_URL` を設定して `pnpm migrate` を実行するだけで切り替えられます。

```bash
# .env を編集
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# スキーマ適用（URL プレフィックスから provider を自動設定 → prisma db push）
pnpm migrate
```

SQLite に戻す場合は `DATABASE_URL` を削除して `pnpm migrate` を実行します。スキーマは `prisma/schema.prisma` で管理されており、`pnpm migrate` 実行時に `schema.prisma` の `provider` を自動で書き換えます。

## リバースプロキシの設定例（nginx）

WebSocket（シグナリング）のための `Upgrade` ヘッダー転送が必須です。

```nginx
server {
    listen 443 ssl;
    server_name transfer.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket（シグナリング）のために必須
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

## ファイル構成

```
├── server/                    # Hono サーバー（TypeScript）
│   ├── index.ts               # エントリーポイント（HTTP サーバー起動）
│   ├── app.ts                 # Hono アプリ（ミドルウェア・ルーティング）
│   ├── session.ts             # セッション管理（@hono/session + WebSocket 用復号）
│   ├── errors.ts              # UserError（ユーザー向けエラークラス）
│   ├── ws.ts                  # WebSocket シグナリングサーバー
│   ├── prisma.ts              # Prisma Client シングルトン
│   ├── users.ts               # ユーザー CRUD・パスワード認証・TOTP
│   ├── oidc.ts                # OIDC クライアント初期化
│   ├── logger.ts              # Pino ロガー設定
│   └── routes/
│       ├── auth.ts            # 認証ルート（ローカル・OIDC・TOTP）
│       ├── api.ts             # REST API（/api/me・ICE サーバー・TOTP 管理）
│       └── admin.ts           # 管理画面・ユーザー管理 API
├── prisma/
│   ├── schema.prisma          # DB スキーマ（pnpm migrate で provider が自動更新される）
│   └── migrations/            # Prisma マイグレーション履歴
├── client/                    # Vue SPA ソース（Vite + Vue 3 + TypeScript）
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/index.ts    # Vue Router（ナビゲーションガード含む）
│   │   ├── views/             # AdminView・LoginView・TotpView・SetupView・ServerView・SettingsView
│   │   ├── components/        # ThemeToggle.vue
│   │   ├── composables/       # useTheme.ts
│   │   └── services/api.ts    # fetch ラッパー
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── scripts/
│   └── update-provider.mjs    # DB_TYPE から Prisma provider を自動設定
├── public/                    # 静的ファイル
│   ├── index.html             # メインアプリ（P2P 転送 UI）
│   ├── app.js                 # WebRTC・UI ロジック
│   ├── style.css              # 共有スタイル（Tokyo Night テーマ）
│   └── spa/                   # Vue SPA ビルド成果物（pnpm build:ui で生成）
├── tests/
│   ├── helpers/db.ts
│   ├── unit/users.test.ts
│   └── integration/
│       ├── auth.test.ts
│       ├── api.test.ts
│       └── admin.test.ts
└── data/
    └── app.db                 # SQLite ファイル（自動生成・.gitignore 済み）
```

## アクセス制御

| エンドポイント | 条件 |
|---|---|
| `GET /` | 誰でも（受信者として利用可能） |
| `GET /login` | 誰でも |
| `GET /register` | `ALLOW_REGISTRATION=true` のときのみ |
| `GET /setup` | ユーザーが 0 人のときのみ |
| WebSocket `role=sender` | ログイン済みユーザーのみ |
| WebSocket `role=receiver` | 誰でも |
| `GET /admin` | `admin` ロールのみ |
| `PATCH /api/me` | ログイン済みローカルユーザーのみ |

## ファイル転送の仕組み

```
送信者                    シグナリングサーバー              受信者
  │                            │                            │
  ├── join (role=sender) ───→  │                            │
  │                            │  ←── join (role=receiver) ─┤
  │  ←── peer_joined ──────────┤                            │
  │                            │                            │
  ├── offer (SDP) ──────────→  │ ──── offer (SDP) ────────→ │
  │  ←── answer (SDP) ─────────┤ ←─── answer (SDP) ─────────┤
  ├── ICE candidates ────────→ │ ──── ICE candidates ──────→ │
  │                            │                            │
  ╔═══════════════════ P2P DataChannel 確立 ════════════════╗
  ║  metadata JSON → binary chunks (64KB) → reassemble      ║
  ╚════════════════════════════════════════════════════════╝
```

## セキュリティ上の注意

- `SESSION_SECRET` は本番環境では十分に長いランダム文字列を使用してください（`openssl rand -base64 32` など）
- HTTPS 環境では `NODE_ENV=production` を設定すると Cookie に `Secure` 属性が付与されます
- リバースプロキシを前段に置く場合は `TRUST_PROXY` を設定してください。未設定のままだとレートリミッターがクライアント IP で機能しません
- STUN のみの構成では対称 NAT 環境で接続できない場合があります。その場合は TURN サーバーを設定してください
- OIDC ユーザーはプロフィール編集（表示名・パスワード・TOTP）に対応していません

## テスト

```bash
pnpm test
pnpm test:coverage
```

Vitest + supertest によるユニットテスト・統合テスト（TypeScript）。テスト時はテスト専用 SQLite（`data/test.db`）を使用するため、実データに影響しません。
