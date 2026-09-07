// Registers the Telegram webhook for the bot.
//
// Usage:
//   node scripts/set-webhook.mjs <workers.dev-URL-or-custom-domain>
//
// Reads BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .dev.vars (or environment),
// registers https://<url>/webhook with a secret_token, and restricts
// allowed_updates to message + callback_query.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvVars() {
  const file = resolve(process.cwd(), ".dev.vars");
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const localVars = loadDotEnvVars();
const BOT_TOKEN = process.env.BOT_TOKEN ?? localVars.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? localVars.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.argv[2] ?? process.env.WORKER_URL;

if (!BOT_TOKEN || !WEBHOOK_SECRET || !baseUrl) {
  console.error(
    "Missing required input. Pass the worker URL and have BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET in .dev.vars.\n" +
      "  node scripts/set-webhook.mjs https://tgcrm.<subdomain>.workers.dev"
  );
  process.exit(1);
}

const url = `${baseUrl.replace(/\/+$/, "")}/webhook`;

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const body = await res.json();
console.log(body.ok ? `Webhook set: ${url}` : "Webhook registration failed:");
console.log(JSON.stringify(body, null, 2));
process.exit(body.ok ? 0 : 1);