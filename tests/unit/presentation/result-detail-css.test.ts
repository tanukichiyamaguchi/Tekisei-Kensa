// M7-result-38・39（11-4 §2.2・§2.3.1・§2.5・§2.10・§2.7.5・§2.13・§2.14・§5.1、総論 8.3 の配色の取り決め（14〜25））。
// components/admin/result/result-detail.css（別表D）を読み、#rs2 の変数を解いて、K-49 の表の 1〜15（文字 4.5:1）・K-50 の表の 1〜5
// （部品 3:1。枠は外の地と中の地の両方、部品の縁に常に接する影は影の色とも比べる）と、届いていて変えない組を WCAG 2 の式で計算する
// （axe が見ないマウス・押下・訪れたあとの色と、axe が調べない部品の 3:1 をここで確かめる）。不透明度 70% のマウス・押下は白に重ね、
// 各成分を四捨五入（0.5 は切り上げ）して 8 ビットにしてから計算する。根の要素 #rs2 のグラデーションの上の文字はいちばん暗い上端
// #EAF3F6 で計算する。焦点の枠の形（スクロールする領域の内側の余白、目次の白い影、目次のリンクと並び替えのボタンの内側の枠）と、
// リンクの状態ごとの色の指定（.admin-root a より強い）も確かめる。結果詳細の文字は白い枠 #rd の上にあり、今のページの地 #F3F5F8 の上に
// 置く文字は無い（選び直しは要らない）。育て方・接し方（PR-7.8b）の文字と、育て方の小さいレーダーの線と点（K-50 で確かめる。接し方の
// 小さいレーダーは値を表の点数で読めるので対象外）、狭い幅と印刷の形の規則、旧のセクションと前回のグラフの CSS の片付けも確かめる
import { describe, expect, it } from "vitest";

import {
  compareSpecificity,
  contrastRatio,
  decl,
  findDecl,
  hexOf,
  over,
  parseColor,
  parseCssRules,
  readCss,
  resolveVars,
  round2,
  specificity,
  variablesOf,
  type Rgb,
} from "./css-rules";
import { MINI_RADAR_COLORS } from "@/components/charts/MiniRadarSvg";
import { TRAIT_RADAR_COLORS } from "@/components/charts/TraitRadarSvg";
import {
  RELIABILITY_TONE_COLORS,
  RISK_LEVEL_STYLES,
  type ReliabilityTone,
  type RiskLevel,
} from "@/lib/presentation/colors";

const rules = parseCssRules(readCss("components/admin/result/result-detail.css"));
const vars = variablesOf(rules, "#rs2");

/** 宣言の値（var() を #rs2 の変数で解く） */
const value = (selector: string, property: string, at: string | null = null) =>
  resolveVars(decl(rules, selector, property, at), vars);
const solid = (text: string): Rgb => {
  const c = parseColor(resolveVars(text, vars));
  expect(c.alpha, text).toBe(1);
  return c.rgb;
};
const color = (selector: string, property: string) => solid(value(selector, property));
/** box-shadow・border の値の中の最初の #hex */
const hexIn = (text: string): Rgb => {
  const m = /#[0-9a-f]{6}/i.exec(text);
  if (!m) throw new Error(`色が無い: ${text}`);
  return solid(m[0]);
};

const WHITE: Rgb = [255, 255, 255];
/** #rs2 の地のいちばん暗い上端（§2.2） */
const ROOT_TOP = solid("#EAF3F6");
/** 共通の焦点の枠（11-8 §2.2.6）と、参照元の rs-v2・rs-nav の焦点の枠 */
const COMMON_RING = "2px solid #3f8da5";
const DARK_RING = "2px solid #1f2933";
const RING_COLOR = solid("#3F8DA5");
const DARK = solid("#1F2933");
const ADMIN_LINK = specificity(".admin-root a");

function expectRatios(
  pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]>,
  minimum: number,
): void {
  for (const [label, front, back, expected] of pairs) {
    const r = contrastRatio(front, back);
    expect(round2(r), label).toBe(expected);
    expect(r, label).toBeGreaterThanOrEqual(minimum);
  }
}

/** 規則が書かれた順の位置（後に書いたものが勝つ） */
const indexOfRule = (selector: string, at: string | null = null): number =>
  rules.findIndex((r) => r.at === at && r.selectors.includes(selector));

