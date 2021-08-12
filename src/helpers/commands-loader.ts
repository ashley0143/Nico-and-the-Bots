/* eslint-disable @typescript-eslint/no-explicit-any */

import { ApplicationCommandData, Collection, Guild, GuildApplicationCommandPermissionData } from "discord.js";
import * as fs from "fs";
import { join, resolve, sep } from "path";
import { roles } from "../configuration/config";
import { ContextMenu } from "../structures/EntrypointContextMenu";
import { SlashCommand } from "../structures/EntrypointSlashCommand";
import { InteractionListener } from "../structures/ListenerInteraction";
import { ReactionListener } from "../structures/ListenerReaction";
import { SlashCommandData } from "../structures/SlashCommandOptions";

const slashCommandsBasePath = join(__dirname, "../slashcommands");
const contextMenusBasePath = join(__dirname, "../contextmenus");

async function readDirectory(path: string): Promise<string[]> {
    try {
        const directoryFiles = await fs.promises.readdir(path);
        return directoryFiles.map((fileOrFolder) => resolve(path, fileOrFolder)).filter((f) => !f.endsWith(".map"));
    } catch (e) {
        return [];
    }
}

/** There are three types of usable commands:
 * 1. Commands
 * 2. Command > Subcommand
 * 3. Command > Subcommand Group > Subcommand
 *
 * so the max nest level is 3
 */

// Step 1: Walk the file structure to extract SlashCommands and their path
type ParsedFile = {
    topName: string;
    depth: number;
    files: { name: string; subcommandName: string; command: SlashCommand }[];
};
async function parseCommandFolderStructure(): Promise<ParsedFile[]> {
    const parsedFiles: ParsedFile[] = [];
    let currentNodes = await readDirectory(slashCommandsBasePath);

    let maxDepth = 3;
    while (currentNodes.length !== 0 && maxDepth-- > 0) {
        const result = await Promise.all(
            currentNodes.map(async (path) => {
                const isDirectory = (await fs.promises.stat(path)).isDirectory();
                if (!isDirectory) {
                    const slashCommand = (await import(`file:///${path}`)).default.default;
                    if (!slashCommand || !(slashCommand instanceof SlashCommand)) return [];

                    const parts = path.split(sep).reverse();
                    const [name, parentName, grandparentName] = parts
                        .slice(0, 3 - maxDepth)
                        .map((p) => p.split(".")[0].trim());
                    const topName = grandparentName || parentName || name;
                    const subcommandName = grandparentName ? parentName : "";
                    const existingParsed = parsedFiles.find((p) => p.topName === topName);
                    slashCommand.commandIdentifier = [name, parentName, grandparentName].filter((n) => n).join(":");
                    if (existingParsed) existingParsed.files.push({ name, subcommandName, command: slashCommand });
                    else
                        parsedFiles.push({
                            topName,
                            depth: 3 - maxDepth,
                            files: [{ name, subcommandName, command: slashCommand }]
                        });
                    return [];
                } else return await readDirectory(path);
            })
        );
        currentNodes = result.flat();
    }

    return parsedFiles;
}

