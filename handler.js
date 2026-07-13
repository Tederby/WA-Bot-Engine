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

// ── Blocklist Cache (avoid network call per-message) ────────────────────────
let _blocklistCache = [];
let _blocklistTimestamp = 0;
const BLOCKLIST_TTL = 60_000; // 60 seconds

async function getCachedBlocklist(sock) {
    const now = Date.now();
    if (now - _blocklistTimestamp > BLOCKLIST_TTL) {
        try {
            _blocklistCache = await sock.fetchBlocklist();
            _blocklistTimestamp = now;
        } catch {
            // Connection not ready or network error — use stale cache
        }
    }
    return _blocklistCache;
}

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

        // ── [OPTIONAL] Global ban checks (silent — no response) ─────
        // Built-in ban system. Remove these two lines if you don't
        // need user/group banning in your bot.
        if (ctx.isGroup && isGroupBanned(message.chat)) return;
        if (isBanned(ctx.sender)) return;

        // ── Block check (group only) ────────────────────────────────
        if (ctx.isGroup) {
            const listBlocked = await getCachedBlocklist(sock);
            if (listBlocked.includes(ctx.sender)) return;
            
            // ── Multi-Bot Priority Claim ────────────────────────────
            const botId = process.env.BOT_ID || setting.botId || "bot";
            const participants = ctx.groupMetadata?.participants;
            
            if (participants && participants.length > 0) {
                const participantJids = participants.map(p => p.id);
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
                    return; // Already claimed by a higher-priority bot
                }
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
                    await message.reply("❌ Only the original sender can interact with this.");
                    return;
                }
                logger.exec(t, `reply:${entry.state.commandName || "unknown"}`, ctx.pushname, ctx.isGroup, ctx.groupName);
                await sock.readMessages([message.key]);
                await entry.handler({ message, sock, state: entry.state });
                return;
            }
        }

        // ── 3. Auto-Detect (modular pattern matching) ───────────────
        // Only run auto-detect if the message is NOT a valid explicit command.
        // This prevents auto-detect from intercepting commands like `!register steam <link>`
        if (!cmd) {
            const detection = await runAutoDetects(text, message, sock);
            if (detection.matched) {
                logger.autoDetect(t, detection.name, ctx.pushname, ctx.isGroup, ctx.groupName);
                await sock.readMessages([message.key]);
                return;
            }
        }

        // ── 4. Process Command ──────────────────────────────────────
        if (!parsed) return;
        if (!cmd) return;

        const { prefix, commandName, args, rawArgs } = parsed;

        const cmdLabel = `${prefix}${commandName} [${args.length}]`;

        // ── 4. Spam Filter (per-user per-chat) ──────────────────────
        const spamKey = `${ctx.sender}_${message.chat}`;
        if (msgFilter.isFiltered(spamKey)) {
            return logger.spam(t, cmdLabel, ctx.pushname, ctx.isGroup, ctx.groupName);
        }
        msgFilter.addFilter(spamKey, setting.spamDelay);

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