describe("M7-result-38 K-49 で変えた色の変数と規則の値（§2.2 の K-49 の表の 1〜14）", () => {
  it("変数 --mute2-tx #6A7888・--p-plt #2C758A・--good-tx #147C5B と、参照元の色のまま残す --mute2 #8592A0・--p #2E7A90・--good #15805E・--org（K-50）#8896A5", () => {
    const expected: Readonly<Record<string, string>> = {
      "--mute2-tx": "#6A7888",
      "--p-plt": "#2C758A",
      "--good-tx": "#147C5B",
      "--mute2": "#8592A0",
      "--p": "#2E7A90",
      "--good": "#15805E",
      "--org": "#8896A5",
      "--p2": "#3F8DA5",
      "--plt": "#E6F2F5",
      "--line2": "#EEF2F6",
      "--goodlt": "#E5F4EE",
      "--warn": "#B45309",
      "--warnlt": "#FDF1E3",
      "--mute": "#5F6B78",
      "--ink": "#14202B",
      "--ink2": "#334150",
    };
    for (const [name, hex] of Object.entries(expected)) {
      expect(vars.get(name)?.toUpperCase(), name).toBe(hex);
    }
  });

  it("表の規則の値: 「回答一覧に戻る」のマウス・押下 #2D799A、ボタンの地 #397F94 とマウス・押下の地 #1D414C・不透明度 0.7、「目次」#6C7784、「たたむ」#2D768E（マウスの規則は地だけ）、「—」#62707E、ほかの特性を見る #2D788E、注意したいリスクの数字 #157E3C・#9C5F07、札の地 #12883E・#EB1515", () => {
    expect(value("#rd .rd-back:hover", "color").toUpperCase()).toBe("#2D799A");
    expect(value("#rd .rd-back:active", "color").toUpperCase()).toBe("#2D799A");
    expect(value("#rd-head .rd-btn", "background").toUpperCase()).toBe("#397F94");
    expect(value("#rd-head .rd-btn:hover", "background").toUpperCase()).toBe("#1D414C");
    expect(value("#rd-head .rd-btn:active", "background").toUpperCase()).toBe("#1D414C");
    expect(value("#rd-head .rd-btn:hover", "opacity")).toBe("0.7");
    expect(value("#rsn .l", "color").toUpperCase()).toBe("#6C7784");
    expect(value("#rs2 .rs-fold", "color").toUpperCase()).toBe("#2D768E");
    expect(findDecl(rules, "#rs2 .rs-fold:hover", "color")).toBeUndefined();
    expect(value("#rs2 .rs-fold:hover", "background").toUpperCase()).toBe("#E6F3F8");
    expect(value("#rs2 .grade.no", "color").toUpperCase()).toBe("#62707E");
    expect(value("#rs-sw .more", "color").toUpperCase()).toBe("#2D788E");
    expect(value("#rs-sw .rk3 b.d1", "color").toUpperCase()).toBe("#157E3C");
    expect(value("#rs-sw .rk3 b.d2", "color").toUpperCase()).toBe("#9C5F07");
    expect(value("#rs2 .flag.ep", "background").toUpperCase()).toBe("#12883E");
    expect(value("#rs2 .rs.lv1 .lv", "background").toUpperCase()).toBe("#12883E");
    expect(value("#rs2 .rs.lv4 .lv", "background").toUpperCase()).toBe("#EB1515");
    // 文字の用途に新しい変数を当てる（空の表示・比較なしの「—」・目盛の数字、項目の説明の「本人 {値}点」・囲みのラベル、札「良い面」・差の札（正））
    expect(decl(rules, "#rs2 .empty", "color")).toBe("var(--mute2-tx)");
    expect(decl(rules, "#rs2 .kpi .v.no", "color")).toBe("var(--mute2-tx)");
    expect(decl(rules, "#rs2 .ax div:nth-child(2)", "color")).toBe("var(--mute2-tx)");
    expect(decl(rules, "#rs2 .rs-sk .sk-s", "color")).toBe("var(--p-plt)");
    expect(decl(rules, "#rs2 .call .lbl", "color")).toBe("var(--p-plt)");
    expect(decl(rules, "#rs2 .ep", "color")).toBe("var(--good-tx)");
    expect(decl(rules, "#rs2 .df.up", "color")).toBe("var(--good-tx)");
    // #rs-sw .more は #rs2 .more より後に書く（同じ強さでなく ID 2 つで勝つが、書いた順も後）
    expect(indexOfRule("#rs-sw .more")).toBeGreaterThan(indexOfRule("#rs2 .more"));
  });

  it("参照元の色のまま使う用途: 箇条書きの丸 --mute2、見出しの線と選んだ項目のボタンの地 --p、線・棒・点の #16A34A・#EF4444、押せないときの「類似分析」「ダウンロード」の地 #3F8DA5 と不透明度 0.6（マウスの規則より後）", () => {
    expect(decl(rules, "#rs2 ul.dl li::before", "background")).toBe("var(--mute2)");
    expect(decl(rules, "#rs2 .sec-h h2", "border-left")).toBe("5px solid var(--p)");
    expect(decl(rules, "#rs2 .rs-sk button.on", "background")).toBe("var(--p)");
    expect(decl(rules, "#rs2 .more", "color")).toBe("var(--p)");
    for (const selector of [
      "#rs2 .rs.lv1 .bar i",
      "#rs-sw .rk3 .dot.d1",
      "#rs2 .tr.hi .bar i",
      "#rs2 .lgo",
      "#rs2 .tlg .k2",
    ]) {
      expect(value(selector, "background").toUpperCase(), selector).toBe("#16A34A");
    }
    expect(value("#rs2 .rs.lv1", "border-left-color").toUpperCase()).toBe("#16A34A");
    expect(value("#rs2 .tr.hi", "box-shadow")).toBe("inset 5px 0 0 #16a34a");
    for (const selector of ["#rs2 .rs.lv4 .bar i", "#rs-sw .rk3 .dot.d4"]) {
      expect(value(selector, "background").toUpperCase(), selector).toBe("#EF4444");
    }
    expect(value("#rs2 .rs.lv4", "border-left-color").toUpperCase()).toBe("#EF4444");
    const disabled = '#rd-head .rd-btn[aria-disabled="true"]';
    expect(value(disabled, "background").toUpperCase()).toBe("#3F8DA5");
    expect(value(disabled, "opacity")).toBe("0.6");
    expect(indexOfRule(disabled)).toBeGreaterThan(indexOfRule("#rd-head .rd-btn:hover"));
  });

  it("K-49 の表の 1〜14 の組が 4.5:1 以上で、§2.2 の表の比（不透明度 70% のマウス・押下は白に重ねた色）", () => {
    const pressOpacity = Number(value("#rd-head .rd-btn:hover", "opacity"));
    const pressed = over(
      parseColor(value("#rd-head .rd-btn:hover", "background")),
      WHITE,
      pressOpacity,
    );
    expect(hexOf(pressed)).toBe("#617A82");
    const card1 = color("#rs-sw .card:nth-child(1)", "background");
    const card2 = color("#rs-sw .card:nth-child(2)", "background");
    const card3 = color("#rs-sw .card:nth-child(3)", "background");
    expect(hexOf(card1)).toBe("#EDF8F1");
    expect(hexOf(card2)).toBe("#FFF3E6");
    expect(hexOf(card3)).toBe("#FDEEEE");
    expectRatios(
      [
        [
          "1 「回答一覧に戻る」のマウス・押下の文字／地",
          color("#rd .rd-back:hover", "color"),
          color("#rd .rd-back:hover", "background"),
          4.51,
        ],
        [
          "2 白い文字／「ダウンロード」の地",
          color("#rd-head .rd-btn", "color"),
          color("#rd-head .rd-btn", "background"),
          4.53,
        ],
        ["3 白い文字／マウス・押下の地（不透明度 0.7）", WHITE, pressed, 4.55],
        ["4 「目次」／目次の白", color("#rsn .l", "color"), color("#rsn", "background"), 4.56],
        [
          "5 「たたむ」／白",
          color("#rs2 .rs-fold", "color"),
          color("#rs2 .rs-fold", "background"),
          5.13,
        ],
        [
          "5 「たたむ」／マウスのときの地",
          color("#rs2 .rs-fold", "color"),
          color("#rs2 .rs-fold:hover", "background"),
          4.53,
        ],
        ["6 空の表示（--mute2-tx）／カードの白", color("#rs2 .empty", "color"), WHITE, 4.51],
        ["6 比較なしの「—」／カードの白", color("#rs2 .kpi .v.no", "color"), WHITE, 4.51],
        ["6 目盛の数字／カードの白", color("#rs2 .ax div:nth-child(2)", "color"), WHITE, 4.51],
        [
          "7 評価の箱の「—」／箱の地",
          color("#rs2 .grade.no", "color"),
          color("#rs2 .grade.no", "background"),
          4.51,
        ],
        ["8 ほかの特性を見る／カード 1 の地", color("#rs-sw .more", "color"), card1, 4.61],
        ["8 ほかの特性を見る／カード 2 の地", color("#rs-sw .more", "color"), card2, 4.59],
        [
          "9 札「良い面」／札の地",
          color("#rs2 .ep", "color"),
          color("#rs2 .ep", "background"),
          4.55,
        ],
        [
          "9 差の札（正）／札の地",
          color("#rs2 .df.up", "color"),
          color("#rs2 .df.up", "background"),
          4.55,
        ],
        [
          "10 注意したいリスクの数字（低い）／カード 3",
          color("#rs-sw .rk3 b.d1", "color"),
          card3,
          4.57,
        ],
        [
          "11 注意したいリスクの数字（やや低い）／カード 3",
          color("#rs-sw .rk3 b.d2", "color"),
          card3,
          4.6,
        ],
        [
          "12 「本人 {値}点」／項目の説明の枠の地",
          color("#rs2 .rs-sk .sk-s", "color"),
          color("#rs2 .rs-sk .sk-p", "background"),
          4.57,
        ],
        [
          "12 囲みのラベル／囲みの地",
          color("#rs2 .call .lbl", "color"),
          color("#rs2 .call", "background"),
          4.57,
        ],
        [
          "13 白い文字／札「最も高い」の地",
          color("#rs2 .flag.ep", "color"),
          color("#rs2 .flag.ep", "background"),
          4.55,
        ],
        [
          "13 白い文字／リスクの札「低い」の地",
          color("#rs2 .rs.lv1 .lv", "color"),
          color("#rs2 .rs.lv1 .lv", "background"),
          4.55,
        ],
        [
          "14 白い文字／リスクの札「高い」の地",
          color("#rs2 .rs.lv4 .lv", "color"),
          color("#rs2 .rs.lv4 .lv", "background"),
          4.52,
        ],
      ],
      4.5,
    );
    // 参照元の色は届かない（§2.2 の表の参照元の比）
    const reference: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
      ["1", solid("#2E7C9E"), solid("#F2F7F9"), 4.33],
      ["2", WHITE, solid("#3F8DA5"), 3.77],
      ["3", WHITE, over(parseColor("#3F8DA5"), WHITE, 0.7), 2.41],
      ["4", solid("#7A8592"), WHITE, 3.75],
      ["5", solid("#2F7C96"), solid("#E6F3F8"), 4.17],
      ["6", solid("#8592A0"), WHITE, 3.17],
      ["7", solid("#8592A0"), solid("#EEF2F6"), 2.82],
      ["8", solid("#2E7A90"), card2, 4.47],
      ["9", solid("#15805E"), solid("#E5F4EE"), 4.32],
      ["10", solid("#15803D"), card3, 4.45],
      ["11", solid("#A16207"), card3, 4.37],
      ["12", solid("#2E7A90"), solid("#E6F2F5"), 4.27],
      ["13", WHITE, solid("#16A34A"), 3.3],
      ["14", WHITE, solid("#EF4444"), 3.76],
    ];
    for (const [label, front, back, expected] of reference) {
      const r = contrastRatio(front, back);
      expect(round2(r), label).toBe(expected);
      expect(r, label).toBeLessThan(4.5);
    }
  });

  it("届いていて変えない文字（5:1 未満のものを含む）: セクションの説明と根の地の上端、#5F6B78 と #EEF2F6・#EBEFF4・#E6F2F5、「ひらく」、選んだ項目のボタン、信頼係数 80 以上、札「注意」・差の札（負）、札「最も低い」、今見ているセクション、リスクの行の数字（行の地とマウスの地）、受験情報の 1 行", () => {
    const mute = solid("var(--mute)");
    const rowHover = color("#rs2 .rs:hover", "background");
    expectRatios(
      [
        ["セクションの説明／根の地の上端", color("#rs2 .sec-h p", "color"), ROOT_TOP, 4.83],
        ["タグの名前・差の札（1.5 未満）／#EEF2F6", mute, solid("var(--line2)"), 4.83],
        [
          "並び替えのボタン／並びの地",
          color("#rs2 .seg button", "color"),
          color("#rs2 .seg", "background"),
          4.71,
        ],
        [
          "項目の説明の 2 行目／枠の地",
          color("#rs2 .rs-sk .sk-h", "color"),
          color("#rs2 .rs-sk .sk-p", "background"),
          4.76,
        ],
        [
          "「ひらく」の白い文字／#2F7C96",
          color("#rs2 .sec.fold .rs-fold", "color"),
          color("#rs2 .sec.fold .rs-fold", "background"),
          4.73,
        ],
        [
          "選んだ項目のボタンの白い文字／--p",
          color("#rs2 .rs-sk button.on", "color"),
          color("#rs2 .rs-sk button.on", "background"),
          4.88,
        ],
        ["信頼係数 80 以上 #15805E／白", color("#rs2 .kpi.t-good .v", "color"), WHITE, 4.91],
        ["札「注意」／#FDF1E3", color("#rs2 .en", "color"), color("#rs2 .en", "background"), 4.51],
        [
          "差の札（負）／#FDF1E3",
          color("#rs2 .df.dn", "color"),
          color("#rs2 .df.dn", "background"),
          4.51,
        ],
        [
          "札「最も低い」の白い文字／#DC2626",
          color("#rs2 .flag.en", "color"),
          color("#rs2 .flag.en", "background"),
          4.83,
        ],
        [
          "今見ているセクション／#E8F3F6",
          color("#rsn a.on", "color"),
          color("#rsn a.on", "background"),
          4.99,
        ],
        [
          "注意したいリスクの数字（注意）／カード 3",
          color("#rs-sw .rk3 b.d3", "color"),
          solid("#FDEEEE"),
          4.6,
        ],
        [
          "注意したいリスクの数字（高い）／カード 3",
          color("#rs-sw .rk3 b.d4", "color"),
          solid("#FDEEEE"),
          5.74,
        ],
        [
          "リスクの行の数字（低い）／行の地",
          color("#rs2 .rs.lv1 .v", "color"),
          color("#rs2 .rs.lv1", "background"),
          4.53,
        ],
        [
          "リスクの行の数字（やや低い）／行の地",
          color("#rs2 .rs.lv2 .v", "color"),
          color("#rs2 .rs.lv2", "background"),
          4.65,
        ],
        [
          "リスクの行の数字（注意）／行の地",
          color("#rs2 .rs.lv3 .v", "color"),
          color("#rs2 .rs.lv3", "background"),
          4.63,
        ],
        // マウスの地の上は 4.66〜6.13:1（いちばん低いのはやや低い、いちばん高いのは高い）
        ["リスクの行の数字（低い）／マウスの地", color("#rs2 .rs.lv1 .v", "color"), rowHover, 4.75],
        [
          "リスクの行の数字（やや低い）／マウスの地",
          color("#rs2 .rs.lv2 .v", "color"),
          rowHover,
          4.66,
        ],
        ["リスクの行の数字（注意）／マウスの地", color("#rs2 .rs.lv3 .v", "color"), rowHover, 4.91],
        ["リスクの行の数字（高い）／マウスの地", color("#rs2 .rs.lv4 .v", "color"), rowHover, 6.13],
        ["受験情報の 1 行の値／白", color("#rsm b", "color"), WHITE, 14.76],
        ["受験情報の 1 行の名前と注記／白", color("#rsm", "color"), WHITE, 5.44],
        ["受験情報の 1 行の 80 未満の値／白", color("#rsm b.mid", "color"), WHITE, 5.02],
        ["受験情報の 1 行の 40 未満の値／白", color("#rsm b.low", "color"), WHITE, 6.57],
        [
          "プルダウンの文字（未選択を含む）／白",
          color("#rd-head .rd-scope", "color"),
          WHITE,
          14.76,
        ],
      ],
      4.5,
    );
  });

  it("RISK_LEVEL_STYLES（札の地・概要の数字・線・棒・行の地・名前の太さ）と RELIABILITY_TONE_COLORS が CSS の .rs.lv*・#rs-sw .rk3・.kpi.t-*・#rsm b.mid/.low と一致", () => {
    for (const level of [1, 2, 3, 4] as const satisfies readonly RiskLevel[]) {
      const s = RISK_LEVEL_STYLES[level];
      const row = `#rs2 .rs.lv${level}`;
      expect(value(row, "background").toUpperCase(), `${level} 行の地`).toBe(s.rowBackground);
      expect(value(row, "border-left-color").toUpperCase(), `${level} 左の線`).toBe(s.line);
      expect(value(`${row} .lv`, "background").toUpperCase(), `${level} 札の地`).toBe(
        s.badgeBackground,
      );
      expect(value(`${row} .lv`, "color").toUpperCase(), `${level} 札の文字`).toBe(s.badgeText);
      expect(value(`${row} .bar i`, "background").toUpperCase(), `${level} 棒`).toBe(s.bar);
      expect(value(`${row} .v`, "color").toUpperCase(), `${level} 数字`).toBe(s.value);
      expect(value(`#rs-sw .rk3 b.d${level}`, "color").toUpperCase(), `${level} 概要の数字`).toBe(
        s.overviewValue,
      );
      expect(value(`#rs-sw .rk3 .dot.d${level}`, "background").toUpperCase(), `${level} 点`).toBe(
        s.bar,
      );
      const weight =
        findDecl(rules, `${row} .n`, "font-weight") ?? decl(rules, "#rs2 .rs .n", "font-weight");
      expect(Number(weight), `${level} 名前の太さ`).toBe(s.nameWeight);
    }
    for (const tone of ["low", "mid", "good"] as const satisfies readonly ReliabilityTone[]) {
      const hex = RELIABILITY_TONE_COLORS[tone];
      expect(value(`#rs2 .kpi.t-${tone} .v`, "color").toUpperCase(), tone).toBe(hex);
      expect(value(`#rs2 .kpi.t-${tone} .meter i`, "background").toUpperCase(), tone).toBe(hex);
    }
    expect(value("#rsm b.mid", "color").toUpperCase()).toBe(RELIABILITY_TONE_COLORS.mid);
    expect(value("#rsm b.low", "color").toUpperCase()).toBe(RELIABILITY_TONE_COLORS.low);
    // 合致度と評価は色分けしない（K-39 Q-03）: メーターの塗りは --p2、評価の箱の地は --ink だけ
    expect(decl(rules, "#rs2 .meter i", "background")).toBe("var(--p2)");
    expect(decl(rules, "#rs2 .grade", "background")).toBe("var(--ink)");
    expect(rules.some((r) => r.selectors.some((s) => /grade\.[a-e]\b/i.test(s)))).toBe(false);
  });

  it("リンクの色: 「回答一覧に戻る」と目次のリンクの指定は #rd・#rsn から始まり .admin-root a より強い。:visited で別の色を付けず、目次のリンクに押している間だけの指定は無い。各状態の色が地と 4.5:1 以上", () => {
    for (const selector of [
      "#rd .rd-back",
      "#rd .rd-back:hover",
      "#rd .rd-back:active",
      "#rsn a",
      "#rsn a:hover",
      "#rsn a.on",
    ]) {
      expect(selector.startsWith("#rd ") || selector.startsWith("#rsn "), selector).toBe(true);
      expect(compareSpecificity(specificity(selector), ADMIN_LINK), selector).toBeGreaterThan(0);
      expect(findDecl(rules, selector, "color"), selector).toBeDefined();
    }
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        expect(selector.includes(":visited"), selector).toBe(false);
        expect(selector.startsWith("#rsn a:active"), selector).toBe(false);
      }
    }
    expect(decl(rules, "#rd .rd-back", "text-decoration")).toBe("none");
    expect(decl(rules, "#rsn a", "text-decoration")).toBe("none");
    expectRatios(
      [
        [
          "「回答一覧に戻る」ふだんと訪れたあと #4B5A66／白",
          color("#rd .rd-back", "color"),
          color("#rd .rd-back", "background"),
          7.11,
        ],
        [
          "「回答一覧に戻る」マウスと押している間 #2D799A／#F2F7F9",
          color("#rd .rd-back:active", "color"),
          color("#rd .rd-back:active", "background"),
          4.51,
        ],
        [
          "目次のリンク ふだんと訪れたあと #5F6B78／白",
          color("#rsn a", "color"),
          color("#rsn", "background"),
          5.44,
        ],
        [
          "目次のリンク マウス #1F2933／#F2F5F8",
          color("#rsn a:hover", "color"),
          color("#rsn a:hover", "background"),
          13.48,
        ],
        [
          "今見ているセクション #2E6F84／#E8F3F6",
          color("#rsn a.on", "color"),
          color("#rsn a.on", "background"),
          4.99,
        ],
      ],
      4.5,
    );
    expect(value("#rd .rd-back", "color").toUpperCase()).toBe("#4B5A66");
    expect(value("#rsn a", "color").toUpperCase()).toBe("#5F6B78");
    expect(value("#rsn a.on", "color").toUpperCase()).toBe("#2E6F84");
    // 今見ているセクションの地は、マウスの規則より後に書く（マウスを載せても #E8F3F6 のまま）
    expect(indexOfRule("#rsn a.on")).toBeGreaterThan(indexOfRule("#rsn a:hover"));
  });

  it("レーダーの文字: 軸の名前 #475569 とカードの白、マウスを載せたときだけ出る吹き出しの白い文字と地 #14263A", () => {
    expectRatios(
      [
        [
          "軸の名前／カードの白",
          solid(TRAIT_RADAR_COLORS.label),
          color("#rs2 .card", "background"),
          7.58,
        ],
        [
          "吹き出しの白い文字／地",
          color(".rd-tip", "color"),
          color(".rd-tip", "background"),
          15.35,
        ],
      ],
      4.5,
    );
  });
});

