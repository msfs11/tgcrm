export interface LeadRow {
  id: number;
  user_chat_id: string;
  telegram_user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  source: string | null;
  business_type: string | null;
  request_type: string | null;
  topic_id: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DraftRow {
  user_chat_id: string;
  source: string | null;
  business_type: string | null;
  request_type: string | null;
  awaiting: string | null;
  updated_at: string;
}

export type Awaiting = "business_type" | "request_type";

export async function getLeadByUserChat(db: D1Database, userChatId: string): Promise<LeadRow | null> {
  return db.prepare("SELECT * FROM leads WHERE user_chat_id = ?").bind(userChatId).first<LeadRow>();
}

export async function getLeadByTopic(db: D1Database, topicId: number): Promise<LeadRow | null> {
  return db.prepare("SELECT * FROM leads WHERE topic_id = ?").bind(topicId).first<LeadRow>();
}

export async function getDraft(db: D1Database, userChatId: string): Promise<DraftRow | null> {
  return db.prepare("SELECT * FROM lead_drafts WHERE user_chat_id = ?").bind(userChatId).first<DraftRow>();
}

export async function upsertDraft(
  db: D1Database,
  draft: {
    user_chat_id: string;
    source: string | null;
    business_type: string | null;
    request_type: string | null;
    awaiting: Awaiting | null;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO lead_drafts (user_chat_id, source, business_type, request_type, awaiting, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_chat_id) DO UPDATE SET
         source = excluded.source,
         business_type = excluded.business_type,
         request_type = excluded.request_type,
         awaiting = excluded.awaiting,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      draft.user_chat_id,
      draft.source,
      draft.business_type,
      draft.request_type,
      draft.awaiting
    )
    .run();
}

export async function deleteDraft(db: D1Database, userChatId: string): Promise<void> {
  await db.prepare("DELETE FROM lead_drafts WHERE user_chat_id = ?").bind(userChatId).run();
}

export async function insertLead(
  db: D1Database,
  lead: Pick<
    LeadRow,
    | "user_chat_id"
    | "telegram_user_id"
    | "username"
    | "first_name"
    | "last_name"
    | "source"
    | "business_type"
    | "request_type"
    | "topic_id"
  >
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO leads
         (user_chat_id, telegram_user_id, username, first_name, last_name, source, business_type, request_type, topic_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`
    )
    .bind(
      lead.user_chat_id,
      lead.telegram_user_id,
      lead.username,
      lead.first_name,
      lead.last_name,
      lead.source,
      lead.business_type,
      lead.request_type,
      lead.topic_id
    )
    .run();
}