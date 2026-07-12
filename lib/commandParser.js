import anyAscii from "any-ascii";
import setting from "../setting.js";

/**
 * Parse a message text into prefix, command name, and arguments.
 * Handles both "!command args" and "! command args" (space after prefix) formats.
 * Returns null if the text doesn't start with a valid prefix.
 *
 * @param {string} text - Raw message text
 * @returns {{ prefix: string, commandName: string, args: string[], rawArgs: string } | null}
 */
export function parseCommand(text) {
    if (!text || typeof text !== "string") return null;

    const trimmed = text.trim();
    if (!trimmed) return null;

    const prefixes = setting.prefixes || ["!", ".", "#", "/", "-"];

    // Check if message starts with a valid prefix
    const firstChar = trimmed[0];
    if (!prefixes.includes(firstChar)) return null;

    const prefix = firstChar;
    let commandName;
    let args;
    let rawArgs;

    // Handle "! command args" format (prefix + space + command)
    if (trimmed.length > 1 && trimmed[1] === " ") {
        const rest = trimmed.substring(2).trim();
        if (!rest) return null;
        const parts = rest.split(/\s+/);
        commandName = parts[0];
        args = parts.slice(1);
        rawArgs = rest.substring(commandName.length).trim();
    } else {
        // Handle "!command args" format
        const rest = trimmed.substring(1);
        if (!rest) return null;
        const parts = rest.split(/\s+/);
        commandName = parts[0];
        args = parts.slice(1);
        rawArgs = rest.substring(commandName.length).trim();
    }

    // Normalize command name (unicode → ascii, lowercase)
    commandName = anyAscii(commandName).toLowerCase();

    if (!commandName) return null;

    return { prefix, commandName, args, rawArgs };
}
