import chalk from "chalk";

// ── Color helper ────────────────────────────────────────────────────────────

/**
 * Get text with color using chalk keyword colors.
 * @param  {string} text
 * @param  {string} [color] - chalk keyword color (e.g. "yellow", "red"). Defaults to green.
 * @return {string}
 */
export const color = (text, color) => {
    return !color ? chalk.green(text) : chalk.keyword(color)(text);
};

// ── Spam filter ─────────────────────────────────────────────────────────────

const usedCommandRecently = new Set();

/**
 * Check if a chat ID is currently on cooldown.
 * @param  {string} chatId
 * @returns {boolean}
 */
const isFiltered = (chatId) => usedCommandRecently.has(chatId);

/**
 * Put a chat ID on cooldown for `delayMs` milliseconds.
 * @param  {string} chatId
 * @param  {number} delayMs
 */
const addFilter = (chatId, delayMs) => {
    usedCommandRecently.add(chatId);
    setTimeout(() => usedCommandRecently.delete(chatId), delayMs);
};

export const msgFilter = { isFiltered, addFilter };

// ── URL validation ──────────────────────────────────────────────────────────

/**
 * Check if a string is a valid HTTP(S) URL.
 * @param  {string} url
 * @returns {RegExpMatchArray | null}
 */
export const isUrl = (url) => {
    return url.match(
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,50}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi
    );
};

// ── Filename sanitizer ──────────────────────────────────────────────────────

/**
 * Remove characters unsafe for filenames.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeFilename(str) {
    return str
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
        .replace(/\s+/g, "_")
        .trim() || "download";
}

// ── Text & Pagination formatting ────────────────────────────────────────────

/**
 * Standard items per page across search and list commands.
 */
export const ITEMS_PER_PAGE = 5;

/**
 * Generate a text-based paginator bar for WhatsApp output.
 * @param {number} page - Current page index (0-indexed)
 * @param {number} totalPages - Total pages count
 * @returns {string} Formatted paginator bar
 */
export function generatePaginator(page, totalPages) {
    if (totalPages <= 1) return `[ 📄 Page 1/1 ] ─── ━━━━━━━━━━━━━━━━`;
    const items = [];
    const startP = Math.max(0, page - 2);
    const endP = Math.min(totalPages - 1, page + 2);
    for (let i = startP; i <= endP; i++) {
        const pNum = i + 1;
        if (i === page) items.push(`*${pNum}*`);
        else items.push(`${pNum}`);
    }
    const bar = items.join(" ─ ");
    return `[ 📄 Page ${page + 1}/${totalPages} ] ─── « ─ ${bar} ─ »`;
}

/**
 * Format uptime in seconds to human-readable string.
 * @param {number} seconds - Total uptime in seconds
 * @param {{ short?: boolean }} [options] - Output mode: short (1d 2h) or long (1 day 2 hrs)
 * @returns {string}
 */
export function formatUptime(seconds, { short = false } = {}) {
    const sec = Math.floor(seconds);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const parts = [];

    if (short) {
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    } else {
        if (d > 0) parts.push(`${d} day${d > 1 ? "s" : ""}`);
        if (h > 0) parts.push(`${h} hr${h > 1 ? "s" : ""}`);
        if (m > 0) parts.push(`${m} min${m > 1 ? "s" : ""}`);
        if (s > 0 || parts.length === 0) parts.push(`${s} sec${s > 1 ? "s" : ""}`);
    }
    return parts.join(" ");
}
