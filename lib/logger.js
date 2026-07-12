/**
 * Logger — Centralized, formatted console logging for the bot.
 *
 * Instead of inline console.log with manual color/formatting,
 * all logging goes through this module for consistency.
 */

import { color } from "./utils.js";

/**
 * Format a timestamp (unix seconds) to DD/MM/YY HH:mm:ss.
 * Uses native Intl.DateTimeFormat — no external dependency needed.
 * @param {number} timestampSec - Unix timestamp in seconds
 * @returns {string}
 */
function fmtTime(timestampSec) {
    const d = new Date(timestampSec * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Build the common suffix: "from <pushname> [in <group>]"
 * @param {string} pushname
 * @param {boolean} isGroup
 * @param {string} [groupName]
 * @returns {string[]}
 */
function fromClause(pushname, isGroup, groupName) {
    const parts = ["from", color(pushname)];
    if (isGroup && groupName) {
        parts.push("in", color(groupName));
    }
    return parts;
}

export const logger = {
    /**
     * Log a command execution.
     */
    exec(timestamp, label, pushname, isGroup, groupName) {
        console.log(
            color("[EXEC]"),
            color(fmtTime(timestamp), "yellow"),
            color(label),
            ...fromClause(pushname, isGroup, groupName)
        );
    },

    /**
     * Log a spam-filtered command.
     */
    spam(timestamp, label, pushname, isGroup, groupName) {
        console.log(
            color("[SPAM]", "red"),
            color(fmtTime(timestamp), "yellow"),
            color(label),
            ...fromClause(pushname, isGroup, groupName)
        );
    },

    /**
     * Log an auto-detect event.
     */
    autoDetect(timestamp, label, pushname, isGroup, groupName) {
        console.log(
            color("[AUTO-DETECT]"),
            color(fmtTime(timestamp), "yellow"),
            color(label),
            ...fromClause(pushname, isGroup, groupName)
        );
    },

    /**
     * Log an error with optional context.
     */
    error(context, err) {
        console.log(color(`[ERROR] ${context}`, "red"), err);
    },

    /**
     * Generic info log.
     */
    info(tag, message) {
        console.log(color(`[${tag}]`, "yellow"), message);
    },
};
