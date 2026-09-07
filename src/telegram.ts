import type { ForumTopic, InlineKeyboardMarkup, Message, MessageId, User } from "./types";

const TG_API = "https://api.telegram.org";

export class Telegram {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${TG_API}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const body = (await res.json()) as { ok: boolean; description?: string; result: T };
    if (!res.ok || !body.ok) {
      throw new Error(`Telegram ${method} failed: ${body.description || `HTTP ${res.status}`}`);
    }
    return body.result;
  }

  getMe(): Promise<User> {
    return this.call<User>("getMe");
  }

  sendMessage(params: {
    chat_id: number | string;
    text: string;
    parse_mode?: "HTML";
    reply_markup?: InlineKeyboardMarkup;
    message_thread_id?: number;
    disable_web_page_preview?: boolean;
  }): Promise<Message> {
    return this.call<Message>("sendMessage", params);
  }

  answerCallbackQuery(params: {
    callback_query_id: string;
    text?: string;
    show_alert?: boolean;
  }): Promise<boolean> {
    return this.call<boolean>("answerCallbackQuery", params);
  }

  editMessageReplyMarkup(params: {
    chat_id?: number | string;
    message_id?: number;
    reply_markup?: InlineKeyboardMarkup;
  }): Promise<Message | boolean> {
    return this.call<Message | boolean>("editMessageReplyMarkup", params);
  }

  createForumTopic(params: {
    chat_id: number | string;
    name: string;
    icon_color?: number;
  }): Promise<ForumTopic> {
    return this.call<ForumTopic>("createForumTopic", params);
  }

  copyMessage(params: {
    chat_id: number | string;
    from_chat_id: number | string;
    message_id: number;
    message_thread_id?: number;
    caption?: string;
  }): Promise<MessageId> {
    return this.call<MessageId>("copyMessage", params);
  }

  deleteMessage(params: { chat_id: number | string; message_id: number }): Promise<boolean> {
    return this.call<boolean>("deleteMessage", params);
  }
}