// Chromium の起動（07 §9.8、§9.12）。Vercel では @sparticuz/chromium、ローカル・CI では PDF_CHROMIUM_EXECUTABLE_PATH
import type { Browser } from "puppeteer-core";

import { PdfGenerationError } from "./errors";
import { isVercel, serverEnv } from "@/lib/utils/env";

/** 起動の上限（コールドスタートを含む。07 §9.10） */
export const BROWSER_LAUNCH_TIMEOUT_MS = 15_000;

export async function launchBrowser(): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");
  try {
    if (isVercel()) {
      const { default: chromium } = await import("@sparticuz/chromium");
      return await puppeteer.launch({
        args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
        executablePath: await chromium.executablePath(),
        headless: "shell",
        timeout: BROWSER_LAUNCH_TIMEOUT_MS,
      });
    }
    const executablePath = serverEnv().PDF_CHROMIUM_EXECUTABLE_PATH;
    if (!executablePath) {
      throw new PdfGenerationError(
        "browser_launch_failed",
        "PDF_CHROMIUM_EXECUTABLE_PATH is not set",
      );
    }
    return await puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      timeout: BROWSER_LAUNCH_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof PdfGenerationError) throw error;
    // 起動時の例外に印刷用 URL（トークン）は含まれない。原因調査のため例外の message も残す（300 文字まで）
    const name = error instanceof Error ? error.constructor.name : typeof error;
    const message = error instanceof Error ? error.message.slice(0, 300) : "";
    throw new PdfGenerationError(
      "browser_launch_failed",
      `browser launch failed: ${name}${message ? ` ${message}` : ""}`,
    );
  }
}
