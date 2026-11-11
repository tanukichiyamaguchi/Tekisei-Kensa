"use client";
// 接し方 rs-ss（11-4 §2.14）。2 列 #rs-ss1: 左のカードに 4 区分の点数の表（STYLE_QUADRANTS の順。右の列は .rt、本人のスタイルは .on。
// 点数は小数第 1 位の表示で、負の値もそのまま出す）・表の下の 2 行の注記・小さいレーダー（本人のスタイルの軸を太字。負の値は 0 の位置）、
// 右のカードに見出しの行（絵・スタイル名・小さい行（自己主張の行・〇〇派・偉人名のうち空でないものを、全角の空白・中黒・全角の空白の
// 区切り（RESULT_DETAIL_TEXTS.style.separator）でつなぐ））・キャッチ・段落。その下に関わり方のコツ #rs-how（見分け方・褒め方・
// 効果的な対応・声かけ例の 4 枚。中身は灰色の帯（×）→ 緑の帯（○）→ 箇条書きか吹き出し → 段落の順）と、タイプ別の接し方 #rs-mine
// （見ている人のスタイルのタブ 4 つ。既定はドライビング。選んだタブの文）。
// 本文の振り分けと関わり方のコツの振り分けは buildResultDetailView（splitStyleBody・splitHowTo）、タブの文は本人のスタイルの列の 4 つ
// （ほかの列の文は持たない。§2.21）。前回の「本タイプの対処法」の見出しと文（interactionHeading）は出さない。「関わり方のコツ」は §2.21 に
// 要素の定めが無いので h3、そのカードの見出しは h4。タイプ別の接し方の見出しは、関わり方のコツと並ぶまとまりなので同じ段の h3（§2.21 の
// h4 を 1.2 版で改めた。見た目は同じ値の .mine h3 の規則で変えない）。絵は飾り（alt 空）。印刷の形はタブを同じ位置・見た目で描く
// （処理なし。選んでいるタブは画面の状態のとおり。§2.18）
import type {
  ResultDetailVariant,
  ResultViewActions,
} from "@/components/admin/result/ResultViewStateContext";
import { MiniRadarSvg } from "@/components/charts/MiniRadarSvg";
import { Illustration } from "@/components/ui/Illustration";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import type { ResultViewState } from "@/lib/presentation/result-view-state";
import { formatOneDecimal } from "@/lib/presentation/rounding";

/** 見出しの行の絵の大きさ（§2.14.2 の高さ 120px。img の width・height 属性） */
const IMAGE_SIZE = 120;

type HowToCard = ResultDetailView["style"]["howTo"][number];

/** 関わり方のコツのカード 1 枚（§2.14.3）。出す順は 帯（×）→ 帯（○）→ 箇条書き・吹き出し → 段落 */
function HowToCardView(props: { readonly card: HowToCard }) {
  const { title, parts } = props.card;
  return (
    <div className="card">
      <h4>{title}</h4>
      {parts.ng.length > 0 || parts.ok.length > 0 ? (
        <div className="ngok">
          {parts.ng.map((text, i) => (
            <div key={`ng${i}`} className="ng">
              <b>{RESULT_DETAIL_TEXTS.style.ngMark}</b>
              <span>{text}</span>
            </div>
          ))}
          {parts.ok.map((line, i) => (
            <div key={`ok${i}`} className="ok">
              <b>{line.mark}</b>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      ) : null}
      {parts.bullets.length > 0 ? (
        <ul>
          {parts.bullets.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      ) : null}
      {parts.says.length > 0 ? (
        <div className="say">
          {parts.says.map((text, i) => (
            <div key={i}>{text}</div>
          ))}
        </div>
      ) : null}
      {parts.paragraphs.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </div>
  );
}

export function StyleSection(props: {
  readonly view: ResultDetailView;
  readonly viewState: ResultViewState;
  readonly actions: ResultViewActions;
  readonly variant: ResultDetailVariant;
}) {
  const { style } = props.view;
  const { viewerStyle } = props.viewState;
  const screen = props.variant === "screen";
  const t = RESULT_DETAIL_TEXTS.style;
  // 見出しの行の小さい行: 自己主張の行・〇〇派・偉人名のうち空でないもの（§2.14.2）
  const sub = [style.body.assertion, style.body.kind, style.greatPersonName]
    .filter((part) => part !== "")
    .join(t.separator);
  const selected = style.interactions.find((item) => item.viewer === viewerStyle);

  return (
    <>
      <div id="rs-ss1" className="ss">
        <div className="card">
          <div className="lbl">{t.label}</div>
          <div className="quad">
            {style.quad.map((cell) => {
              const classes = [
                cell.align === "right" ? "rt" : "",
                cell.key === style.key ? "on" : "",
              ]
                .filter((name) => name !== "")
                .join(" ");
              return (
                <div key={cell.key} className={classes === "" ? undefined : classes}>
                  <span>
                    {cell.name}
                    <br />
                    <small>{cell.kind}</small>
                  </span>
                  <b>{formatOneDecimal(cell.value)}</b>
                </div>
              );
            })}
          </div>
          <div className="qax">
            <span>{t.assertLow}</span>
            <span>{t.assertHigh}</span>
          </div>
          <div className="qax2">{t.rows}</div>
          <div className="rs-mini">
            <MiniRadarSvg axes={style.radar} strongKey={style.key} />
          </div>
        </div>
        <div className="card">
          <div className="shead">
            <Illustration
              src={style.imagePath}
              alt=""
              width={IMAGE_SIZE}
              height={IMAGE_SIZE}
              decorative
            />
            <div>
              <div className="t">{style.typeName}</div>
              <div className="s">{sub}</div>
            </div>
          </div>
          {style.body.catchCopy !== "" ? (
            <p className="catch">{t.catchCopy(style.body.catchCopy)}</p>
          ) : null}
          {style.body.paragraphs.map((text, i) => (
            <p key={i} className="desc">
              {text}
            </p>
          ))}
        </div>
      </div>
      <div id="rs-how">
        <h3 className="howt">{t.howTo}</h3>
        <div className="how">
          {style.howTo.map((card) => (
            <HowToCardView key={card.title} card={card} />
          ))}
        </div>
      </div>
      <div id="rs-mine" className="card mine">
        <h3>{t.mine}</h3>
        <div className="tabs">
          {style.interactions.map((item) => {
            const on = item.viewer === viewerStyle;
            return (
              <button
                key={item.viewer}
                type="button"
                className={on ? "on" : undefined}
                aria-pressed={on}
                onClick={screen ? () => props.actions.setViewerStyle(item.viewer) : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        {selected ? <p>{selected.text}</p> : null}
      </div>
    </>
  );
}
