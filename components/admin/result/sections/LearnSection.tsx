"use client";
// 育て方 rs-ln（11-4 §2.13）。2 列 #rs-learn: 左のカード（育成タイプ・資質の第一候補と優位感覚・札・絵と札・小さいレーダー・資質の割合・
// 第二候補のボタン）は、スクロールする領域の上端から 72px に留まる（CSS の position: sticky。760px 以下と印刷の形は留めない）。
// 右のカード（「このタイプへの関わり方」の囲みと、2 つの区切りの 12 項目）の最後に、第二候補を出しているときだけ #rs-ln2 を足す
// （第二候補の絵・表示名・優位感覚、関わり方の囲み、12 項目。割合とレーダーは出さない。§2.13.4）。第二候補の文も同じ育成方法のマスタの文
// （「話し方」を入れ替えない。K-32 ⑨）で、buildResultDetailView が組み立てたもの。資質の割合は、値の大きい順（同じ値は軸の順。安定な
// 並べ替え）の行に、棒（値 ÷ 4 つの最大値。最大値が 0 なら 0%）と aptitudeShares の文字を出し、第一候補の行を .m・名前を .main にする。
// 第二候補のボタンは状態の属性を付けず、ボタンの文（出していないときの「第二候補を見る」と、出しているときの「第二候補を閉じる」）で
// 伝える（§2.21 に定めが無いので、仕様に無い属性を足さない）。区切りの見出しは §2.21 に要素の定めが無いので h3（特性の詳細の小見出しと
// 同じ決め方）、項目の小見出しは h4（§2.21）。絵は飾り（alt 空）。印刷の形は data-print（左のカードを留めない。別表D の 17）を付け、
// ボタンを同じ位置・見た目で描く（処理なし。第二候補は画面の状態のとおり。§2.18）
import { ResultIcon } from "@/components/admin/result/result-icons";
import type {
  ResultDetailVariant,
  ResultViewActions,
} from "@/components/admin/result/ResultViewStateContext";
import { MiniRadarSvg } from "@/components/charts/MiniRadarSvg";
import { Illustration } from "@/components/ui/Illustration";
import { aptitudeShares } from "@/lib/presentation/result-detail-rules";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { LearnCandidateView, ResultDetailView } from "@/lib/presentation/result-detail-view";
import type { ResultViewState } from "@/lib/presentation/result-view-state";

/** 絵の大きさ（§2.13.1 の最大の高さ 120px と §2.13.4 の高さ 48px。img の width・height 属性） */
const IMAGE_SIZE = 120;
const SECOND_IMAGE_SIZE = 48;

/** 「このタイプへの関わり方」の囲みと 2 つの区切りの 12 項目（第一候補と第二候補で同じ形。§2.13.3） */
function CandidateGuide(props: { readonly candidate: LearnCandidateView }) {
  const t = RESULT_DETAIL_TEXTS.learn;
  return (
    <>
      <div className="call">
        <div className="lbl">{t.approach}</div>
        <p>{props.candidate.approach}</p>
      </div>
      <div className="dl2">
        {props.candidate.groups.flatMap((group) => [
          <h3 key={group.title} className="grp">
            {group.title}
          </h3>,
          ...group.items.map((item) => (
            <div key={item.key}>
              <h4>
                <span className="cic">
                  <ResultIcon name={item.icon} />
                </span>
                {item.label}
              </h4>
              <p>{item.text}</p>
            </div>
          )),
        ])}
      </div>
    </>
  );
}

export function LearnSection(props: {
  readonly view: ResultDetailView;
  readonly viewState: ResultViewState;
  readonly actions: ResultViewActions;
  readonly variant: ResultDetailVariant;
}) {
  const { first, second, aptitudes } = props.view.learn;
  const { secondOpen } = props.viewState;
  const screen = props.variant === "screen";
  const t = RESULT_DETAIL_TEXTS.learn;
  // 資質の割合の行: 値の大きい順（同じ値は軸の順。Array.prototype.sort は安定）
  const rows = [...aptitudes].sort((a, b) => b.value - a.value);
  const shares = aptitudeShares(rows.map((row) => row.value));
  const max = Math.max(...aptitudes.map((aptitude) => aptitude.value));

  return (
    <div id="rs-learn" className="learn" data-print={screen ? undefined : ""}>
      <div className="card">
        <div className="lbl">{t.type}</div>
        <div className="type">
          {first.label}
          <span className="xs">{t.senseX(first.senseShort)}</span>
        </div>
        <span className="sense">{t.senseTag(first.sense)}</span>
        <div className="lpic">
          <Illustration
            src={first.imagePath}
            alt=""
            width={IMAGE_SIZE}
            height={IMAGE_SIZE}
            decorative
          />
          <span className="lpic-cap">{t.imageCaption(first.senseShort)}</span>
        </div>
        <div className="rs-mini">
          <MiniRadarSvg axes={aptitudes} strongKey={first.key} />
        </div>
        <div className="lt">
          {rows.map((row, i) => {
            const main = row.key === first.key;
            return (
              <div key={row.key} className={main ? "m" : undefined}>
                <span className={main ? "main" : undefined}>{row.label}</span>
                <span className="bar">
                  <i style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }} />
                </span>
                <b>{shares[i]}</b>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="more"
          onClick={screen ? () => props.actions.setSecondOpen(!secondOpen) : undefined}
        >
          {secondOpen ? t.hideSecond : t.showSecond}
        </button>
      </div>
      <div className="card">
        <CandidateGuide candidate={first} />
        {secondOpen ? (
          <div id="rs-ln2" className="sub2">
            <div className="h">
              <Illustration
                src={second.imagePath}
                alt=""
                width={SECOND_IMAGE_SIZE}
                height={SECOND_IMAGE_SIZE}
                decorative
              />
              <div>
                <span>{t.second}</span>
                <br />
                <b>{second.label}</b>
                <span>{t.secondSense(second.sense)}</span>
              </div>
            </div>
            <CandidateGuide candidate={second} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
