declare global {
  // Extended with secrets not declared in wrangler.jsonc.
  interface Env {
    BOT_TOKEN: string;
    TELEGRAM_WEBHOOK_SECRET: string;
    ADMIN_GROUP_ID: string;
    ADMIN_USER_ID: string;
  }
}

export {};