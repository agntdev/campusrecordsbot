import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { getStudent, linkStudent, mappingFor } from "../student-data.js";
import { clearFlow, flow, prompt } from "../student-flow.js";

registerMainMenuItem({ label: "Link account", data: "link_account:start", order: 40 });
const composer = new Composer<Ctx>();

composer.callbackQuery("link_account:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if ((await mappingFor(ctx))?.verified) return void await ctx.reply("Your account is already linked.");
  clearFlow(ctx); flow(ctx).step = "link:id";
  await ctx.reply("Enter your student ID.", prompt("Enter your student ID.", "Student ID"));
});

composer.on("message:text", async (ctx, next) => {
  const state = flow(ctx); const text = ctx.message.text.trim();
  if (state.step === "link:id") {
    const student = await getStudent(ctx, text);
    if (!student) return void await ctx.reply("We couldn't find that student ID. Check it and try again.");
    state.studentId = student.student_id; state.step = "link:code";
    return void await ctx.reply("Enter the one-time verification code from your institution.", prompt("Enter the verification code.", "Verification code"));
  }
  if (state.step === "link:code") {
    const result = await linkStudent(ctx, state.studentId ?? "", text); clearFlow(ctx);
    if (result === "linked") return void await ctx.reply("Your account is linked. You can now view your record.");
    if (result === "used") return void await ctx.reply("This Telegram account is already linked to a student record.");
    return void await ctx.reply("That verification code isn't valid. Check it with your institution and try again.");
  }
  return next();
});

export default composer;
