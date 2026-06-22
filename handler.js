/**
 * Message Handler — Clean Pipeline Architecture
 *
 * Pipeline: guard → ban-check → context → reply-handler → auto-detect → parse → spam-filter → permissions → execute
 *
 * Each step is clearly separated. Adding new middleware (e.g. owner-only check,
 * group-only check) is straightforward via declarative command flags.
 */

import { msgFilter } from "./lib/utils.js";
import { parseCommand } from "./lib/commandParser.js";
import { getCommand, getReplyHandler } from "./commands/_registry.js";
import { buildContext } from "./lib/contextBuilder.js";
import { runAutoDetects } from "./lib/autoDetect.js";
import { logger } from "./lib/logger.js";
import { checkPermissions } from "./lib/middleware.js";
import { isBanned, isGroupBanned } from "./lib/database.js";
import setting from "./setting.js";

let msgHandler = async (upsert, sock, message) => {
    try {
        let { text } = message;
        text = text || "";

        // ── Guard: empty sender ─────────────────────────────────────
        if (message.sender === "") return;

        const t = message.messageTimestamp;

        // ── Build context ───────────────────────────────────────────
        const ctx = await buildContext(message, sock);
        if (!ctx.sender) return;

        // ── Global ban checks (silent — no response) ────────────────
        // Checked early to avoid wasting resources on banned entities.
        if (ctx.isGroup && isGroupBanned(message.chat)) return;
        if (isBanned(ctx.sender)) return;

        // ── Block check (group only) ────────────────────────────────
        if (ctx.isGroup) {
            const listBlocked = await sock.fetchBlocklist();
            if (listBlocked.includes(ctx.sender)) return;
        }

        // ── 1. Reply Handler Interception ───────────────────────────
        // Catches replies to multi-step commands (e.g. ytdlf format selection)
        // before the command parser runs, because these replies have no prefix.
        if (message.quoted && message.contextInfo?.stanzaId) {
            const entry = getReplyHandler(message.contextInfo.stanzaId);
            if (entry) {
                if (entry.state.userId !== ctx.sender) {
                    await message.reply("❌ Hanya pengirim asli yang bisa memilih format");
                    return;
                }
                logger.exec(t, `reply:${entry.state.commandName || "unknown"}`, ctx.pushname, ctx.isGroup, ctx.groupName);
                await sock.readMessages([message.key]);
                await entry.handler({ message, sock, state: entry.state });
                return;
            }
        }

        // ── 2. Auto-Detect (modular pattern matching) ───────────────
        const detection = await runAutoDetects(text, message, sock);
        if (detection.matched) {
            logger.autoDetect(t, detection.name, ctx.pushname, ctx.isGroup, ctx.groupName);
            await sock.readMessages([message.key]);
            return;
        }

        // ── 3. Command Parsing ──────────────────────────────────────
        const parsed = parseCommand(text);
        if (!parsed) return;

        const { prefix, commandName, args, rawArgs } = parsed;
        const cmd = getCommand(commandName);
        if (!cmd) return;

        const cmdLabel = `${prefix}${commandName} [${args.length}]`;

        // ── 4. Spam Filter ──────────────────────────────────────────
        if (msgFilter.isFiltered(message.chat)) {
            return logger.spam(t, cmdLabel, ctx.pushname, ctx.isGroup, ctx.groupName);
        }
        msgFilter.addFilter(message.chat, setting.spamDelay);

        // ── 5. Permission Guard (Middleware) ────────────────────────
        const guardMsg = checkPermissions(cmd, { ...ctx, chatId: message.chat });
        if (guardMsg) {
            await message.reply(guardMsg);
            return;
        }

        // ── 6. Log & Execute ────────────────────────────────────────
        logger.exec(t, cmdLabel, ctx.pushname, ctx.isGroup, ctx.groupName);
        await sock.readMessages([message.key]);

        await cmd.handler({
            message,
            sock,
            upsert,
            args,
            rawArgs,
            prefix,
            ...ctx,
        });

    } catch (err) {
        logger.error("HANDLER", err);
    }
};

export { msgHandler };
export default { msgHandler };
