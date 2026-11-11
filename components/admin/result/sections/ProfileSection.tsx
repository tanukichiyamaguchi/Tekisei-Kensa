"use client";
// 人物像 rs-pf（11-4 §2.12）。2 列 #rs-prof: 左のカードに右上へ回り込ませた絵の箱（タイプの絵・キャラクター名・タイプ名）と特徴、
// 右の列に向いている仕事（太字の適性・改行・適性職種）のカードと、本人へのアドバイスの囲み（空なら出さない）。文は TYPE_TEXTS（付録C §1）
// を buildResultDetailView が組み立てたもの。改行は CSS の pre-line で保つ。ラベルは div.lbl（.prof p・.kv p の文の指定を受けない）
import { Illustration } from "@/components/ui/Illustration";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";

export function ProfileSection(props: { readonly view: ResultDetailView }) {
  const { type } = props.view;
  const t = RESULT_DETAIL_TEXTS.profile;
  return (
    <div id="rs-prof" className="prof">
      <div className="card">
        <div className="pf-pic">
          <Illustration src={type.imagePath} alt="" width={130} height={130} decorative />
          <div className="pf-nm">{type.characterName}</div>
          <div className="pf-tp">{type.label}</div>
        </div>
        <div className="lbl">{t.characteristics}</div>
        <p>{type.characteristics}</p>
      </div>
      <div className="kv">
        <div className="card">
          <div className="lbl">{t.suitableJobs}</div>
          <p>
            <b>{type.aptitude}</b>
            {`\n${type.suitableJobs}`}
          </p>
        </div>
        {type.advice !== "" ? (
          <div className="call">
            <div className="lbl">{t.advice}</div>
            <p>{type.advice}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
