// 01 §8.7 のセキュリティヘッダーと、サーバ専用パッケージの指定
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// ブラウザの Firebase Auth クライアント SDK が通信する先（メール＋パスワード認証とトークン交換）
const firebaseAuthOrigins = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
];
const emulatorOrigins = isDev ? ["http://127.0.0.1:9099", "http://localhost:9099"] : [];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // ApexCharts と Next.js のインラインスクリプトのため。開発サーバは eval を使うため dev のみ許可する
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${[...firebaseAuthOrigins, ...emulatorOrigins].join(" ")}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

// PDF 印刷用ページ（07 §9.4）。URL にトークンが載るため、検索避けと Referer 抑止を上書きする
const printPageHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Admin SDK と Chromium はサーバ専用の外部パッケージとしてバンドルしない（01 §5.2）
  serverExternalPackages: ["firebase-admin", "puppeteer-core", "@sparticuz/chromium"],
  headers: async () => [
    { source: "/(.*)", headers: securityHeaders },
    { source: "/admin/results/:resultId/print", headers: printPageHeaders },
  ],
  images: { remotePatterns: [] },
};

export default nextConfig;
