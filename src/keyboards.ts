import type { InlineKeyboardButton, InlineKeyboardMarkup } from "./types";

export const BUSINESS_TYPE_OPTIONS = [
  { value: "ecommerce", label: "🏪 E-commerce" },
  { value: "agency", label: "🤝 Agency / services" },
  { value: "saas", label: "🧩 SaaS / product" },
] as const;

export const REQUEST_TYPE_OPTIONS = [
  { value: "recruiting", label: "👥 Hiring / recruiting" },
  { value: "consulting", label: "💡 Consulting" },
  { value: "partnership", label: "🔗 Partnership" },
] as const;

export function businessTypeKeyboard(): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = BUSINESS_TYPE_OPTIONS.map((o) => [
    { text: o.label, callback_data: `q1:${o.value}` },
  ]);
  rows.push([{ text: "✏️ Other…", callback_data: "q1:other" }]);
  return { inline_keyboard: rows };
}

export function requestTypeKeyboard(): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = REQUEST_TYPE_OPTIONS.map((o) => [
    { text: o.label, callback_data: `q2:${o.value}` },
  ]);
  rows.push([{ text: "✏️ Other…", callback_data: "q2:other" }]);
  return { inline_keyboard: rows };
}

export function businessTypeLabel(value: string): string {
  return BUSINESS_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function requestTypeLabel(value: string): string {
  return REQUEST_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}