describe("M7-result-39 K-50 の表の 1〜5 と、届いていて変えない部品（部品 3:1。外の地と中の地の両方）", () => {
  it("1・2 比較組織のプルダウンの枠 #8596A8 と焦点の枠・影 #369AE9（外も中も白）", () => {
    const border = hexIn(value("#rd-head .rd-scope", "border"));
    expect(hexOf(border)).toBe("#8596A8");
    expect(color("#rd-head .rd-scope", "background")).toEqual(WHITE);
    expect(value("#rd-head .rd-scope:focus", "border-color").toUpperCase()).toBe("#369AE9");
    expect(value("#rd-head .rd-scope:focus", "box-shadow")).toBe("0 0 6px #369ae9");
    expect(value("#rd-head .rd-scope:focus", "outline")).toBe("none");
    expectRatios(
      [
        ["1 プルダウンの枠／白", border, WHITE, 3.03],
        ["2 焦点の枠と影／白", color("#rd-head .rd-scope:focus", "border-color"), WHITE, 3.02],
      ],
      3,
    );
  });

  it("3 選んでいる並び替えのボタンの外側の 1px の枠 #627B98（影の前）は、並びの地・白い地・枠の下にかかる影 #CFD7E0 のどれとも 3:1 以上", () => {
    const shadow = value("#rs2 .seg button.on", "box-shadow");
    expect(shadow).toBe("0 0 0 1px #627b98, 0 1px 2px #cfd7e0");
    const ring = hexIn(shadow);
    expectRatios(
      [
        ["枠／並びの地", ring, color("#rs2 .seg", "background"), 3.78],
        ["枠／影", ring, solid("#CFD7E0"), 3.01],
        ["枠／白い地", ring, color("#rs2 .seg button.on", "background"), 4.37],
      ],
      3,
    );
    // 参照元の形（白い地と影だけ）は並びの地と 1.15:1
    expect(round2(contrastRatio(WHITE, color("#rs2 .seg", "background")))).toBe(1.15);
  });

  it("4 目次の今見ているセクションの内側の 1px の枠 #4395AB は、目次の白と印の地 #E8F3F6 の両方と 3:1 以上", () => {
    const shadow = value("#rsn a.on", "box-shadow");
    expect(shadow).toBe("inset 0 0 0 1px #4395ab");
    const ring = hexIn(shadow);
    expectRatios(
      [
        ["枠／目次の白", ring, color("#rsn", "background"), 3.43],
        ["枠／印の地", ring, color("#rsn a.on", "background"), 3.03],
      ],
      3,
    );
  });

  it("5 組織との相性の平均の印の縁と凡例の印 --org #8896A5 は白と 3.02:1。2 つの印が重なるところは、上に描く本人の印（.me の z-index 2、.og は z-index なし）の中の白と、平均の印の縁で 3.02:1（縁どうしは比べない）", () => {
    expect(decl(rules, "#rs2 .og", "border")).toBe("2px solid var(--org)");
    expect(decl(rules, "#rs2 .lgog", "border")).toBe("2px solid var(--org)");
    expect(color("#rs2 .og", "background")).toEqual(WHITE);
    const org = solid("var(--org)");
    expect(Number(decl(rules, "#rs2 .me", "z-index"))).toBe(2);
    expect(findDecl(rules, "#rs2 .og", "z-index")).toBeUndefined();
    // 本人の印の中の白（3px の白い縁）
    expect(hexOf(hexIn(value("#rs2 .me", "border")))).toBe("#FFFFFF");
    expectRatios(
      [
        ["平均の印の縁／カードの白", org, WHITE, 3.02],
        [
          "重なるところ: 本人の印の中の白／平均の印の縁",
          hexIn(value("#rs2 .me", "border")),
          org,
          3.02,
        ],
        ["本人の印 #3F8DA5／外と中の白", color("#rs2 .me", "background"), WHITE, 3.77],
      ],
      3,
    );
    // 参照元の縁 #98A4B1 は 2.54:1
    expect(round2(contrastRatio(solid("#98A4B1"), WHITE))).toBe(2.54);
  });

  it("共通の焦点の枠（2px #3F8DA5・2px 外）: 「回答一覧に戻る」・見出しの塊のボタン・ポップアップの閉じるボタンと表の入れ物。参照元の焦点の枠 #1F2933: #rs2 のボタンと目次のリンク・「↑ 先頭へ」", () => {
    for (const selector of [
      "#rd .rd-back:focus-visible",
      "#rd-head .rd-btn:focus-visible",
      ".dialog.rd-pop .icon-btn:focus-visible",
      ".dialog.rd-pop .dialog__body:focus-visible",
    ]) {
      expect(decl(rules, selector, "outline"), selector).toBe(COMMON_RING);
      expect(decl(rules, selector, "outline-offset"), selector).toBe("2px");
    }
    for (const selector of [
      "#rs2 button:focus-visible",
      "#rsn a:focus-visible",
      "#rsn .top:focus-visible",
    ]) {
      expect(decl(rules, selector, "outline"), selector).toBe(DARK_RING);
    }
  });

  it("焦点の枠の形: .rd-scroll の内側の余白 4px・外側の余白 −4px・scroll-padding-top 4px と、#rsn-wrap の上の白い影 4px が、枠のはみ出す幅（線 2px と離す 2px）と同じ。目次のリンクは −3px（「↑ 先頭へ」は 2px）、並び替えのボタンは −4px（ほかの #rs2 のボタンは 2px）", () => {
    const overhang =
      2 + Number.parseInt(decl(rules, "#rd .rd-back:focus-visible", "outline-offset"), 10);
    expect(overhang).toBe(4);
    expect(decl(rules, "#rd .rd-scroll", "padding")).toBe(`${overhang}px`);
    expect(decl(rules, "#rd .rd-scroll", "margin")).toBe(`-${overhang}px`);
    expect(decl(rules, "#rd .rd-scroll", "scroll-padding-top")).toBe(`${overhang}px`);
    // 1.1 版: 焦点のためにブラウザが部品を下の縁に合わせて動かしても、枠の外側が切れない（§2.2）
    expect(decl(rules, "#rd .rd-scroll", "scroll-padding-bottom")).toBe(`${overhang}px`);
    expect(decl(rules, "#rd .rd-scroll", "overflow-y")).toBe("auto");
    expect(decl(rules, "#rsn-wrap", "box-shadow")).toBe(`0 -${overhang}px 0 #ffffff`);
    expect(decl(rules, "#rsn-wrap", "position")).toBe("sticky");
    expect(decl(rules, "#rsn-wrap", "top")).toBe("0");
    expect(decl(rules, "#rsn a:focus-visible", "outline-offset")).toBe("-3px");
    expect(decl(rules, "#rsn .top:focus-visible", "outline-offset")).toBe("2px");
    expect(decl(rules, "#rs2 .seg button:focus-visible", "outline-offset")).toBe("-4px");
    expect(decl(rules, "#rs2 button:focus-visible", "outline-offset")).toBe("2px");
    // 目次のリンクの余白（上下 7px・左右 11px）と並び替えのボタンの余白（上下 6px・左右 12px）があるので、内側の枠は文字にかからない
    expect(decl(rules, "#rsn a", "padding")).toBe("7px 11px");
    expect(decl(rules, "#rs2 .seg button", "padding")).toBe("6px 12px");
  });

  it("内側に描く焦点の枠 #1F2933 と接する色: 目次のリンクの地（白・マウス #F2F5F8・今見ているセクション #E8F3F6）とその内側の枠 #4395AB、並び替えのボタンの地（白・並びの地 #EBEFF4）と隣の選んでいるボタンの影 #CFD7E0", () => {
    expectRatios(
      [
        ["目次のリンクの白", DARK, color("#rsn", "background"), 14.76],
        ["目次のリンクのマウスの地", DARK, color("#rsn a:hover", "background"), 13.48],
        ["今見ているセクションの地", DARK, color("#rsn a.on", "background"), 13.06],
        ["今見ているセクションの内側の枠", DARK, hexIn(value("#rsn a.on", "box-shadow")), 4.3],
        ["選んでいる並び替えのボタンの白", DARK, color("#rs2 .seg button.on", "background"), 14.76],
        ["並びの地", DARK, color("#rs2 .seg", "background"), 12.78],
        ["隣の選んでいるボタンの影", DARK, solid("#CFD7E0"), 10.15],
      ],
      3,
    );
  });

  it("届いていて変えない部品: 共通の焦点の枠と白、#1F2933 の枠と根の地の上端・目次の固定の影・カードの影、選んだ項目のボタンの地、「ひらく」の地と根の地の上端、一覧の平均の線と白の輪、ポップアップの閉じるボタンとそのマウス・押下（不透明度 0.7）", () => {
    const close = color(".dialog.rd-pop .icon-btn", "color");
    const closeHover = over(
      parseColor(value(".dialog.rd-pop .icon-btn", "color")),
      WHITE,
      Number(value(".dialog.rd-pop .icon-btn:hover", "opacity")),
    );
    expect(hexOf(closeHover)).toBe("#828181");
    expect(value("#rsn.stuck", "box-shadow")).toBe("0 6px 12px -8px #b8c2cc");
    expect(value("#rs2 .card", "box-shadow")).toBe("0 8px 24px #e6eff2");
    expectRatios(
      [
        ["共通の焦点の枠／白", RING_COLOR, WHITE, 3.77],
        ["#1F2933 の枠／白", DARK, WHITE, 14.76],
        ["#1F2933 の枠／根の地の上端", DARK, ROOT_TOP, 13.1],
        ["#1F2933 の枠／目次の固定の影", DARK, hexIn(value("#rsn.stuck", "box-shadow")), 8.17],
        ["#1F2933 の枠／カードの影", DARK, hexIn(value("#rs2 .card", "box-shadow")), 12.64],
        [
          "選んだ項目のボタンの地／カードの白",
          color("#rs2 .rs-sk button.on", "background"),
          WHITE,
          4.88,
        ],
        [
          "「ひらく」の地／根の地の上端",
          color("#rs2 .sec.fold .rs-fold", "background"),
          ROOT_TOP,
          4.2,
        ],
        [
          "一覧の平均の線／白の輪",
          color("#rs2 .bar u", "background"),
          hexIn(value("#rs2 .bar u", "box-shadow")),
          10.43,
        ],
        ["ポップアップの閉じるボタン／白", close, WHITE, 8.69],
        ["閉じるボタンのマウス・押下（不透明度 0.7）／白", closeHover, WHITE, 3.88],
      ],
      3,
    );
  });
});

