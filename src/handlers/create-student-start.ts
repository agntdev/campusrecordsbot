import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { createStudent, diffText, notifyAdmin } from "../student-data.js";
import { clearFlow, flow, prompt, requireAdmin, statusKeyboard } from "../student-flow.js";

registerMainMenuItem({ label: "Create student", data: "create_student:start", order: 10 });
const composer = new Composer<Ctx>();

composer.callbackQuery("create_student:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  clearFlow(ctx); flow(ctx).step = "create:id";
  await ctx.reply("Enter the student ID.", prompt("Enter the student ID.", "For example: STU-1024"));
});

composer.on("message:text", async (ctx, next) => {
  const state = flow(ctx); const text = ctx.message.text.trim();
  if (!state.step?.startsWith("create:")) return next();
  if (!(await requireAdmin(ctx))) return;
  if (state.step === "create:id") {
    if (!/^[A-Za-z0-9-]{2,32}$/.test(text)) return void await ctx.reply("That student ID isn't valid. Use letters, numbers, or hyphens.");
    state.studentId = text; state.step = "create:name";
    return void await ctx.reply("Enter the student's full name.", prompt("Enter the student's full name.", "Full name"));
  }
  if (state.step === "create:name") {
    if (text.length < 2 || text.length > 100) return void await ctx.reply("Enter a name between 2 and 100 characters.");
    state.name = text; state.step = "create:program";
    return void await ctx.reply("Enter the academic program.", prompt("Enter the academic program.", "Program"));
  }
  if (state.step === "create:program") {
    if (!text || text.length > 100) return void await ctx.reply("Enter a program name up to 100 characters.");
    state.program = text; state.step = "create:dates";
    return void await ctx.reply("Enter the enrollment dates.", prompt("Enter the enrollment dates.", "For example: Sep 2026 – Jun 2029"));
  }
  if (state.step === "create:dates") {
    if (!text || text.length > 100) return void await ctx.reply("Enter the enrollment dates so staff can recognise the record.");
    state.dates = text; state.step = "create:code";
    return void await ctx.reply("Set a one-time verification code for the student.", prompt("Set a one-time verification code for the student.", "Verification code"));
  }
  if (state.step === "create:code") {
    if (text.length < 4 || text.length > 32) return void await ctx.reply("Use a verification code between 4 and 32 characters.");
    state.code = text; state.step = "create:status";
    return void await ctx.reply("Choose the student's status.", { reply_markup: statusKeyboard("create_student:status") });
  }
});

composer.callbackQuery(/^create_student:status:(Active|Exit Exam|Graduating)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  const state = flow(ctx);
  if (state.step !== "create:status" || !state.studentId || !state.name || !state.program || !state.dates || !state.code) return void await ctx.reply("That form has expired. Tap Create student to begin again.");
  const record = await createStudent(ctx, { student_id: state.studentId, name: state.name, program: state.program, enrollment_dates: state.dates, verification_code: state.code, status: ctx.match[1] as "Active" | "Exit Exam" | "Graduating", contact_info: "Not provided", preferred_contact: "Not provided", exam_results: "Not recorded", graduation_clearance: "Not recorded", notes: "" });
  clearFlow(ctx);
  if (record === "exists") return void await ctx.reply("A student with that ID already exists. Use Edit student to update it.");
  const notified = await notifyAdmin(ctx, diffText(record, "Created"));
  await ctx.reply(notified ? `Student record created for ${record.name}.` : `Student record created for ${record.name}. Notifications aren't set up yet.`);
});

export default composer;
