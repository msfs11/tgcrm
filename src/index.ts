import { handleUpdate } from "./handlers";
import { Telegram } from "./telegram";
import type { Update } from "./types";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("tgcrm webhook endpoint", { status: 200 });
    }
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }

    const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!safeEqual(received, env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = (await request.json()) as Update;
    const tg = new Telegram(env.BOT_TOKEN);
    await handleUpdate(env, tg, update).catch((err) => {
      console.error("webhook handler error:", err);
    });
    return new Response("OK", { status: 200 });
  },
} satisfies ExportedHandler<Env>;