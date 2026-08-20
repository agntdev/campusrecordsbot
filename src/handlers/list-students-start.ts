import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { listStudents } from "../student-data.js";
import { requireAdmin, statusKeyboard } from "../student-flow.js";

registerMainMenuItem({ label: "List by status", data: "list_students:start", order: 30 });
const composer = new Composer<Ctx>();

composer.callbackQuery("list_students:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireAdmin(ctx))) return;
  await ctx.reply("Choose a student status.", { reply_markup: statusKeyboard("list_students:status") });
});

composer.callbackQuery(/^list_students:status:(Active|Exit Exam|Graduating)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireAdmin(ctx))) return;
  const status = ctx.match[1] as "Active" | "Exit Exam" | "Graduating";
  const students = await listStudents(ctx, status);
  if (!students.length) return void await ctx.reply(`No ${status.toLowerCase()} students yet.`);
  const lines = students.slice(0, 20).map((student) => `${student.name} — ${student.program}`);
  await ctx.reply(`${status} students:\n${lines.join("\n")}${students.length > 20 ? "\nMore records are available — narrow the list after editing." : ""}`);
});

export default composer;
