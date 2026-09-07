# tgcrm

A Telegram mini-CRM built entirely on the Cloudflare free tier: [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Cloudflare D1](https://developers.cloudflare.com/d1/).

The bot is the public webhook endpoint. A lead comes in via a deep link, answers two qualification questions, and lands as its own forum topic in an admin supergroup. Messages are relayed both ways: lead → topic, and admin reply → lead.

## Architecture

```text
Website / LinkedIn / ads
          │
          │ t.me/your_bot?start=website
          ▼
     Telegram Bot
          │
          │ HTTPS webhook POST
          │ (X-Telegram-Bot-Api-Secret-Token)
          ▼
Cloudflare Worker                Cloudflare D1 (SQLite)
  ├─ validates secret token      ├─ leads (chat_id ↔ topic_id)
  ├─ /start + inline callbacks   └─ lead_drafts (free-text "Other")
  ├─ qualification Q1/Q2
  ├─ creates forum topics
  └─ relays messages both ways
          │
          ▼
Telegram admin supergroup
  └─ one forum topic per lead
```

![Container diagram](http://www.plantuml.com/plantuml/proxy?cache=no&src=https://raw.githubusercontent.com/msfs11/tgcrm/main/sequence.puml)

Design choices:

- **Worker, not Yandex Cloud Functions.** The Worker is the Telegram webhook endpoint directly — there is no forwarding layer. It stays a fast orchestration layer: parse the update, run 1–2 indexed D1 reads/writes, call the Bot API with `fetch()`, return `200`.
- **D1, not KV.** D1 gives transactional SQL and free allowances of 100,000 rows written and 5 million rows read per day — far above KV’s 1,000 writes/day, which is also eventually consistent. KV has no role here. [pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Conversation flow

1. Lead taps `t.me/<bot>?start=website` → bot sends **Q1** (business type) as inline buttons, plus “Other…”.
2. Q1 callback `q1:<value>` is saved to a draft; bot sends **Q2** (request type) inline buttons plus “Other…”.
3. If the lead picks “Other…”, `lead_drafts.awaiting` is set and the free text is stored as the answer.
4. Q2 callback `q2:<value>` (or typed text) **finalizes** the lead:
   - no second topic if the lead already exists,
   - `createForumTopic` in the admin supergroup,
   - `INSERT` into `leads`,
   - lead card message in the topic,
   - draft row deleted.

This keeps the normal path stateless — a row is written only when a lead is finalised (or while collecting free-text “Other” answers).

## Relay rules

Same two-way model as the reference article, with the sender restricted to the admin:

```text
Lead private message  → copyMessage to admin topic     (message_thread_id = topic_id)
Admin reply in topic  → copyMessage to lead            (only from.id == ADMIN_USER_ID)
```

Any other group member posting in a topic is ignored. The bot’s own copied messages are skipped (`from.is_bot`). Telegram retries are handled by making finalization idempotent: `user_chat_id` is `UNIQUE`, a lead with `topic_id` already set gets the “already submitted” reply instead of a second topic.

## What goes into D1

```sql
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_chat_id TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  source TEXT,
  business_type TEXT,
  request_type TEXT,
  topic_id INTEGER UNIQUE,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_leads_topic_id ON leads(topic_id);

CREATE TABLE lead_drafts (
  user_chat_id TEXT PRIMARY KEY,
  source TEXT,
  business_type TEXT,
  request_type TEXT,
  awaiting TEXT,                -- NULL | 'business_type' | 'request_type'
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Only two lookups are used during relay:

```sql
SELECT topic_id      FROM leads WHERE user_chat_id = ?;   -- lead → admin topic
SELECT user_chat_id  FROM leads WHERE topic_id     = ?;   -- admin reply → lead
```

## Project structure

```text
tgcrm/
├── wrangler.jsonc              Worker config, D1 binding "DB"
├── migrations/0000_init.sql    leads + lead_drafts
├── src/
│   ├── index.ts                fetch handler: secret check, routing, 200 OK
│   ├── handlers.ts             /start, callbacks, finalize, relay
│   ├── telegram.ts             minimal fetch-based Bot API wrapper
│   ├── leads.ts                D1 queries (idempotent finalization)
│   ├── keyboards.ts            inline keyboards for Q1/Q2
│   ├── types.ts                Telegram update types
│   └── env.d.ts                secret names for the Env type
├── scripts/set-webhook.mjs     registers the webhook with secret_token
└── sequence.puml               PlantUML sequence diagram
```

## Secrets

Stored as Cloudflare Worker secrets (and in `.dev.vars` for local dev). Never in source code:

```bash
npx wrangler secret put BOT_TOKEN                # from @BotFather
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET  # random string for header validation
npx wrangler secret put ADMIN_GROUP_ID           # forum-enabled supergroup (e.g. -100...)
npx wrangler secret put ADMIN_USER_ID            # Telegram id allowed to reply to leads
```

## Commands

```bash
npm install

# Database
npx wrangler d1 create tgcrm-db                  # once; returns a database_id
npx wrangler d1 migrations apply tgcrm-db --local
npx wrangler d1 migrations apply tgcrm-db --remote

# Types (regenerates worker-configuration.d.ts)
npx wrangler types

# Deploy / develop
npm run dev                                      # wrangler dev (local, .dev.vars)
npx wrangler deploy
npx wrangler tail                                # live logs

# Register webhook (after deploy)
node scripts/set-webhook.mjs https://tgcrm.<subdomain>.workers.dev
```

## Free-tier fit

| Resource | Cloudflare free allowance | Expected mini-CRM usage | Assessment |
|---|---:|---:|---|
| Worker requests | 100,000 per day | One per Telegram update | Safe. [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| D1 reads | 5 million rows per day | 1–2 indexed reads per relayed message | Far beyond this use case. [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| D1 writes | 100,000 rows per day | New lead, topic mapping, status changes | Far beyond this use case. [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| D1 storage | 5 GB total | A few rows per lead | Negligible. [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| D1 databases | 10 per account | One | Safe. [limits](https://developers.cloudflare.com/d1/platform/limits/) |

Even 20 leads/month × 100 updates each is only ~2,000 Worker requests per month — well below the daily Worker allowance.

## Implementation constraints

- **Keep the webhook handler short.** Verify the secret header, parse the update, do D1 lookups, call the Bot API, return `200`. No LLM calls, file parsing, or external enrichment in the synchronous path — those belong in [Queues](https://developers.cloudflare.com/queues/) later.
- **Protect the endpoint.** The Worker compares `X-Telegram-Bot-Api-Secret-Token` with `TELEGRAM_WEBHOOK_SECRET` (constant-time) before accepting an update.
- **Handle duplicate deliveries.** Telegram retries on non-2xx. `user_chat_id` is `UNIQUE`; the finalize path checks for an existing `topic_id` and never creates a second topic.
- **Workers CPU budget is small**, so the bot is deliberately dependency-free — plain TypeScript with native `fetch()` and the D1 binding.

## Bottom line

A Cloudflare-only implementation removes the Worker → Yandex Function forwarding hop entirely: one public webhook endpoint, one control plane for code/secrets/logs/data, and D1 as the system of record for chat/topic mappings. The free tier comfortably covers a solo founder’s or small team’s lead volume. Keep the Worker fast; push any heavyweight CV/LLM work to an async design later.