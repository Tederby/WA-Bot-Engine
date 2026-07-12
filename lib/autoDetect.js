/**
 * Auto-Detect Registry — Pattern-based auto-detection for URLs/text in messages.
 *
 * This module provides a framework for automatically responding to specific
 * patterns in messages (e.g. URLs, keywords) without requiring an explicit
 * command prefix. By default, no auto-detects are registered.
 *
 * To add an auto-detect, register it from your command file or a dedicated module:
 *
 *   import { registerAutoDetect } from "../lib/autoDetect.js";
 *
 *   registerAutoDetect({
 *       name: "example",
 *       test(text, message) {
 *           return /example\.com\/\d+/i.test(text);
 *       },
 *       async handler({ text, message, sock }) {
 *           await message.reply("Detected an example.com link!");
 *       },
 *   });
 *
 * The handler pipeline calls `runAutoDetects()` on every non-command message.
 * The first matching pattern's handler is executed, and processing stops.
 */

/** @type {Array<{ name: string, test: (text: string, message: object) => boolean, handler: (params: object) => Promise<void> }>} */
const autoDetects = [];

/**
 * Register a new auto-detect pattern.
 *
 * @param {object} config
 * @param {string} config.name - Identifier for logging (e.g. "twitter")
 * @param {(text: string, message: object) => boolean} config.test
 *   Return true if this auto-detect should fire. Receives the message text and full message.
 * @param {(params: object) => Promise<void>} config.handler
 *   Receives { text, message, sock }.
 */
export function registerAutoDetect(config) {
    autoDetects.push(config);
}

/**
 * Run all registered auto-detects against a message.
 * Returns { matched: true, name } if one fired, otherwise { matched: false }.
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
