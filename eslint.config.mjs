// 01 §3.5 の Lint 規則。第 1 群（純関数ライブラリ）、第 2 群（app/・components/ からサーバ専用処理を import しない）、
// 第 3 群（クライアント SDK の使用箇所の限定）、process.env の直接参照の禁止、proxy.ts から firebase-admin を import しない（09 §6.4 の 5）。
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const PURE_LIB_RESTRICTED = {
  paths: [
    { name: "next", message: "lib/scoring・lib/masters は Next.js に依存しない（00 §3.3）" },
    { name: "react", message: "lib/scoring・lib/masters は React に依存しない（00 §3.3）" },
    { name: "firebase", message: "lib/scoring・lib/masters は Firebase に依存しない（00 §3.3）" },
    {
      name: "firebase-admin",
      message: "lib/scoring・lib/masters は Firebase に依存しない（00 §3.3）",
    },
  ],
  patterns: [
    {
      group: [
        "next/*",
        "react/*",
        "react-dom",
        "firebase/*",
        "firebase-admin/*",
        "@anthropic-ai/*",
        "@/lib/db",
        "@/lib/db/*",
        "@/lib/firebase",
        "@/lib/firebase/*",
        "@/lib/auth",
        "@/lib/auth/*",
        "@/lib/services",
        "@/lib/services/*",
        "@/lib/ai",
        "@/lib/ai/*",
        "@/lib/pdf",
        "@/lib/pdf/*",
      ],
      message: "lib/scoring・lib/masters は純粋な TypeScript に保つ（01 §3.5 第 1 群）",
    },
  ],
};

/** 第 2 群: app/・components/ から import してはならないサーバ専用モジュール（01 §3.5） */
const SERVER_ONLY_FOR_UI = [
  "firebase-admin",
  "firebase-admin/*",
  "@/lib/firebase/admin",
  "@/lib/db",
  "@/lib/db/*",
  "@anthropic-ai/*",
  "puppeteer-core",
  "@sparticuz/chromium",
];
const SERVER_ONLY_MESSAGE =
  "app/・components/ から Admin SDK・データアクセス層を直接 import しない。lib/services・lib/auth を経由する（01 §3.5 第 2 群）";

/** 第 3 群: クライアント SDK（01 §3.5）。firebase/firestore・firebase/storage はどこからも使わない（00 §2.5） */
const CLIENT_SDK_ALWAYS_FORBIDDEN = {
  group: ["firebase/firestore", "firebase/firestore/*", "firebase/storage", "firebase/storage/*"],
  message: "ブラウザから Firestore・Storage に直接アクセスしない（00 §2.5、01 §3.5 第 3 群）",
};
// パターンは gitignore 形式のため、スラッシュを含まない "firebase" は "@/lib/firebase/admin" にも一致してしまう。
// 素の "firebase" は paths で、サブパスは patterns で禁止する
const CLIENT_SDK_AUTH_MESSAGE =
  "クライアント SDK は lib/firebase/client.ts と components/admin/auth/** だけで使う（01 §3.5 第 3 群）";
const CLIENT_SDK_AUTH = {
  group: ["firebase/app", "firebase/auth", "firebase/auth/*"],
  message: CLIENT_SDK_AUTH_MESSAGE,
};
const CLIENT_SDK_ROOT = [{ name: "firebase", message: CLIENT_SDK_AUTH_MESSAGE }];

const PROCESS_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message:
    "process.env は lib/utils/env.ts の serverEnv() / firebaseAdminEnv() / publicEnv() 経由で読む（01 §4.3）",
};

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**", ".next/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "error",
    },
  },
  {
    // 第 3 群の既定（すべてのファイル）。例外は下の lib/firebase/client.ts と components/admin/auth/**
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: CLIENT_SDK_ROOT, patterns: [CLIENT_SDK_ALWAYS_FORBIDDEN, CLIENT_SDK_AUTH] },
      ],
      "no-restricted-syntax": ["error", PROCESS_ENV],
    },
  },
  {
    files: ["lib/scoring/**", "lib/masters/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...PURE_LIB_RESTRICTED,
          patterns: [...PURE_LIB_RESTRICTED.patterns, CLIENT_SDK_ALWAYS_FORBIDDEN],
        },
      ],
    },
  },
  {
    files: ["app/**", "components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: CLIENT_SDK_ROOT,
          patterns: [
            { group: SERVER_ONLY_FOR_UI, message: SERVER_ONLY_MESSAGE },
            CLIENT_SDK_ALWAYS_FORBIDDEN,
            CLIENT_SDK_AUTH,
          ],
        },
      ],
    },
  },
  {
    files: ["components/admin/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: SERVER_ONLY_FOR_UI, message: SERVER_ONLY_MESSAGE },
            CLIENT_SDK_ALWAYS_FORBIDDEN,
          ],
        },
      ],
    },
  },
  {
    files: ["lib/firebase/client.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [CLIENT_SDK_ALWAYS_FORBIDDEN] }] },
  },
  {
    // proxy.ts はセッション Cookie の有無だけを見る。Admin SDK と、それに依存するモジュールを import しない（09 §6.4 の 5）
    files: ["proxy.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "firebase-admin",
                "firebase-admin/*",
                "@/lib/firebase/*",
                "@/lib/db",
                "@/lib/db/*",
                "@/lib/auth",
                "@/lib/auth/*",
                "@/lib/services",
                "@/lib/services/*",
              ],
              message:
                "proxy.ts は Cookie の有無だけを見る。Admin SDK に依存するモジュールを import しない（01 §5.5）",
            },
            CLIENT_SDK_ALWAYS_FORBIDDEN,
            CLIENT_SDK_AUTH,
          ],
          paths: CLIENT_SDK_ROOT,
        },
      ],
    },
  },
  {
    // process.env の直接参照の例外（01 §3.5）: 環境変数の読み出し口、運用スクリプト、proxy（Cookie 名の既定値のみ）、ビルド・テスト設定
    files: [
      "lib/utils/env.ts",
      "scripts/**",
      "proxy.ts",
      "next.config.ts",
      "vitest.config.ts",
      "tests/**",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // I-01（セキュリティルールの全拒否）はクライアント SDK の Firestore でルールを評価させる唯一のテスト
    files: ["tests/integration/firestore/rules.test.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // 構造化ログの唯一の出口（01 §8.6）
    files: ["lib/utils/logger.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  {
    // noUncheckedIndexedAccess 下で、テストと生成スクリプトでは存在が自明な要素への ! を許可する
    files: ["scripts/**", "tests/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