describe("（ID なし）印刷の形の 2 つの規則（§2.18、11-5 §4.4 (1)(3)）と、狭い幅の @media の値（§2.17。PR-7.8a の分）", () => {
  it("動かない箱 #rd-head .rd-scope[data-static] は inline-flex で縦の中央、印刷の形の目次 #rsn-wrap[data-print] は position: static（sticky を使わない）", () => {
    expect(decl(rules, "#rd-head .rd-scope[data-static]", "display")).toBe("inline-flex");
    expect(decl(rules, "#rd-head .rd-scope[data-static]", "align-items")).toBe("center");
    expect(decl(rules, "#rsn-wrap[data-print]", "position")).toBe("static");
    expect(
      compareSpecificity(specificity("#rsn-wrap[data-print]"), specificity("#rsn-wrap")),
    ).toBeGreaterThan(0);
    expect(
      compareSpecificity(
        specificity("#rd-head .rd-scope[data-static]"),
        specificity("#rd-head .rd-scope"),
      ),
    ).toBeGreaterThan(0);
  });

  it("印刷の形の本文 .result-detail[data-print-mode] は、画面の .rd-body と同じく縦に並べて間 16px（§2.1・§2.18）", () => {
    for (const property of ["display", "flex-direction", "gap"]) {
      expect(decl(rules, ".result-detail[data-print-mode]", property), property).toBe(
        decl(rules, "#rd .rd-body", property),
      );
    }
    expect(decl(rules, ".result-detail[data-print-mode]", "gap")).toBe("16px");
  });

  it("1180・1023・860・760・560 以下の切り替え（特性の詳細 3 列・2 列・1 列、概要の上段と人物像 1 列、下段 2 列と 3 枚目の全幅、目次の氏名の欄、行と目盛の列、並び替えの並び）", () => {
    const at1180 = "@media (max-width: 1180px)";
    const at1023 = "@media (max-width: 1023px)";
    const at860 = "@media (max-width: 860px)";
    const at760 = "@media (max-width: 760px)";
    const at560 = "@media (max-width: 560px)";
    expect(decl(rules, "#rs2 .detail", "grid-template-columns")).toBe("repeat(5, minmax(0, 1fr))");
    expect(decl(rules, "#rs2 .detail", "grid-template-columns", at1180)).toBe(
      "repeat(3, minmax(0, 1fr))",
    );
    expect(decl(rules, "#rs2 .detail", "grid-template-columns", at1023)).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
    expect(decl(rules, "#rs2 .detail", "grid-template-columns", at760)).toBe("1fr");
    expect(decl(rules, "#rs2 .hero", "grid-template-columns", at1023)).toBe("1fr");
    expect(decl(rules, "#rs2 .prof", "grid-template-columns", at1023)).toBe("1fr");
    expect(decl(rules, "#rs2 .sw", "grid-template-columns", at1023)).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
    expect(decl(rules, "#rs2 .sw > .card:last-child", "grid-column", at1023)).toBe("1 / -1");
    expect(decl(rules, "#rs2 .fit", "grid-template-columns", at1023)).toBe("1fr");
    expect(decl(rules, "#rs2 .rs", "grid-template-columns", at1023)).toBe(
      "minmax(0, 1fr) 160px 48px 64px",
    );
    expect(decl(rules, "#rsn .who", "display", at860)).toBe("none !important");
    expect(decl(rules, "#rsn .top", "padding", at860)).toBe("7px 10px");
    expect(decl(rules, "#rs2 .tr", "grid-template-columns", at760)).toBe(
      "110px minmax(0, 1fr) 40px 56px",
    );
    expect(decl(rules, "#rs2 .ax", "gap", at760)).toBe("8px");
    expect(decl(rules, "#rs2 .sw", "grid-template-columns", at760)).toBe("1fr");
    expect(decl(rules, "#rs2 .seg", "margin-left", at760)).toBe("0");
    expect(decl(rules, "#rs2 .card", "padding", at760)).toBe("18px");
    expect(decl(rules, "#rs2 .sw .card", "padding", at760)).toBe("20px 22px");
    expect(decl(rules, "#rs2 .kpi2", "grid-template-columns", at560)).toBe("1fr");
    expect(decl(rules, "#rs2 .rs .lv", "display", at560)).toBe("none");
    expect(decl(rules, "#rs2 .rs .bar", "grid-column", at560)).toBe("1 / -1");
    expect(decl(rules, "#rs2 .fr .row .track", "grid-column", at560)).toBe("1 / -1");
    expect(decl(rules, "#rs2 .who", "flex-direction", at560)).toBe("column");
  });

  it("枠 #rd は画面に固定（inset 0・z-index 10・最小幅 320px）、見出しの塊はプルダウンとボタンが 1 行に入らない幅で折り返して右に寄せる、ポップアップの幅は min(800px, 100vw − 32px) で表の最小幅 480px", () => {
    expect(decl(rules, "#rd", "position")).toBe("fixed");
    expect(decl(rules, "#rd", "inset")).toBe("0");
    expect(decl(rules, "#rd", "z-index")).toBe("10");
    expect(decl(rules, "#rd", "min-width")).toBe("320px");
    expect(decl(rules, "#rd .rd-body", "max-width")).toBe("1200px");
    expect(decl(rules, "#rd-head .rd-tools", "flex-wrap")).toBe("wrap");
    expect(decl(rules, "#rd-head .rd-tools", "justify-content")).toBe("flex-end");
    expect(decl(rules, "#rd-head .rd-scope", "width")).toBe("180px");
    expect(decl(rules, "#rd-head .rd-scope", "height")).toBe("44px");
    expect(decl(rules, ".dialog.rd-pop", "width")).toBe("min(800px, calc(100vw - 32px))");
    expect(decl(rules, ".dialog.rd-pop .rd-pop-table", "min-width")).toBe("480px");
    expect(decl(rules, ".dialog.rd-pop .dialog__body", "overflow")).toBe("auto");
  });
});

