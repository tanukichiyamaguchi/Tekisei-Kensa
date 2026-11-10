// イラストの部品（components/ui/Illustration.tsx。06 §7、11-3 §3.8）の className・decorative・loading。
// 省いたときは今の振る舞い（alt は表示名、読み上げる、loading 属性なし）のまま。404 の代わりの枠は E2E で見ない（画像はすべてある）
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Illustration } from "@/components/ui/Illustration";

const render = (props: Parameters<typeof Illustration>[0]) =>
  renderToStaticMarkup(createElement(Illustration, props));

describe("Illustration（11-3 §3.8）", () => {
  it("省いたとき: alt は表示名、aria-hidden と loading の属性を付けない", () => {
    const html = render({ src: "/images/types/pioneer.svg", alt: "ひなた", width: 96, height: 96 });
    // React のサーバの描画は画像の preload の link を前に付けるので、img の開きタグを比べる
    expect(html).toContain(
      '<img class="illustration" src="/images/types/pioneer.svg" alt="ひなた" width="96" height="96"/>',
    );
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("loading=");
  });

  it("decorative: alt を空にして aria-hidden。className は illustration の後ろ、loading は指定のとおり", () => {
    const html = render({
      src: "/images/types/pioneer.svg",
      alt: "ひなた",
      width: 62,
      height: 112,
      className: "ob-img",
      decorative: true,
      loading: "lazy",
    });
    expect(html).toContain('class="illustration ob-img"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("ひなた");
  });
});
