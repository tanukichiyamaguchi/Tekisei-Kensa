# Tekisei-Kensa（適性検査システム）

既存の適性検査システム（first-inspection.jp 相当）と同等の分析ロジック・視覚化を備えたシステムを構築するためのリポジトリです。

## ドキュメント

- [要件定義書](docs/要件定義書.md)
- [付録A 設問一覧](docs/付録A_設問一覧.md)
- [付録B 採点ロジック仕様](docs/付録B_採点ロジック仕様.md)
- [付録C 表示文言マスタ](docs/付録C_表示文言マスタ.md)
- [付録D AI 解説仕様](docs/付録D_AI解説仕様.md)
- [付録E グラフ仕様](docs/付録E_グラフ仕様.md)

## 検証用データ

- [tests/fixtures/README.md](tests/fixtures/README.md) — 既存システムの回答データ 73 件を匿名化した検証用データの説明
- `tests/fixtures/existing_results.json` — データ本体
- `tests/verify_fixtures.py` — 整合性確認スクリプト（`python3 tests/verify_fixtures.py`）
