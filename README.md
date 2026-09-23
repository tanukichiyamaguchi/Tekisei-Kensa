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

実装計画は [08 実装計画とテスト計画](docs/基本設計/08_実装計画とテスト計画.md) のマイルストーン（M0〜M6）に沿って進めます。現在は M1（採点エンジンと単体テスト）まで実装済みです。Next.js の画面、Firebase（Firestore・Auth）と Emulator 上の結合テストは M2 以降で追加します。

必要なもの: Node.js 22 系（`.nvmrc`）、pnpm（`package.json` の `packageManager` の版。Corepack で有効化）。

```bash
pnpm install --frozen-lockfile
pnpm ci                 # lint・format・typecheck・マスタ再生成検査・単体テスト（CI と同じ）
```

| コマンド                    | 内容                                                     |
| --------------------------- | -------------------------------------------------------- |
| `pnpm test`                 | 単体テスト（Vitest、`tests/unit/`）                      |
| `pnpm typecheck`            | TypeScript の型検査                                      |
| `pnpm lint` / `pnpm format` | ESLint / Prettier の検査（`pnpm format:write` で整形）   |
| `pnpm masters:generate`     | 付録A・付録B から `lib/masters/data/*.json` を再生成する |
| `pnpm masters:check`        | 生成物が付録と一致しているかを検査する（CI で実行）      |

主なディレクトリ:

- `lib/scoring/` — 採点エンジン（純関数。`scoreAnswers`、`compareWithPopulation`）。基本設計 03
- `lib/masters/` — 設問・配点・指標定義などのマスタ。`data/` は生成物（手で編集しない）
- `lib/presentation/` — 表示用の丸め・色・グラフ系列・受検ページの変換
- `scripts/generate-masters.ts` — マスタ生成スクリプト
