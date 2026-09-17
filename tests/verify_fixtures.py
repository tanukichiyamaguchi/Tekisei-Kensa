# -*- coding: utf-8 -*-
"""検証用データ（tests/fixtures/existing_results.json）の整合性確認スクリプト。

標準ライブラリのみで動作します。

    python3 tests/verify_fixtures.py

確認内容:
  1. 値の範囲と刻み（付録B の理論範囲。相性・資質・ソーシャルスタイルは現行ロジック整合行のみ）
  2. 資質第一候補・第二候補 = 資質 4 値の上位 2 つ（同点時は 感性開放型 > 環境受容型 > 自己実現型 > 探求論理型）
  3. ソーシャルスタイル名 = 4 値の最大のいずれか（同点時は Driving が最優先、Amiable が最劣後）
  4. 優劣性が全件 12（既存不具合の再現確認）
  5. sample のチャート用レコードが records の値と一致する（優劣性を除く）
  6. sample の比較計算値から 合致度・偏差値・評価 を再計算し、観測値と一致する

新システムの実装時は、このスクリプトの各チェックを自動テストに移植してください。
"""
import itertools
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, 'fixtures', 'existing_results.json')

TRAITS = ['協力性', '適応力', '優劣性', '謙虚さ', '反省力', '規則遵守力', 'こだわり', '感情の豊かさ', '敏感さ',
          '自己肯定感', '革新的思考', '行動力', '前向きさ', 'リーダーシップ', '発想力', 'コミュニケーション力']
AXES = ['適応する環境', '適応する業務', '思考の傾向', '意思決定', 'ストレス耐性']
APT = ['感性開放型', '環境受容型', '自己実現型', '探求論理型']          # 定義順 = 同点時の優先順
APT_LABEL = {'感性開放型': '感性解放型', '環境受容型': '環境受容型', '自己実現型': '自己実現型', '探求論理型': '探求論理型'}
SS = ['Driving', 'Expressive', 'Amiable', 'Analytical']

failures = []
notes = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


def is_step(v, step):
    return abs(v / step - round(v / step)) < 1e-9


