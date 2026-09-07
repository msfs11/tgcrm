export interface Update {
  update_id: number;
  message?: Message;
  callback_query?: CallbackQuery;
}

export interface Message {
  message_id: number;
  message_thread_id?: number;
  from?: User;
  chat: Chat;
  sender_chat?: unknown;
  date: number;
  text?: string;
  caption?: string;
  photo?: unknown[];
  video?: unknown;
  document?: unknown;
  audio?: unknown;
  animation?: unknown;
  sticker?: unknown;
  voice?: unknown;
  video_note?: unknown;
  dice?: unknown;
  poll?: unknown;
  location?: unknown;
  contact?: unknown;
  venue?: unknown;
  game?: unknown;
  story?: unknown;
  new_chat_members?: User[];
  left_chat_member?: User;
}

export interface User {
  id: number;
  is_bot: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface Chat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  chat_instance: string;
  data?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ForumTopic {
  message_thread_id: number;
  name: string;
  icon_color: number;
  icon_custom_emoji_id?: string;
}

export interface MessageId {
  message_id: number;
}