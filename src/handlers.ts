import type { CallbackQuery, Message, Update, User } from "./types";
import { Telegram } from "./telegram";
import {
  businessTypeKeyboard,
  businessTypeLabel,
  requestTypeKeyboard,
  requestTypeLabel,
} from "./keyboards";
import { deleteDraft, getDraft, getLeadByTopic, getLeadByUserChat, insertLead, upsertDraft } from "./leads";

export async function handleUpdate(env: Env, tg: Telegram, update: Update): Promise<void> {
  const message = update.message;
  if (message) {
    if (message.from?.is_bot) return;
    await handleMessage(env, tg, message);
    return;
  }
  const callback = update.callback_query;
  if (callback) {
    await handleCallback(env, tg, callback);
  }
}

function isMessageContent(message: Message): boolean {
  return Boolean(
    message.text ||
      message.caption ||
      message.photo ||
      message.video ||
      message.document ||
      message.audio ||
      message.animation ||
      message.sticker ||
      message.voice ||
      message.video_note ||
      message.dice ||
      message.poll ||
      message.location ||
      message.contact ||
      message.venue ||
      message.game ||
      message.story
  );
}

function extractStartPayload(text: string): string | null {
  const rest = text.replace(/^\/start/, "");
  const payload = rest.replace(/^(?:\s+|\?)+/, "");
  return payload || null;
}

function displayName(user: User, fallback: string): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleMessage(env: Env, tg: Telegram, message: Message): Promise<void> {
  const chat = message.chat;

  if (chat.type === "private") {
    const userId = String(chat.id);

    if (message.text?.startsWith("/start")) {
      await handleStart(env, tg, message);
      return;
    }

    // Free-text "Other" answers while qualifying.
    const draft = await getDraft(env.DB, userId);
    if (draft?.awaiting && isMessageContent(message) && message.from) {
      const text = message.text ?? message.caption ?? "";
      if (!text) return;
      if (draft.awaiting === "business_type") {
        await upsertDraft(env.DB, {
          user_chat_id: userId,
          source: draft.source,
          business_type: text,
          request_type: null,
          awaiting: null,
        });
        await tg.sendMessage({
          chat_id: chat.id,
          text: "Got it. And what do you need from us?",
          reply_markup: requestTypeKeyboard(),
        });
      } else {
        await finalizeLead(env, tg, {
          userId,
          user: message.from,
          source: draft.source,
          businessType: draft.business_type ?? "—",
          requestType: text,
        });
      }
      return;
    }

    // Lead -> admin topic relay.
    const lead = await getLeadByUserChat(env.DB, userId);
    if (lead?.topic_id) {
      await tg.copyMessage({
        chat_id: env.ADMIN_GROUP_ID,
        from_chat_id: chat.id,
        message_id: message.message_id,
        message_thread_id: lead.topic_id,
      });
    }
    return;
  }

  // Admin reply in a lead topic -> relay back to the lead.
  if ((chat.type === "supergroup" || chat.type === "group") && String(chat.id) === env.ADMIN_GROUP_ID) {
    if (!message.message_thread_id || !isMessageContent(message)) return;
    if (!message.from || String(message.from.id) !== env.ADMIN_USER_ID) return;
    const lead = await getLeadByTopic(env.DB, message.message_thread_id);
    if (lead?.user_chat_id) {
      await tg.copyMessage({
        chat_id: lead.user_chat_id,
        from_chat_id: chat.id,
        message_id: message.message_id,
      });
    }
  }
}

async function handleStart(env: Env, tg: Telegram, message: Message): Promise<void> {
  const userId = String(message.chat.id);
  const existing = await getLeadByUserChat(env.DB, userId);
  if (existing?.topic_id) {
    await tg.sendMessage({
      chat_id: message.chat.id,
      text: "You already submitted a request. Our team will reply right here in this chat. ✅",
    });
    return;
  }
  const source = message.text ? extractStartPayload(message.text) : null;
  await upsertDraft(env.DB, {
    user_chat_id: userId,
    source,
    business_type: null,
    request_type: null,
    awaiting: null,
  });
  const name = message.from ? displayName(message.from, "") : "";
  await tg.sendMessage({
    chat_id: message.chat.id,
    text: `Welcome${name ? `, ${name}` : ""} 👋\nTell us a bit about your business so we can route your request.`,
    reply_markup: businessTypeKeyboard(),
  });
}

