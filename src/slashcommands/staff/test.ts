import { SlashCommand } from "../../structures/EntrypointSlashCommand";

const command = new SlashCommand(<const>{
    description: "Test command",
    options: [
        {
            name: "user",
            description: "User",
            required: false,
            type: "USER"
        }
    ]
});

command.setHandler(async (ctx) => {
    await ctx.send({ content: "Hello" });
});

export default command;
