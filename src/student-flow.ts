import type { Ctx } from "./bot.js";
import { inlineButton, inlineKeyboard } from "./toolkit/index.js";
import { isAdmin } from "./student-data.js";

export interface FlowState {
  step?: string;
  studentId?: string;
  name?: string;
  program?: string;
  status?: "Active" | "Exit Exam" | "Graduating";
  dates?: string;
  code?: string;
  contact?: string;
  method?: string;
  field?: string;
}

export const flow = (ctx: Ctx): FlowState => ctx.session as FlowState;
export const clearFlow = (ctx: Ctx): void => { const value = flow(ctx); for (const key of Object.keys(value)) delete (value as Record<string, unknown>)[key]; };
export const prompt = (_text: string, placeholder: string) => ({ reply_markup: { force_reply: true as const, input_field_placeholder: placeholder } });
export const back = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);

export async function requireAdmin(ctx: Ctx): Promise<boolean> {
  if (await isAdmin(ctx)) return true;
  await ctx.answerCallbackQuery({ text: "Only authorised staff can do that.", show_alert: true });
  await ctx.reply("Only authorised staff can manage student records.");
  return false;
}

export const statusKeyboard = (prefix: string) => inlineKeyboard([
  [inlineButton("Active", `${prefix}:Active`), inlineButton("Exit Exam", `${prefix}:Exit Exam`)],
  [inlineButton("Graduating", `${prefix}:Graduating`)],
]);
