/**
 * Auto-Detect Registry — Pattern-based auto-detection for URLs/text in messages.
 *
 * Instead of hardcoding auto-detect logic in handler.js, each module
 * registers its pattern here. The handler calls `runAutoDetects()` and
 * the first matching pattern's handler is executed.
 *
 * Adding a new auto-detect (e.g. Pixiv, Twitter media) is now just:
 *   1. Create the handler function
 *   2. Register it with `registerAutoDetect()`
 *
 * No need to touch handler.js.
 */

/** @type {Array<{ name: string, test: (text: string, message: object) => boolean, handler: (params: object) => Promise<void> }>} */
const autoDetects = [];

/**
 * Register a new auto-detect pattern.
 *
 * @param {object} config
 * @param {string} config.name - Identifier for logging (e.g. "danbooru")
 * @param {(text: string, message: object) => boolean} config.test
 *   Return true if this auto-detect should fire. Receives the message text and full message.
 * @param {(params: object) => Promise<void>} config.handler
 *   Receives { text, match, message, sock }. `match` is the regex match if test uses one.
 */
export function registerAutoDetect(config) {
    autoDetects.push(config);
}

/**
 * Run all registered auto-detects against a message.
 * Returns true if one fired (handler should stop processing).
 *
 * @param {string} text - Message text
 * @param {object} message - Full message object
 * @param {object} sock - Baileys socket
 * @returns {Promise<{ matched: boolean, name: string|null }>}
 */
export async function runAutoDetects(text, message, sock) {
    for (const ad of autoDetects) {
        if (ad.test(text, message)) {
            await ad.handler({ text, message, sock });
            return { matched: true, name: ad.name };
        }
    }
    return { matched: false, name: null };
}

// ── Built-in: Danbooru Auto-Detect ──────────────────────────────────────────

import { handleDanbooruRequest } from "./danbooru.js";

const danbooruRegex = /(?:https?:\/\/)?(?:www\.)?danbooru\.donmai\.us\/posts\/(\d+)(?:\?.*)?/i;

registerAutoDetect({
    name: "danbooru",
    test(text, _message) {
        // Mencegah bot merespon pesannya sendiri
        if (_message?.key?.fromMe) return false;

        // Don't re-trigger on the bot's own Danbooru response messages
        if (text.includes("⭐ *Rating:*") || text.includes("❌ Gambar NSFW (Explicit) diblokir.")) {
            return false;
        }
        return danbooruRegex.test(text);
    },
    async handler({ text, message, sock }) {
        const match = text.match(danbooruRegex);
        if (!match) return;
        await handleDanbooruRequest({ input: match[1], sock, message, isAutoDetect: true });
    },
});

// ── Built-in: Group Auto-Reply ──────────────────────────────────────────────

import { getGroupConfig } from "./database.js";
import { msgFilter } from "./utils.js";
import setting from "../setting.js";

registerAutoDetect({
    name: "autoreply",
    test(text, message) {
        if (!message?.chat?.endsWith("@g.us")) return false; // Only in groups
        if (message?.key?.fromMe) return false; // Prevent infinite loops

        const chat = message.chat;
        const config = getGroupConfig(chat);
        if (!config.autoReplies || Object.keys(config.autoReplies).length === 0) return false;

        const lowerText = text.trim().toLowerCase();
        for (const trigger of Object.keys(config.autoReplies)) {
            if (lowerText === trigger.toLowerCase()) {
                return true;
            }
        }
        return false;
    },
    async handler({ text, message, sock }) {
        const chat = message.chat;
        const config = getGroupConfig(chat);
        const lowerText = text.trim().toLowerCase();
        
        for (const [trigger, responseData] of Object.entries(config.autoReplies)) {
            if (lowerText === trigger.toLowerCase()) {
                // Terapkan cooldown
                if (msgFilter.isFiltered(chat)) return;
                msgFilter.addFilter(chat, setting.spamDelay || 3000);

                // Send the custom response
                await sock.sendMessage(
                    chat,
                    {
                        text: responseData.text,
                        mentions: responseData.mentions || []
                    },
                    { quoted: message }
                );
                return;
            }
        }
    },
});
