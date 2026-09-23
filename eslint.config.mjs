// 01 §3.5 の Lint 規則。M1 では lib/scoring・lib/masters・lib/presentation・scripts・tests が対象。
// 第 2 群・第 3 群（app/・components/ の import 制限）と process.env の直接参照禁止は M2 で Next.js 導入時に追加する。
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

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**", ".next/**"] },
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
    files: ["lib/scoring/**", "lib/masters/**"],
    rules: { "no-restricted-imports": ["error", PURE_LIB_RESTRICTED] },
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
