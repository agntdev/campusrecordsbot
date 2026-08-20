import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { diffText, getStudent, mappingFor, notifyAdmin, updateStudent } from "../student-data.js";
import { clearFlow, flow, prompt } from "../student-flow.js";

registerMainMenuItem({ label: "Update contact", data: "update_contact:start", order: 60 });
const composer = new Composer<Ctx>();

composer.callbackQuery("update_contact:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const mapping = await mappingFor(ctx);
  if (!mapping?.verified) return void await ctx.reply("Link your account before updating contact information.");
  clearFlow(ctx); flow(ctx).step = "contact:value"; flow(ctx).studentId = mapping.student_id;
  await ctx.reply("Enter your new contact information.", prompt("Enter your email or phone number.", "Email or phone number"));
});

composer.on("message:text", async (ctx, next) => {
  const state = flow(ctx); if (state.step !== "contact:value") return next();
  const value = ctx.message.text.trim();
  if (value.length < 3 || value.length > 160) return void await ctx.reply("Enter a valid email address or phone number.");
  state.contact = value; state.step = "contact:method";
  await ctx.reply("Choose how you prefer to be contacted.", { reply_markup: inlineKeyboard([[inlineButton("Email", "update_contact:method:Email"), inlineButton("Phone", "update_contact:method:Phone")], [inlineButton("Telegram", "update_contact:method:Telegram")]]) });
});

composer.callbackQuery(/^update_contact:method:(Email|Phone|Telegram)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const state = flow(ctx);
  if (state.step !== "contact:method" || !state.studentId || !state.contact) return void await ctx.reply("Start the contact update again from the menu.");
  const mapping = await mappingFor(ctx); if (!mapping?.verified || mapping.student_id !== state.studentId) return void await ctx.reply("Link your account before updating contact information.");
  const record = await updateStudent(ctx, state.studentId, { contact_info: state.contact, preferred_contact: ctx.match[1] }, "contact_update"); clearFlow(ctx);
  if (!record) return void await ctx.reply("Your record is unavailable. Contact your institution.");
  const notified = await notifyAdmin(ctx, diffText(record, "Contact information changed; approval notification requested"));
  await ctx.reply(notified ? "Your contact information was updated. Your institution has been notified." : "Your contact information was updated. Notifications aren't set up yet.");
});

export default composer;
