import { Collection, Message, MessageActionRow, MessageEmbed, Snowflake, TextChannel } from "discord.js";
import { constants } from "../configuration/config";

export function strEmbed(strings: TemplateStringsArray, color?: `#${string}`): MessageEmbed {
    const baseEmbed = new MessageEmbed().setDescription(strings.join(""));
    if (color) baseEmbed.setColor(color);
    return baseEmbed;
}

export const MessageTools = {
    async awaitMessage(userID: string, channel: TextChannel, timeMS: number): Promise<Message | null> {
        const filter = (m: Message) => m.author.id === userID;
        try {
            const collected = await channel.awaitMessages({ filter, max: 1, time: timeMS, errors: ["time"] });
            const awaitedMessage = collected.first();

            return awaitedMessage || null;
        } catch (e) {
            return null;
        }
    },

    /** Takes an array of buttons and places them into an array of Action Row components */
    allocateButtonsIntoRows<T extends MessageActionRow>(buttons: T["components"][number][]): T[] {
        const components: T[] = [];

        if (buttons.length > constants.ACTION_ROW_MAX_ITEMS * constants.MAX_ACTION_ROWS)
            throw new Error("Too many buttons");

        for (let i = 0; i < buttons.length; i += constants.ACTION_ROW_MAX_ITEMS) {
            const slicedButtons = buttons.slice(i, i + constants.ACTION_ROW_MAX_ITEMS);
            components.push(<T>{
                type: "ACTION_ROW",
                components: slicedButtons
            });
        }

        return components;
    },

    async fetchAllMessages(channel: TextChannel, num = Infinity): Promise<Collection<Snowflake, Message>> {
        const MAX_MESSAGES_FETCH = 100;
        let before: Snowflake | undefined = undefined;

        let allMessages: Collection<Snowflake, Message> = new Collection();

        while (allMessages.size < num) {
            const previousSize = allMessages.size;
            const msgs: Collection<Snowflake, Message> = await channel.messages.fetch({ limit: MAX_MESSAGES_FETCH, before }); // prettier-ignore
            allMessages = allMessages.concat(msgs);

            if (allMessages.size === previousSize) break; // No new messages

            before = msgs.last()?.id;
        }

        return allMessages;
    }
};
