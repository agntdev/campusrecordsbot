import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { addAdmin, listAdmins } from "../student-data.js";
import { clearFlow, flow, prompt } from "../student-flow.js";

registerMainMenuItem({ label: "Manage staff", data: "manage_admins:start", order: 35 });
const composer = new Composer<Ctx>();

composer.callbackQuery("manage_admins:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx as never))) return;
  const admins = await listAdmins(ctx);
  clearFlow(ctx); flow(ctx).step = "admins:add";
  await ctx.reply(`${admins.length ? "Additional staff access is configured." : "No additional staff access yet."}\nEnter a staff chat ID to grant record-management access. This does not send them a message.`, prompt("Enter a staff chat ID.", "Telegram chat ID"));
});

composer.on("message:text", async (ctx, next) => {
  if (flow(ctx).step !== "admins:add") return next();
  if (!(await requireOwner(ctx as never))) return;
  const id = ctx.message.text.trim();
  if (!/^-?\d{4,20}$/.test(id)) return void await ctx.reply("Enter a valid numeric Telegram chat ID.");
  await addAdmin(ctx, id); clearFlow(ctx);
  await ctx.reply("Staff access has been added. They can open the bot and use the staff menu.");
});

export default composer;
