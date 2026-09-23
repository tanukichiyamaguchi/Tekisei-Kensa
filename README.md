# Tekisei-Kensa（適性検査システム）

既存の適性検査システム（first-inspection.jp 相当）と同等の分析ロジック・視覚化を備えたシステムを構築するためのリポジトリです。

## ドキュメント

- [要件定義書](docs/要件定義書.md)
- [付録A 設問一覧](docs/付録A_設問一覧.md)
- [付録B 採点ロジック仕様](docs/付録B_採点ロジック仕様.md)
- [付録C 表示文言マスタ](docs/付録C_表示文言マスタ.md)
- [付録D AI 解説仕様](docs/付録D_AI解説仕様.md)
- [付録E グラフ仕様](docs/付録E_グラフ仕様.md)

## 基本設計書

- [00 共通定義](docs/基本設計/00_共通定義.md) — 用語、命名規約、テーブル一覧、型、API 規約、役割、設計判断一覧
- [01 システム構成](docs/基本設計/01_システム構成.md)
- [02 データベース設計](docs/基本設計/02_データベース設計.md)
- [03 採点エンジン設計](docs/基本設計/03_採点エンジン設計.md)
- [04 API 設計](docs/基本設計/04_API設計.md)
- [05 画面設計（受検者）](docs/基本設計/05_画面設計_受検者.md)
- [06 画面設計（管理者）](docs/基本設計/06_画面設計_管理者.md)
- [07 AI 解説と PDF](docs/基本設計/07_AI解説とPDF.md)
- [08 実装計画とテスト計画](docs/基本設計/08_実装計画とテスト計画.md)
- [09 要件対応表](docs/基本設計/09_要件対応表.md) — 要件定義書の機能・画面と分冊の対応、不具合修正の対応、未解決事項
- [10 決定記録](docs/基本設計/10_決定記録.md) — 依頼主の判断が必要だった事項への回答の記録

## 検証用データ

- [tests/fixtures/README.md](tests/fixtures/README.md) — 既存システムの回答データ 73 件を匿名化した検証用データの説明
- `tests/fixtures/existing_results.json` — データ本体
- `tests/verify_fixtures.py` — 整合性確認スクリプト（`python3 tests/verify_fixtures.py`）

## 開発

実装計画は [08 実装計画とテスト計画](docs/基本設計/08_実装計画とテスト計画.md) のマイルストーン（M0〜M6）に沿って進めます。現在は M4（管理者 API・管理画面・E2E）まで実装済みです。AI 解説の生成と PDF 出力は M5 で追加します。

必要なもの: Node.js 22 系（`.nvmrc`）、pnpm（`package.json` の `packageManager` の版。Corepack で有効化）、Java 21（Firebase Emulator の実行に必要）。

```bash
pnpm install --frozen-lockfile
pnpm run ci                # lint・format・typecheck・マスタ再生成検査・単体テスト（CI と同じ）
pnpm test:integration:emu  # Firebase Emulator を起動して結合テストを実行し、終了後に止める
```

E2E（Playwright。ビルド済みのアプリを Emulator の中で起動する。CI では PR に `run-e2e` ラベルを付けると `e2e` ワークフローが実行される）:

```bash
pnpm exec playwright install chromium   # 初回のみ
pnpm build
pnpm firebase emulators:exec --only auth,firestore --project demo-tekisei "pnpm seed:local && pnpm test:e2e"
```

ローカルで受検者画面・管理 API を動かす手順（Emulator のみを使い、本番・検証の Firebase プロジェクトには接続しません）:

```bash
cp .env.example .env.local        # PDF_TOKEN_SECRET と SEED_OWNER_PASSWORD を埋める
pnpm emulators                    # 別の端末で起動したままにする（Emulator UI: http://127.0.0.1:4000）
pnpm seed:local                   # 組織 1・オーナー 1・管理者 1・送信済み受検者 10・下書き 1 を投入
pnpm dev                          # http://localhost:3000
```

受検者画面は `http://localhost:3000/exam?q={組織ID}&p=user`（既存スタッフ用は `p=executives`）から開きます。組織 ID は `pnpm seed:local` の出力に表示されます。管理画面は `http://localhost:3000/admin/login` から、シードのオーナー（`owner@example.com`）・管理者（`admin@example.com`）と `SEED_OWNER_PASSWORD` でログインします（ブラウザは `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` で Auth Emulator に接続します）。