async function handleCallback(env: Env, tg: Telegram, callback: CallbackQuery): Promise<void> {
  const chat = callback.message?.chat;
  const userId = chat ? String(chat.id) : String(callback.from.id);
  const chatId = chat?.id ?? userId;
  const messageId = callback.message?.message_id;
  const data = callback.data ?? "";
  const match = /^(q1|q2|other|done):(.+)$/.exec(data);
  if (!match) {
    await tg.answerCallbackQuery({ callback_query_id: callback.id });
    return;
  }

  const [, kind, value] = match;
  const draft = await getDraft(env.DB, userId);
  const base = {
    user_chat_id: userId,
    source: draft?.source ?? null,
  };

  if (kind === "q1") {
    await upsertDraft(env.DB, {
      ...base,
      business_type: value,
      request_type: null,
      awaiting: null,
    });
    await tg.answerCallbackQuery({ callback_query_id: callback.id });
    await tg.editMessageReplyMarkup({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
    await tg.sendMessage({
      chat_id: chatId,
      text: "Great. And what do you need from us?",
      reply_markup: requestTypeKeyboard(),
    });
    return;
  }

  if (kind === "q2") {
    await tg.answerCallbackQuery({ callback_query_id: callback.id, text: "Submitting…" });
    await tg.editMessageReplyMarkup({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
    await finalizeLead(env, tg, {
      userId,
      user: callback.from,
      source: draft?.source ?? null,
      businessType: draft?.business_type ?? "—",
      requestType: value,
    });
    return;
  }

  if (kind === "other") {
    const awaiting = value === "business_type" ? "business_type" : "request_type";
    await upsertDraft(env.DB, {
      ...base,
      business_type: draft?.business_type ?? null,
      request_type: draft?.request_type ?? null,
      awaiting,
    });
    await tg.answerCallbackQuery({ callback_query_id: callback.id });
    const prompt =
      awaiting === "business_type"
        ? "✏️ Please type your business type (or describe it in a few words):"
        : "✏️ Please type your request details:";
    await tg.sendMessage({ chat_id: chatId, text: prompt });
  }
}

async function finalizeLead(
  env: Env,
  tg: Telegram,
  args: {
    userId: string;
    user: User;
    source: string | null;
    businessType: string;
    requestType: string;
  }
): Promise<void> {
  try {
    const existing = await getLeadByUserChat(env.DB, args.userId);
    if (existing?.topic_id) {
      await tg.sendMessage({
        chat_id: args.userId,
        text: "You already submitted a request. Our team will reply right here in this chat. ✅",
      });
      return;
    }

    const topic = await tg.createForumTopic({
      chat_id: env.ADMIN_GROUP_ID,
      name: `Lead ${displayName(args.user, args.userId)} · ${businessTypeLabel(args.businessType)}`.slice(0, 120),
    });

    try {
      await insertLead(env.DB, {
        user_chat_id: args.userId,
        telegram_user_id: String(args.user.id),
        username: args.user.username ?? null,
        first_name: args.user.first_name ?? null,
        last_name: args.user.last_name ?? null,
        source: args.source,
        business_type: args.businessType,
        request_type: args.requestType,
        topic_id: topic.message_thread_id,
      });
    } catch (err) {
      // Concurrent duplicate finalization: UNIQUE(user_chat_id) / UNIQUE(topic_id).
      // Keep the (possibly orphaned) topic; the lead already has one elsewhere.
      console.error("duplicate lead insert, ignoring", err);
      await deleteDraft(env.DB, args.userId);
      await tg.sendMessage({
        chat_id: args.userId,
        text: "You already submitted a request. Our team will reply right here in this chat. ✅",
      });
      return;
    }

    await deleteDraft(env.DB, args.userId);

    await tg.sendMessage({
      chat_id: env.ADMIN_GROUP_ID,
      message_thread_id: topic.message_thread_id,
      text: leadCardText(args),
      parse_mode: "HTML",
    });
    await tg.sendMessage({
      chat_id: args.userId,
      text: "Thanks! Your request has been received. Our team will reply right here in this chat. ✅",
    });
  } catch (err) {
    console.error("finalizeLead error:", err);
    await tg
      .sendMessage({
        chat_id: args.userId,
        text: "Something went wrong on our side. Please try again in a moment.",
      })
      .catch(() => undefined);
  }
}

function leadCardText(args: {
  userId: string;
  user: User;
  source: string | null;
  businessType: string;
  requestType: string;
}): string {
  const name = displayName(args.user, "—");
  const username = args.user.username ? `@${args.user.username}` : "—";
  return [
    "<b>🎯 New lead</b>",
    "",
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>Username:</b> ${escapeHtml(username)}`,
    `<b>Chat ID:</b> <code>${escapeHtml(args.userId)}</code>`,
    `<b>Source:</b> ${escapeHtml(args.source ?? "—")}`,
    `<b>Business:</b> ${escapeHtml(businessTypeLabel(args.businessType))}`,
    `<b>Request:</b> ${escapeHtml(requestTypeLabel(args.requestType))}`,
  ].join("\n");
}