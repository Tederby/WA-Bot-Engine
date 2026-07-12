/**
 * Middleware — Declarative Permission Guard
 *
 * Commands declare their requirements via boolean flags:
 *   groupOnly, adminOnly, botAdminRequired, ownerOnly
 *
 * The handler calls checkPermissions() before executing.
 * Returns an error message string if blocked, null if allowed.
 */

import { isUserGroupBanned } from "./database.js";

/**
 * Check command permissions based on declarative flags.
 *
 * NOTE: Global bans (user ban & group ban) are checked earlier in handler.js
 * for efficiency (before command parsing). This function only handles
 * group-level user bans and command-level permission flags.
 *
 * @param {object} cmd - Command object with optional flags
 * @param {object} ctx - Message context from buildContext()
 * @returns {string|null} Error message if blocked, null if allowed
 */
export function checkPermissions(cmd, ctx) {
    // Group-level user ban (user banned from using bot in this specific group)
    if (ctx.isGroup && isUserGroupBanned(ctx.chatId, ctx.sender)) {
        return "⚠️ You have been banned from using the bot in this group.";
    }

    // Declarative command flags
    if (cmd.groupOnly && !ctx.isGroup) {
        return "⚠️ This command can only be used in groups.";
    }

    if (cmd.adminOnly && !ctx.isGroupAdmins && !ctx.isOwner) {
        return "⚠️ This command is restricted to group Admins or the Bot Owner.";
    }

    if (cmd.botAdminRequired && !ctx.isBotGroupAdmins) {
        return "⚠️ The bot must be a group Admin to run this command.";
    }

    if (cmd.botAdminOnly && !ctx.isBotAdmin) {
        return "⚠️ This command is restricted to Bot Admins or the Owner.";
    }

    if (cmd.ownerOnly && !ctx.isOwner) {
        return "⚠️ This command is restricted to the System Owner.";
    }

    if (cmd.privateOnly && ctx.isGroup) {
        return "⚠️ This command can only be used in a Private Chat.";
    }

    return null;
}
