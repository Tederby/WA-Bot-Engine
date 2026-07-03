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
import { isBanned, isGroupBanned, getActiveBotsInGroup, claimMessage } from "./lib/database.js";
import setting from "./setting.js";

let msgHandler = async (upsert, sock, message) => {
    try {
        let { text } = message;
        text = text || "";

        // ── Guard: empty sender ─────────────────────────────────────
        if (message.sender === "") return;

        const t = message.messageTimestamp;

        // ── Ignore offline replay (prevent double processing) ───────
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - t > 120) return;

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
            
            // ── Multi-Bot Priority Claim ────────────────────────────
            const botId = process.env.BOT_ID || setting.botId || "bot";
            const participantJids = ctx.groupMetadata.participants.map(p => p.id);
            const activeBots = getActiveBotsInGroup(participantJids);
            
            const myJid = sock.user.id.includes(":") ? sock.user.id.split(":")[0] + "@s.whatsapp.net" : sock.user.id;
            const myIndex = activeBots.indexOf(myJid);
            
            if (myIndex > 0) {
                // Delay 1.5s per priority level (index 0 = 0s)
                await new Promise(resolve => setTimeout(resolve, myIndex * 1500));
            }
            
            const stanzaId = message.key.id;
            const claimed = claimMessage(stanzaId, botId);
            if (!claimed) {
                return; // Diambil alih oleh bot lain dengan prioritas lebih tinggi
            }
        }

        // ── 1. Command Parsing ──────────────────────────────────────
        const parsed = parseCommand(text);
        const cmd = parsed ? getCommand(parsed.commandName) : null;

        // ── 2. Reply Handler Interception ───────────────────────────
        // Catches replies to multi-step commands (e.g. ytdlf format selection)
        // If it's a valid command, we bypass the reply handler and execute the command.
        if (message.quoted && message.contextInfo?.stanzaId && !cmd) {
            const entry = getReplyHandler(message.contextInfo.stanzaId);
            if (entry) {
                if (entry.state.userId !== ctx.sender) {
                    await message.reply("❌ Hanya pengirim asli yang bisa memproses interaksi ini");
                    return;
                }
                logger.exec(t, `reply:${entry.state.commandName || "unknown"}`, ctx.pushname, ctx.isGroup, ctx.groupName);
                await sock.readMessages([message.key]);
                await entry.handler({ message, sock, state: entry.state });
                return;
            }
        }

        // ── 3. Auto-Detect (modular pattern matching) ───────────────
        const detection = await runAutoDetects(text, message, sock);
        if (detection.matched) {
            logger.autoDetect(t, detection.name, ctx.pushname, ctx.isGroup, ctx.groupName);
            await sock.readMessages([message.key]);
            return;
        }

        // ── 4. Process Command ──────────────────────────────────────
        if (!parsed) return;
        if (!cmd) return;

        const { prefix, commandName, args, rawArgs } = parsed;

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
