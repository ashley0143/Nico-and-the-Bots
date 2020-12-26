import { CommandMessage } from "configuration/definitions";
import { APIMessageContentResolvable, GuildMember, Message, MessageEmbed, TextChannel, User } from "discord.js";

export interface TimedMessage {
    // The thing to send
    content: APIMessageContentResolvable | MessageEmbed;
    // Time to wait before sending this message (in ms)
    waitBefore: number;
}

export const MessageTools = {
    async getMentionedMember(msg: CommandMessage): Promise<GuildMember | null> {
        const user = this.getMentionedUser(msg);
        if (!user) return null;

        const member = await msg.guild.members.fetch(user.id).catch(() => null);
        return member;
    },
    getMentionedUser(msg: Message): User | null {
        const user = msg.mentions?.users?.first() || null;
        return user;
    },
    textEmbed(text: string, color?: string | null): MessageEmbed {
        const embed = new MessageEmbed();
        embed.setDescription(text);
        embed.setColor(color || "RANDOM");
        return embed;
    },
    async timeMessages(channel: TextChannel, msgs: TimedMessage[], sendSeparate = false): Promise<void> {
        let prevMessage = (undefined as unknown) as Message;
        for (const msg of msgs) {
            await new Promise((resolve) => setTimeout(resolve, msg.waitBefore));
            if (sendSeparate || !prevMessage) {
                prevMessage = await channel.send(msg.content);
            } else {
                prevMessage.edit(msg.content);
            }
        }
    },
    async awaitMessage(msg: Message, timeMS: number): Promise<Message | null> {
        const filter = (m: Message) => m.author.id === msg.author.id;
        try {
            const collected = await msg.channel.awaitMessages(filter, { max: 1, time: timeMS, errors: ["time"] });
            const awaitedMessage = collected.first();

            return awaitedMessage || null;
        } catch (e) {
            return null;
        }
    }
};