describe("（ID なし）焦点の扱いのアプリの指定（§2.5。1.1 版）", () => {
  it("「↑ 先頭へ」のあとに焦点を受ける見出し #rd-head .rd-title は輪郭を出さない（管理画面に共通の焦点の枠より強い）", () => {
    expect(decl(rules, "#rd-head .rd-title:focus", "outline")).toBe("none");
    expect(
      compareSpecificity(specificity("#rd-head .rd-title:focus"), specificity(":focus-visible")),
    ).toBeGreaterThan(0);
  });
});

// ---- 育て方・接し方（PR-7.8b。§2.2・§2.13・§2.14・§2.17・§2.18）

describe("M7-result-38 育て方・接し方の文字（K-49 の表の 6・15 と、届いていて変えない文字）", () => {
  it("K-49 の表の 6: 4 区分の表の下の注記 .qax・.qax2 は --mute2-tx #6A7888 でカードの白と 4.51:1（参照元 --mute2 #8592A0 は 3.17:1）", () => {
    for (const selector of ["#rs2 .qax", "#rs2 .qax2"]) {
      expect(decl(rules, selector, "color"), selector).toBe("var(--mute2-tx)");
    }
    expectRatios(
      [
        [
          "6 .qax／カードの白",
          color("#rs2 .qax", "color"),
          color("#rs2 .card", "background"),
          4.51,
        ],
        ["6 .qax2／カードの白", color("#rs2 .qax2", "color"), WHITE, 4.51],
      ],
      4.5,
    );
    expect(round2(contrastRatio(solid("var(--mute2)"), WHITE))).toBe(3.17);
  });

  it("K-49 の表の 15: 灰色の帯の札「×」の文字 #5D6875 と札の地 #E4E8ED で 4.61:1（参照元 --mute #5F6B78 は 4.42:1）", () => {
    expect(value("#rs2 .ngok .ng b", "color").toUpperCase()).toBe("#5D6875");
    expect(value("#rs2 .ngok .ng b", "background").toUpperCase()).toBe("#E4E8ED");
    expectRatios(
      [
        [
          "15 札「×」／札の地",
          color("#rs2 .ngok .ng b", "color"),
          color("#rs2 .ngok .ng b", "background"),
          4.61,
        ],
      ],
      4.5,
    );
    const reference = contrastRatio(solid("var(--mute)"), color("#rs2 .ngok .ng b", "background"));
    expect(round2(reference)).toBe(4.42);
    expect(reference).toBeLessThan(4.5);
    // 緑の帯の札（白い文字と --good）は参照元の色のまま
    expect(decl(rules, "#rs2 .ngok .ok b", "background")).toBe("var(--good)");
  });

  it("届いていて変えない文字（育て方）: 「× 優位感覚」と「第二候補を見る　＞」#2E7A90、札、イメージ画像の札、割合の名前と文字、12 項目の小見出しと文、区切り、囲みのラベルと文、第二候補の見出しの行", () => {
    const card = color("#rs2 .card", "background");
    const ink = solid("var(--ink)");
    const plt = color("#rs2 .call", "background");
    expect(value("#rs2 .learn .type .xs", "color").toUpperCase()).toBe("#2E7A90");
    // 第二候補のボタンは §2.7.5 のボタン（#rs2 .more）の --p のまま（#2D788E は概要の下段のカード 1・2 の地の上だけ）
    expect(decl(rules, "#rs2 .more", "color")).toBe("var(--p)");
    expect(findDecl(rules, "#rs2 .learn .more", "color")).toBeUndefined();
    expect(findDecl(rules, "#rs2 .lt b", "color")).toBeUndefined();
    expect(findDecl(rules, "#rs2 .catch", "color")).toBeUndefined();
    expectRatios(
      [
        ["「× 優位感覚「…」」／カードの白", color("#rs2 .learn .type .xs", "color"), card, 4.88],
        ["「第二候補を見る　＞」／カードの白", color("#rs2 .more", "color"), card, 4.88],
        [
          "札「優位感覚：…」／札の地",
          color("#rs2 .sense", "color"),
          color("#rs2 .sense", "background"),
          5.97,
        ],
        [
          "イメージ画像の札の白い文字／#1F5F73",
          color("#rs2 .lpic-cap", "color"),
          color("#rs2 .lpic-cap", "background"),
          7.14,
        ],
        ["割合の第一候補の名前／カードの白", color("#rs2 .lt .main", "color"), card, 16.52],
        ["割合の文字（#rs2 の --ink）／カードの白", ink, card, 16.52],
        ["12 項目の小見出し／カードの白", color("#rs2 .dl2 h4", "color"), card, 5.44],
        ["12 項目の文／カードの白", color("#rs2 .dl2 p", "color"), card, 10.43],
        ["区切りの見出し／カードの白", color("#rs2 .grp", "color"), card, 16.52],
        ["囲みのラベル（--p-plt）／囲みの地", color("#rs2 .call .lbl", "color"), plt, 4.57],
        ["囲みの文／囲みの地", color("#rs2 .call p", "color"), plt, 14.46],
        [
          "第二候補の見出しの行の小さい文字／カードの白",
          color("#rs2 .sub2 .h span", "color"),
          card,
          5.44,
        ],
      ],
      4.5,
    );
  });

  it("届いていて変えない文字（接し方）: 4 区分のマス #5F6B78／#EEF2F6 と本人のマス、見出しの行の小さい行、キャッチと段落、関わり方のコツ、帯、吹き出し、タブ、タイプ別の接し方の文", () => {
    const card = color("#rs2 .card", "background");
    const ink = solid("var(--ink)");
    expectRatios(
      [
        [
          "マスの文字／マスの地",
          color("#rs2 .quad div", "color"),
          color("#rs2 .quad div", "background"),
          4.83,
        ],
        [
          "本人のマスの白い文字／#14202B",
          color("#rs2 .quad div.on", "color"),
          color("#rs2 .quad div.on", "background"),
          16.52,
        ],
        [
          "本人のマスの小さい文字 #C9D2DB／#14202B",
          color("#rs2 .quad div.on small", "color"),
          color("#rs2 .quad div.on", "background"),
          10.8,
        ],
        ["見出しの行の小さい行／カードの白", color("#rs2 .shead .s", "color"), card, 5.44],
        ["キャッチ（#rs2 の --ink）／カードの白", ink, card, 16.52],
        ["段落／カードの白", color("#rs2 .desc", "color"), card, 10.43],
        ["関わり方のコツの箇条書き／カードの白", color("#rs2 .how li", "color"), card, 10.43],
        ["関わり方のコツの段落／カードの白", color("#rs2 .how p", "color"), card, 5.44],
        [
          "灰色の帯の文字／帯の地",
          color("#rs2 .ngok .ng", "color"),
          color("#rs2 .ngok .ng", "background"),
          5.07,
        ],
        [
          "緑の帯の文字／帯の地",
          color("#rs2 .ngok .ok", "color"),
          color("#rs2 .ngok .ok", "background"),
          14.56,
        ],
        [
          "緑の帯の札の白い文字／--good",
          color("#rs2 .ngok .ok b", "color"),
          color("#rs2 .ngok .ok b", "background"),
          4.91,
        ],
        [
          "吹き出し／吹き出しの地",
          color("#rs2 .say div", "color"),
          color("#rs2 .say div", "background"),
          14.46,
        ],
        [
          "タブ／白",
          color("#rs2 .tabs button", "color"),
          color("#rs2 .tabs button", "background"),
          5.44,
        ],
        [
          "選んでいるタブの白い文字／#14202B",
          color("#rs2 .tabs button.on", "color"),
          color("#rs2 .tabs button.on", "background"),
          16.52,
        ],
        ["タイプ別の接し方の文／カードの白", color("#rs2 .mine p", "color"), card, 10.43],
      ],
      4.5,
    );
    // 選んでいるタブはマウスの規則が無く、選んだ状態の地が変わらない（.tabs button.on は .tabs button より後）
    expect(indexOfRule("#rs2 .tabs button.on")).toBeGreaterThan(indexOfRule("#rs2 .tabs button"));
  });

  it("小さいレーダーの軸の名前（MINI_RADAR_COLORS）: #475569 とカードの白 7.58:1、強調する軸の #14202B と 16.52:1", () => {
    expectRatios(
      [
        [
          "軸の名前／カードの白",
          solid(MINI_RADAR_COLORS.label),
          color("#rs2 .card", "background"),
          7.58,
        ],
        ["強調する軸の名前／カードの白", solid(MINI_RADAR_COLORS.labelStrong), WHITE, 16.52],
      ],
      4.5,
    );
  });

  it("参照元の色のまま使う用途: 関わり方のコツの箇条書きの丸は --p2、緑の帯の札の地は --good（新しい色に置き換えていない）", () => {
    expect(decl(rules, "#rs2 .how li::before", "background")).toBe("var(--p2)");
    expect(decl(rules, "#rs2 .ngok .ok b", "background")).toBe("var(--good)");
    expect(vars.get("--good")?.toUpperCase()).toBe("#15805E");
  });
});

