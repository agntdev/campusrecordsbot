import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { getStudent, mappingFor } from "../student-data.js";

registerMainMenuItem({ label: "View my record", data: "view_record:start", order: 50 });
const composer = new Composer<Ctx>();

composer.callbackQuery("view_record:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const mapping = await mappingFor(ctx);
  if (!mapping?.verified) return void await ctx.reply("Link your account before viewing your record.");
  const student = await getStudent(ctx, mapping.student_id);
  if (!student) return void await ctx.reply("Your linked record is unavailable. Contact your institution.");
  await ctx.reply(`Your record\nName: ${student.name}\nProgram: ${student.program}\nStatus: ${student.status}\nContact: ${student.contact_info}\nPreferred contact: ${student.preferred_contact}`);
});

export default composer;