// Step 2: Construct the *actual* command data to be sent to Discord
async function generateCommandData(parsedFile: ParsedFile): Promise<[ApplicationCommandData, SlashCommand[]]> {
    const nestingDepth = parsedFile.depth as 1 | 2 | 3;
    if (nestingDepth === 1) {
        return [
            {
                ...parsedFile.files[0].command.commandData,
                name: parsedFile.files[0].name // Use file name for name
            },
            [parsedFile.files[0].command]
        ];
    }
    if (nestingDepth === 2) {
        return [
            {
                name: parsedFile.topName,
                description: parsedFile.topName,
                options: [
                    ...parsedFile.files.map(
                        (p) =>
                            <const>{
                                ...p.command.commandData,
                                type: "SUB_COMMAND",
                                name: p.name
                            }
                    )
                ],
                type: "CHAT_INPUT"
            },
            parsedFile.files.map((f) => f.command)
        ];
    }

    const commandData: SlashCommandData & { name: string; type: "CHAT_INPUT" } = {
        name: parsedFile.topName,
        description: parsedFile.topName,
        options: [],
        type: "CHAT_INPUT"
    };

    const subcommandsSet = new Set<string>();
    for (const file of parsedFile.files) subcommandsSet.add(file.subcommandName);
    const subcommands = [...subcommandsSet];

    const slashCommands: SlashCommand[] = [];

    for (const subcommand of subcommands) {
        const relevantCommands = parsedFile.files.filter((f) => f.subcommandName === subcommand);
        slashCommands.push(...relevantCommands.map((c) => c.command));
        commandData.options.push({
            name: subcommand,
            description: subcommand,
            type: "SUB_COMMAND_GROUP",
            options: [
                ...relevantCommands.map(
                    (p) =>
                        <const>{
                            ...p.command.commandData,
                            type: "SUB_COMMAND",
                            name: p.name
                        }
                )
            ]
        });
    }

    return [commandData, slashCommands];
}

// Step 2.5: Import all Context Menu handlers
async function generateContextMenuData(): Promise<ContextMenu<any>[]> {
    const nodes = await readDirectory(contextMenusBasePath);

    const result = await Promise.all(
        nodes.map(async (path) => {
            const contextMenu = (await import(`file:///${path}`)).default.default;
            return contextMenu;
        })
    );
    const contextMenus = result.filter((cm): cm is ContextMenu<any> => cm instanceof ContextMenu);

    return contextMenus;
}

// Step 3: Wrap it all up
export async function setupAllCommands(
    guild: Guild
): Promise<
    [
        Collection<string, SlashCommand<[]>>,
        Collection<string, ContextMenu<any>>,
        Collection<string, InteractionListener>,
        Collection<string, ReactionListener>
    ]
> {
    const parsedFiles = await parseCommandFolderStructure();
    const dataFromCommands: ApplicationCommandData[] = [];
    const allSlashCommands: SlashCommand[] = [];

    for (const file of parsedFiles) {
        const [commandData, slashCommands] = await generateCommandData(file);
        dataFromCommands.push(commandData);
        allSlashCommands.push(...slashCommands);
    }

    // Context Menus
    const contextMenus = await generateContextMenuData();
    const ctxMenuApplicationData = contextMenus.map((cm) => cm.commandData);

    // Set guild commands
    const applicationCommandData = [...dataFromCommands, ...ctxMenuApplicationData];
    await guild.commands.set([]);
    const savedData = await guild.commands.set(applicationCommandData.map((p) => ({ ...p, defaultPermission: false })));

    const slashCommandCollection = new Collection<string, SlashCommand>();
    const contextMenuCollection = new Collection<string, ContextMenu<any>>();
    let intListenerCollection = new Collection<string, InteractionListener>();
    let reactionListenerCollection = new Collection<string, ReactionListener>();

    for (const slashCommand of allSlashCommands) {
        slashCommandCollection.set(slashCommand.commandIdentifier, slashCommand);
        intListenerCollection = intListenerCollection.concat(slashCommand.interactionListeners);
        reactionListenerCollection = reactionListenerCollection.concat(slashCommand.reactionListeners);
    }

    for (const ctxMenu of contextMenus) {
        contextMenuCollection.set(ctxMenu.name, ctxMenu);
    }

    const fullPermissions: GuildApplicationCommandPermissionData[] = savedData.map((s) => ({
        id: s.id,
        permissions: [
            {
                id: roles.staff,
                type: "ROLE",
                permission: true
            }
        ]
    }));

    await guild.commands.permissions.set({ fullPermissions });

    return [slashCommandCollection, contextMenuCollection, intListenerCollection, reactionListenerCollection];
}