describe("M7-result-39 育て方・接し方の部品（K-50。PR-7.8b の分）", () => {
  it("接し方の選んでいるタブの地と枠 #14202B はカードの白と 16.52:1", () => {
    expect(decl(rules, "#rs2 .tabs button.on", "background")).toBe("var(--ink)");
    expect(decl(rules, "#rs2 .tabs button.on", "border-color")).toBe("var(--ink)");
    expectRatios(
      [
        [
          "選んでいるタブの地／カードの白",
          color("#rs2 .tabs button.on", "background"),
          WHITE,
          16.52,
        ],
      ],
      3,
    );
  });

  it("育て方の小さいレーダーの線と点 #2E7A90 は、外の地のカードの白と 4.88:1、下にある塗り rgba(46,122,144,.2) を白に重ねた #D5E4E9 と 3.74:1（目盛と軸の線とは比べない）", () => {
    const line = solid(MINI_RADAR_COLORS.line);
    const fill = over(parseColor(MINI_RADAR_COLORS.fill), WHITE);
    expect(hexOf(fill)).toBe("#D5E4E9");
    expect(MINI_RADAR_COLORS.point).toBe(MINI_RADAR_COLORS.line);
    expectRatios(
      [
        ["線と点／カードの白", line, color("#rs2 .card", "background"), 4.88],
        ["線と点／塗りを白に重ねた色", line, fill, 3.74],
      ],
      3,
    );
  });

  it("新しいレイアウトの中のボタン（第二候補のボタン・タブ）の焦点の枠は #rs2 button:focus-visible（2px #1F2933・2px 外）のまま", () => {
    for (const selector of ["#rs2 .more:focus-visible", "#rs2 .tabs button:focus-visible"]) {
      expect(findDecl(rules, selector, "outline"), selector).toBeUndefined();
      expect(findDecl(rules, selector, "outline-offset"), selector).toBeUndefined();
    }
    expect(decl(rules, "#rs2 button:focus-visible", "outline")).toBe(DARK_RING);
    expect(decl(rules, "#rs2 button:focus-visible", "outline-offset")).toBe("2px");
  });
});