| コマンド                    | 内容                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm test`                 | 単体テスト（Vitest、`tests/unit/`。Firebase 不要）                                      |
| `pnpm test:integration:emu` | 結合テスト（`tests/integration/`。Emulator の起動から停止まで行う）                     |
| `pnpm test:integration`     | 結合テストのみ（`pnpm emulators` を別に起動しておく）                                   |
| `pnpm test:e2e`             | E2E（`tests/e2e/`。Emulator の中で、`pnpm build` 済みのアプリに対して実行する）         |
| `pnpm typecheck`            | TypeScript の型検査                                                                     |
| `pnpm lint` / `pnpm format` | ESLint / Prettier の検査（`pnpm format:write` で整形）                                  |
| `pnpm build`                | Next.js のビルド                                                                        |
| `pnpm masters:generate`     | 付録A・付録B から `lib/masters/data/*.json` を再生成する                                |
| `pnpm masters:check`        | 生成物が付録と一致しているかを検査する（CI で実行）                                     |
| `pnpm texts:generate`       | 付録C から `lib/masters/data/texts/*.json`（表示文言マスタ）を再生成する                |
| `pnpm texts:check`          | 文言マスタの生成物が付録C と一致しているかを検査する（CI で実行）                       |
| `pnpm check-env`            | `.env.local` と環境変数の検証（値は表示しない）                                         |
| `pnpm emulators`            | Firebase Emulator（Auth 9099、Firestore 8080、UI 4000）を起動する                       |
| `pnpm seed:local`           | Emulator にローカル用のデータを投入する（Emulator 以外には接続を拒否する）              |
| `pnpm owner:create`         | 組織と初期オーナーを作成する（02 §9.6。実プロジェクトでは `firebase-ops` から実行する） |
| `pnpm admin:set-role`       | 管理者の役割変更・利用停止・停止解除・削除・クレームとの同期（02 §9.9）                 |
| `pnpm firebase:verify`      | 実プロジェクトに対する実装時確認（08 D08-33。`--confirm-project <ID>` が必要）          |
| `pnpm firestore:deploy`     | ルール・インデックスのデプロイ（通常は GitHub Actions の `firebase-deploy` を使う）     |

Firebase プロジェクトは `tekisei-kensa-697c4` の 1 つだけで運用します（10 K-13）。このプロジェクトに対する運用スクリプト（`owner:create`、`firebase:verify`）は、GitHub の Actions タブから `firebase-ops` ワークフローを手動実行して行います（10 K-12）。ルール・インデックスのデプロイは `firebase-deploy` ワークフローです。

主なディレクトリ:

- `lib/scoring/` — 採点エンジン（純関数。`scoreAnswers`、`compareWithPopulation`）。基本設計 03
- `lib/masters/` — 設問・配点・指標定義などのマスタ。`data/` は生成物（手で編集しない）
- `lib/presentation/` — 表示用の丸め・色・グラフ系列・受検ページの変換、結果詳細の文言の出し分け、管理画面の文言
- `lib/utils/` — ブラウザから API を呼ぶ口（`respondent-api.ts`、`admin-api.ts`）と Firebase Auth の操作（`admin-auth.ts`）
- `lib/firebase/` — Firebase Admin SDK（サーバ専用）とクライアント SDK（Auth のみ）の初期化
- `lib/db/` — Firestore のデータアクセス層（文書型・書き込み前スキーマ・マッパー・リポジトリ）。基本設計 02
- `lib/auth/` — セッション Cookie、カスタムクレーム、受検者・招待・PDF のトークン、管理者アカウント操作
- `lib/services/` — API 共通処理（`handle()`、エラー、監査ログ、レート制限）と Route Handler の業務処理。基本設計 04
- `app/` — Next.js（App Router）。受検者画面 `app/(respondent)/exam/**`、受検者 API `app/api/v1/respondent/**`、認証 `/auth/*`、管理画面 `app/(admin)/admin/**`、管理者 API `app/api/v1/admin/**`
- `components/respondent/` — 受検者画面の部品（基本設計 05 §3）
- `components/admin/`・`components/charts/`・`components/ui/` — 管理画面の部品、グラフ（ApexCharts のレーダーと自前 SVG のゲージ等）、汎用部品（基本設計 06）
- `public/images/` — 適性タイプ・資質・ソーシャルスタイル・立ち位置のイラスト（SVG。10 K-05 により実装者が作成。同名のファイルで差し替え可能）
- `firebase/` — Firebase の設定（`firebase.json`、ルール（全拒否）、インデックス）
- `tests/` — 単体（`unit/`）、Emulator 上の結合（`integration/`）、Playwright の E2E（`e2e/`）
- `scripts/` — マスタ生成と運用スクリプト（`create-owner`、`seed-local`、`set-admin-role`、`verify-firebase`）