def main():
    data = json.load(open(PATH, encoding='utf-8'))
    recs = data['records']
    cur = [r for r in recs if r['現行ロジック整合']]
    check(len(recs) == 73, f'件数が 73 ではない: {len(recs)}')
    check(len(cur) == 31, f'現行ロジック整合の件数が 31 ではない: {len(cur)}')
    notes.append(f'現行ロジック整合: {len(cur)} 件 / 旧ロジック: {len(recs) - len(cur)} 件')

    # 1. 範囲と刻み
    for r in recs:
        for t, v in r['性格特性16'].items():
            check(0 <= v <= 30 and is_step(v, 0.5), f"{r['id']} {t}={v} が 0〜30・0.5 刻みでない")
        for k, v in r['リスク7'].items():
            check(0 <= v <= 100 and is_step(v, 2.5), f"{r['id']} {k}={v} が 0〜100・2.5 刻みでない")
        check(0 <= r['信頼係数'] <= 100, f"{r['id']} 信頼係数={r['信頼係数']} が 0〜100 でない")
    for r in cur:
        for a, v in r['相性5'].items():
            check(-100 <= v <= 100 and is_step(v, 1), f"{r['id']} {a}={v} が整数でない")
        for a, v in r['資質4'].items():
            check(v >= 0 and is_step(v, 1.25), f"{r['id']} {a}={v} が 0 以上・1.25 刻みでない")
        for k, v in r['ソーシャルスタイル4'].items():
            check(0 <= v <= 30 and is_step(v, 0.25), f"{r['id']} {k}={v} が 0〜30・0.25 刻みでない")
    neg = [(r['id'], a, v) for r in cur for a, v in r['相性5'].items() if v < 0]
    notes.append(f'現行ロジック整合行で相性が負値: {neg}')

    # 2. 資質第一候補・第二候補（同点時は定義順）
    apt_mismatch = []
    for r in recs:
        order = sorted(APT, key=lambda a: (-r['資質4'][a], APT.index(a)))
        first, second = APT_LABEL[order[0]], APT_LABEL[order[1]]
        if r['資質第一候補'] != first or r['資質第二候補'] != second:
            apt_mismatch.append((r['id'], r['資質第一候補'], r['資質第二候補'], first, second))
    check(not apt_mismatch, f'資質候補の不一致: {apt_mismatch}')
    apt_ties = sum(1 for r in recs if len({v for v in r['資質4'].values()}) < 4
                   and sorted(r['資質4'].values(), reverse=True)[0:2] != sorted(set(r['資質4'].values()), reverse=True)[0:2])
    notes.append(f'資質 4 値の上位 2 位までに同点を含む行: {apt_ties} 件（すべて定義順の優先で一致）')

    # 3. ソーシャルスタイル（同点時の優先順位）
    ss_mismatch, ties = [], []
    for r in recs:
        mx = max(r['ソーシャルスタイル4'].values())
        winners = [k for k in SS if r['ソーシャルスタイル4'][k] == mx]
        if r['ソーシャルスタイル'] not in winners:
            ss_mismatch.append((r['id'], r['ソーシャルスタイル'], winners))
        elif len(winners) > 1:
            ties.append((r['ソーシャルスタイル'], winners))
    check(not ss_mismatch, f'ソーシャルスタイル名が最大値の分類でない: {ss_mismatch}')
    orders = [o for o in itertools.permutations(SS)
              if all(min(w, key=o.index) == name for name, w in ties)]
    notes.append(f'ソーシャルスタイル同点行: {len(ties)} 件。観測と矛盾しない優先順位: {orders}')
    check(all(o[0] == 'Driving' and o[-1] == 'Amiable' for o in orders) and orders,
          f'優先順位の推定が想定（Driving 最優先・Amiable 最劣後）と異なる: {orders}')

    # 4. 優劣性 = 12（既存不具合）
    check(all(r['性格特性16']['優劣性'] == 12 for r in recs), '優劣性が 12 でない行がある')

    # 5. sample のチャート用レコード
    s = data['sample']
    rec = next(r for r in recs if r['id'] == s['受検者'])
    for t in TRAITS:
        if t == '優劣性':
            notes.append(f"sample 優劣性: 回答データ={rec['性格特性16'][t]}（不具合で固定）, "
                         f"レーダー用レコード={s['レーダーチャート個別特性'][t]}（正しい計算値）")
            continue
        check(s['レーダーチャート個別特性'][t] == rec['性格特性16'][t],
              f"sample レーダー {t}: {s['レーダーチャート個別特性'][t]} != {rec['性格特性16'][t]}")
    for a in APT:  # チャート用レコードの軸名は表示表記（感性解放型）
        check(s['資質バランス'][APT_LABEL[a]]['値'] == rec['資質4'][a], f'sample 資質バランス {a} 不一致')
    for k in SS:
        check(s['ソーシャルスタイル'][k]['値'] == rec['ソーシャルスタイル4'][k], f'sample ソーシャルスタイル {k} 不一致')

    # 6. 比較計算値の再計算（付録B §9）
    c = s['比較計算値（組織全体）']
    diffs = c['16尺度の差分（絶対値）']
    avg = c['相性5軸の組織平均']
    match = max(100 - 0.5 * sum(diffs[t] for t in TRAITS), 0)
    check(abs(match - c['合致度']) < 1e-9, f"合致度 再計算 {match} != 観測 {c['合致度']}")

    # 既存どおり 思考の傾向 の受検者側に 適応力 を使う（不具合の再現）
    subj = {a: rec['相性5'][a] for a in AXES}
    subj_bug = dict(subj)
    subj_bug['思考の傾向'] = rec['性格特性16']['適応力']
    dev = {a: (subj_bug[a] - avg[a]) / 2 + 50 for a in AXES}
    for a in AXES:
        check(abs(dev[a] - c['相性5軸の偏差値（各軸）'][a]) < 1e-9,
              f"{a}(偏差値) 再計算 {dev[a]} != 観測 {c['相性5軸の偏差値（各軸）'][a]}")
    hensachi = sum(dev.values()) / 5
    check(abs(hensachi - c['偏差値']) < 1e-9, f"偏差値 再計算 {hensachi} != 観測 {c['偏差値']}")
    grade = 'E'
    if match >= 60 and hensachi >= 30:
        grade = 'D'
    if match >= 60 and hensachi >= 40:
        grade = 'C'
    if match >= 70 and hensachi >= 50:
        grade = 'B'
    if match >= 80 and hensachi >= 60:
        grade = 'A'
    check(grade == c['評価'], f"評価 再計算 {grade} != 観測 {c['評価']}")

    # 修正版（思考の傾向 に受検者の 思考の傾向 を使う）の値を参考表示
    dev_fixed = {a: (subj[a] - avg[a]) / 2 + 50 for a in AXES}
    notes.append(f"参考: 思考の傾向 の不具合を修正した場合の偏差値 = {sum(dev_fixed.values()) / 5:.3f}"
                 f"（既存の観測値 {c['偏差値']}）")

    # 比較母集団の分母の示唆
    def denom_ok(values, n):
        return all(is_step(v * n, 0.5) for v in values)
    notes.append(f"差分 16 値 ×55 が 0.5 の倍数: {denom_ok(diffs.values(), 55)} / "
                 f"組織平均 16 値 ×75 が 0.5 の倍数: {denom_ok(c['レーダーチャートに描画された組織平均16'].values(), 75)}")
    for label, rows in [('全 73 件', recs), ('除外を除く', [r for r in recs if not r['除外']])]:
        m = sum(r['性格特性16']['前向きさ'] for r in rows) / len(rows)
        notes.append(f"前向きさ の平均（{label} {len(rows)} 件）= {m:.4f}"
                     f" / 観測から逆算した平均 = {rec['性格特性16']['前向きさ'] - diffs['前向きさ']:.4f}（一致しない）")

    for n in notes:
        print('NOTE:', n)
    if failures:
        print(f'\nFAILED ({len(failures)}):')
        for f in failures:
            print(' -', f)
        sys.exit(1)
    print('\nOK: 全チェック合格')


if __name__ == '__main__':
    main()