describe("（ID なし）育て方・接し方の規則の置き方と値（別表D の 12〜14・17。§2.13・§2.14・§2.17・§2.18）", () => {
  const at1023 = "@media (max-width: 1023px)";
  const at760 = "@media (max-width: 760px)";

  it("12・13 の規則は、同じセレクタの 14 の @media の規則より前に書く（同じ詳細度なので後ろの @media が勝つ）", () => {
    for (const [selector, at] of [
      ["#rs2 .learn", at1023],
      ["#rs2 .learn", at760],
      ["#rs2 .ss", at1023],
      ["#rs2 .ss", at760],
      ["#rs2 .dl2", at760],
      ["#rs2 .how", at760],
      ["#rs2 .quad", at1023],
      ["#rs2 .qax", at1023],
      ["#rs2 .quad div", at1023],
      ["#rs2 .learn > .card:first-child", at760],
    ] as const) {
      const base = indexOfRule(selector);
      expect(base, selector).toBeGreaterThanOrEqual(0);
      expect(indexOfRule(selector, at), `${at} ${selector}`).toBeGreaterThan(base);
    }
  });

  it("1440px の値: 育て方の 2 列（左 300px）と留まる左のカード（sticky・上 72px）、接し方の 2 列（左 320px）、12 項目と関わり方のコツの 2 列、4 区分の表の最大の幅 320px", () => {
    expect(decl(rules, "#rs2 .learn", "grid-template-columns")).toBe("300px minmax(0, 1fr)");
    expect(decl(rules, "#rs2 .learn", "align-items")).toBe("start");
    expect(decl(rules, "#rs2 .learn > .card:first-child", "position")).toBe("sticky");
    expect(decl(rules, "#rs2 .learn > .card:first-child", "top")).toBe("72px");
    expect(decl(rules, "#rs2 .ss", "grid-template-columns")).toBe("320px minmax(0, 1fr)");
    expect(decl(rules, "#rs2 .dl2", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(decl(rules, "#rs2 .how", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(decl(rules, "#rs2 .quad", "max-width")).toBe("320px");
    expect(decl(rules, "#rs2 .qax", "max-width")).toBe("320px");
    expect(decl(rules, "#rs2 .quad", "aspect-ratio")).toBe("1 / 1");
    expect(decl(rules, "#rs2 .rs-mini svg", "max-width")).toBe("340px");
  });

  it("1023px 以下: 育て方の左 240px・接し方の左 250px、4 区分の表と注記 280px、マスの余白 10px・文字 11px・折り返さない。760px 以下: 育て方・接し方・12 項目・関わり方のコツが 1 列で、左のカードは留めない", () => {
    expect(decl(rules, "#rs2 .learn", "grid-template-columns", at1023)).toBe(
      "240px minmax(0, 1fr)",
    );
    expect(decl(rules, "#rs2 .ss", "grid-template-columns", at1023)).toBe("250px minmax(0, 1fr)");
    expect(decl(rules, "#rs2 .quad", "max-width", at1023)).toBe("280px");
    expect(decl(rules, "#rs2 .qax", "max-width", at1023)).toBe("280px");
    expect(decl(rules, "#rs2 .quad div", "padding", at1023)).toBe("10px");
    expect(decl(rules, "#rs2 .quad div", "font-size", at1023)).toBe("11px");
    expect(decl(rules, "#rs2 .quad div", "white-space", at1023)).toBe("nowrap");
    for (const selector of ["#rs2 .learn", "#rs2 .ss", "#rs2 .dl2", "#rs2 .how"]) {
      expect(decl(rules, selector, "grid-template-columns", at760), selector).toBe("1fr");
    }
    expect(decl(rules, "#rs2 .learn > .card:first-child", "position", at760)).toBe("static");
  });

  it("印刷の形: #rs2 .learn[data-print] > .card:first-child は position: static（留めない。sticky の規則より強い）", () => {
    const selector = "#rs2 .learn[data-print] > .card:first-child";
    expect(decl(rules, selector, "position")).toBe("static");
    expect(
      compareSpecificity(specificity(selector), specificity("#rs2 .learn > .card:first-child")),
    ).toBeGreaterThan(0);
  });

  it("見出し: 関わり方のコツ（.howt）とタイプ別の接し方の見出し（.mine h3。参照元は .mine h4。§2.21 の 1.2 版）は同じ 14px・太さ 700、関わり方のコツのカードの見出し（.how h4）も 14px・太さ 700", () => {
    for (const selector of ["#rs2 .howt", "#rs2 .mine h3", "#rs2 .how h4"]) {
      expect(decl(rules, selector, "font-size"), selector).toBe("14px");
      expect(decl(rules, selector, "font-weight"), selector).toBe("700");
    }
    expect(indexOfRule("#rs2 .mine h4")).toBe(-1);
  });

  it("絵 #rs2 .lpic img は display: inline（Illustration の共通の .illustration の display: block より強く、絵と札を行の中に並べる要素にする）", () => {
    expect(decl(rules, "#rs2 .lpic img", "display")).toBe("inline");
    expect(decl(rules, "#rs2 .lpic", "text-align")).toBe("center");
    expect(decl(rules, "#rs2 .lpic-cap", "display")).toBe("inline-block");
    expect(
      compareSpecificity(specificity("#rs2 .lpic img"), specificity(".illustration")),
    ).toBeGreaterThan(0);
  });
});

describe("（ID なし）旧のセクションと前回のグラフの CSS の片付け（11-4 §3.7・§4.2、総論 6.4）", () => {
  const admin = parseCssRules(readCss("app/(admin)/admin.css"));
  const adminText = readCss("app/(admin)/admin.css");
  const print = parseCssRules(readCss("app/(admin)/admin/results/[resultId]/print/print.css"));
  const printText = readCss("app/(admin)/admin/results/[resultId]/print/print.css");
  const selectorsOf = (list: typeof rules) => list.flatMap((rule) => rule.selectors);

  it("admin.css に旧のセクション・前回のグラフの規則（.radar-chart・.apexcharts-・.result-grid・.panel__header・.type-card__name・.style-card・.guide-list）と変数（--chart-・--band-・--reliability-・--gauge-track・--style-）が無い", () => {
    for (const name of [
      ".radar-chart",
      ".apexcharts-",
      ".result-grid",
      ".panel__header",
      ".type-card__name",
      ".style-card",
      ".guide-list",
    ]) {
      expect(
        selectorsOf(admin).filter((selector) => selector.includes(name)),
        name,
      ).toEqual([]);
    }
    for (const name of ["--chart-", "--band-", "--reliability-", "--gauge-track", "--style-"]) {
      expect(adminText.includes(name), name).toBe(false);
    }
  });

  it("admin.css に、使う部品が残る指定（旧の AI 解説の領域の .result-section・.panel と、.muted・.small・.pre-line・.illustration）は残る", () => {
    for (const selector of [
      ".result-section",
      ".result-section > h2",
      ".result-section .panel",
      ".panel",
      ".muted",
      ".small",
      ".pre-line",
      ".illustration",
    ]) {
      expect(selectorsOf(admin), selector).toContain(selector);
    }
  });

  it("print.css に前回のグラフの指定と、要素の無くなった旧のセクションの指定が無い（AI 解説の印刷の塊の .result-section・.panel は残る）", () => {
    for (const name of [
      ".apexcharts-",
      ".radar-chart",
      ".result-subline",
      ".result-grid",
      ".gauge-row",
      ".type-card",
      ".position-view",
      ".guide-list",
      ".trait-summary",
      ".donut-gauge",
    ]) {
      expect(
        selectorsOf(print).filter((selector) => selector.includes(name)),
        name,
      ).toEqual([]);
      expect(printText.includes(name), name).toBe(false);
    }
    for (const selector of [
      ".print-root",
      ".print-root h1",
      ".print-root .result-section",
      ".print-root .result-section > h2",
      ".print-root .panel",
    ]) {
      expect(selectorsOf(print), selector).toContain(selector);
    }
  });
});
