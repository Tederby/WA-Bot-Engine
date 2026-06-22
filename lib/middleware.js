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
        return "⚠️ Kamu telah di-ban dari menggunakan bot di grup ini.";
    }

    // Declarative command flags
    if (cmd.groupOnly && !ctx.isGroup) {
        return "⚠️ Perintah ini hanya bisa digunakan di dalam grup.";
    }

    if (cmd.adminOnly && !ctx.isGroupAdmins && !ctx.isOwner) {
        return "⚠️ Perintah ini hanya untuk Admin grup atau Owner bot.";
    }

    if (cmd.botAdminRequired && !ctx.isBotGroupAdmins) {
        return "⚠️ Bot harus menjadi Admin grup untuk menjalankan perintah ini.";
    }

    if (cmd.ownerOnly && !ctx.isOwner) {
        return "⚠️ Perintah ini hanya untuk Owner bot.";
    }

    return null;
}
