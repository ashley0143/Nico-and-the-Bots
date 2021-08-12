import { CommandError } from "../../configuration/definitions";
import { MessageEmbed } from "discord.js";
import { prisma, queries } from "../../helpers/prisma-init";
import { SlashCommand } from "../../structures/EntrypointSlashCommand";

const command = new SlashCommand(<const>{
    description: "Gives the specified number of credits to the user",
    options: [
        { name: "user", description: "The user to give credits to", required: true, type: "USER" },
        {
            name: "credits",
            description: "The amount of credits to give",
            required: true,
            type: "INTEGER"
        }
    ]
});

command.setHandler(async (ctx) => {
    const { user, credits } = ctx.opts;
    await ctx.deferReply();

    const member = await ctx.member.guild.members.fetch(user);
    if (!member) throw new CommandError("Could not find that user");
    if (member.id === ctx.user.id) throw new CommandError("You cannot donate credits to yourself");

    // Ensure credits is a reasonable range
    if (Math.abs(credits) > 10_000) throw new CommandError("The number of credits must be between -10,000 and 10,000");

    const dbUser = await queries.findOrCreateUser(member.id);

    const beforeCredits = dbUser.credits;
    const newCredits = Math.max(0, dbUser.credits + credits);

    await prisma.user.update({ where: { id: member.id }, data: { credits: newCredits } });

    const embed = new MessageEmbed()
        .setAuthor(member.displayName, member.user.displayAvatarURL())
        .setTitle(`Given ${credits} credits`)
        .addField("Before", `${beforeCredits}`)
        .addField("After", `${newCredits}`);

    await ctx.send({ embeds: [embed] });
});

export default command;
