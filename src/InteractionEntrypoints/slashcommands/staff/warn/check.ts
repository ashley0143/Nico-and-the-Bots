import { Embed } from "discord.js/packages/discord.js";
import R from "ramda";
import { CommandError } from "../../../../Configuration/definitions";
import F from "../../../../Helpers/funcs";
import { prisma } from "../../../../Helpers/prisma-init";
import { SlashCommand } from "../../../../Structures/EntrypointSlashCommand";

const command = new SlashCommand(<const>{
    description: "Test command",
    options: [
        { name: "user", description: "The user to check warns for", required: true, type: "USER" },
        { name: "page", description: "Warning page number", required: false, type: "INTEGER" }
    ]
});

command.setHandler(async (ctx) => {
    await ctx.deferReply();

    const member = await ctx.guild.members.fetch(ctx.opts.user);
    if (!member) throw new CommandError("Unable to find that user");

    const page = ctx.opts.page ?? 1;
    const take = 10;
    const skip = (page - 1) * take;

    if (typeof page !== "number" || page < 1) throw new CommandError("Invalid page number.");

    const warnCount = await prisma.warning.count({ where: { warnedUserId: ctx.opts.user } });
    const numPages = Math.ceil(warnCount / take);

    if (warnCount === 0) throw new CommandError("This user does not have any warnings.");

    const warns = await prisma.warning.findMany({
        where: { warnedUserId: ctx.opts.user },
        orderBy: { createdAt: "desc" },
        skip,
        take
    });

    if (warns.length === 0) throw new CommandError(`This page does not exist. There are ${numPages} pages available.`);

    const severityEmoji = (s: number) => {
        return ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"][s - 1] || "❓";
    };

    const averageSeverity = R.mean(warns.map((w) => w.severity || 5));

    const embed = new Embed()
        .setAuthor(`${member.displayName}'s warnings`, member.user.displayAvatarURL())
        .setColor([(255 * averageSeverity) / 10, 0, 0])
        .setFooter(`Page ${page}/${numPages}`);
    for (const warn of warns) {
        const emoji = severityEmoji(warn.severity);
        const timestamp = F.discordTimestamp(warn.createdAt, "relative");
        embed.addField(`${warn.reason}`, `${emoji} ${warn.type}\n${timestamp}`);
    }

    await ctx.editReply({ embeds: [embed] });
});

export default command;
