import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { diffText, getStudent, notifyAdmin, updateStudent } from "../student-data.js";
import { clearFlow, flow, prompt, requireAdmin, statusKeyboard } from "../student-flow.js";

registerMainMenuItem({ label: "Edit student", data: "edit_student:start", order: 20 });
const composer = new Composer<Ctx>();

composer.callbackQuery("edit_student:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  clearFlow(ctx); flow(ctx).step = "edit:search";
  await ctx.reply("Enter the student ID to edit.", prompt("Enter the student ID to edit.", "Student ID"));
});

function fields() { return inlineKeyboard([[inlineButton("Name", "edit_student:field:name"), inlineButton("Program", "edit_student:field:program")], [inlineButton("Status", "edit_student:field:status"), inlineButton("Contact", "edit_student:field:contact_info")], [inlineButton("Notes", "edit_student:field:notes")]]); }

composer.on("message:text", async (ctx, next) => {
  const state = flow(ctx); const text = ctx.message.text.trim();
  if (!state.step?.startsWith("edit:")) return next();
  if (!(await requireAdmin(ctx))) return;
  if (state.step === "edit:search") {
    const record = await getStudent(ctx, text);
    if (!record) return void await ctx.reply("We couldn't find that student ID. Check it and try again.");
    state.studentId = record.student_id; state.step = "edit:field";
    return void await ctx.reply(`Editing ${record.name}. Choose a field.`, { reply_markup: fields() });
  }
  if (state.step === "edit:value" && state.studentId && state.field) {
    if (!text || text.length > 500) return void await ctx.reply("Enter a value up to 500 characters.");
    const record = await updateStudent(ctx, state.studentId, { [state.field]: text }, "staff_update"); clearFlow(ctx);
    if (!record) return void await ctx.reply("That record is no longer available. Search again.");
    const notified = await notifyAdmin(ctx, diffText(record, `${state.field} changed`));
    return void await ctx.reply(notified ? "Student record updated." : "Student record updated. Notifications aren't set up yet.");
  }
});

composer.callbackQuery(/^edit_student:field:(name|program|status|contact_info|notes)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireAdmin(ctx))) return;
  const state = flow(ctx); if (state.step !== "edit:field" || !state.studentId) return void await ctx.reply("Search for a student before choosing a field.");
  state.field = ctx.match[1];
  if (state.field === "status") { state.step = "edit:status"; return void await ctx.reply("Choose the new status.", { reply_markup: statusKeyboard("edit_student:status") }); }
  state.step = "edit:value";
  await ctx.reply(`Enter the new ${state.field === "contact_info" ? "contact information" : state.field}.`, prompt("Enter the new value.", "New value"));
});

composer.callbackQuery(/^edit_student:status:(Active|Exit Exam|Graduating)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireAdmin(ctx))) return;
  const state = flow(ctx); if (state.step !== "edit:status" || !state.studentId) return void await ctx.reply("Search for a student before changing the status.");
  const record = await updateStudent(ctx, state.studentId, { status: ctx.match[1] as "Active" | "Exit Exam" | "Graduating" }, "staff_update"); clearFlow(ctx);
  if (!record) return void await ctx.reply("That record is no longer available. Search again.");
  const notified = await notifyAdmin(ctx, diffText(record, "Status changed"));
  await ctx.reply(notified ? "Student record updated." : "Student record updated. Notifications aren't set up yet.");
});

export default composer;
