/**
 * Logger — Centralized, compact terminal logging.
 *
 * Design goals:
 *  - Informative at a glance (emoji + color-coded tags)
 *  - Compact single-line format — won't flood PM2 logs
 *  - Consistent structure: [TAG] timestamp | context
 *
 * Log levels:
 *  - EXEC: command executions (core activity)
 *  - SPAM: filtered commands (shows bot is protecting itself)
 *  - AUTH: owner/admin permission checks (security audit)
 *  - AUTO: auto-detect triggers
 *  - ERROR: errors with context
 *  - WARN: recoverable issues
 *  - INFO: system events (startup, cleanup, etc.)
 */

import chalk from "chalk";

// ── Compact timestamp (HH:mm:ss only — date is in PM2 logs already) ─────────
const ts = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

// ── Location label: "User" or "User @ Group" ────────────────────────────────
const loc = (pushname, isGroup, groupName) => {
    const name = chalk.cyan(pushname || "???");
    return isGroup && groupName ? `${name} ${chalk.dim("@")} ${chalk.yellow(groupName)}` : name;
};

export const logger = {
    /**
     * Command executed successfully.
     * Format: ⚡ 14:30:05 | !menu [0] ← User @ GroupName
     */
    exec(timestamp, label, pushname, isGroup, groupName) {
        console.log(
            `${chalk.green("⚡")} ${chalk.dim(ts())} ${chalk.white.bold(label)} ${chalk.dim("←")} ${loc(pushname, isGroup, groupName)}`
        );
    },

    /**
     * Command blocked by spam filter.
     * Format: 🚫 14:30:05 | !menu [0] ← User @ GroupName
     */
    spam(timestamp, label, pushname, isGroup, groupName) {
        console.log(
            `${chalk.red("🚫")} ${chalk.dim(ts())} ${chalk.dim(label)} ${chalk.dim("←")} ${loc(pushname, isGroup, groupName)}`
        );
    },

    /**
     * Auto-detect triggered.
     * Format: 🔍 14:30:05 | pattern ← User @ GroupName
     */
    autoDetect(timestamp, label, pushname, isGroup, groupName) {
        console.log(
            `${chalk.blue("🔍")} ${chalk.dim(ts())} ${chalk.magenta(label)} ${chalk.dim("←")} ${loc(pushname, isGroup, groupName)}`
        );
    },

    /**
     * Authorization check for sensitive commands.
     * Format: 🔐 14:30:05 | ✓ !bash [1] ← User @ GroupName
     *         🔐 14:30:05 | ✗ !bash [1] ← User @ GroupName
     */
    auth(timestamp, label, pushname, isGroup, groupName, status) {
        const icon = status === "ALLOWED" ? chalk.green("✓") : chalk.red("✗");
        console.log(
            `${chalk.magenta("🔐")} ${chalk.dim(ts())} ${icon} ${chalk.white.bold(label)} ${chalk.dim("←")} ${loc(pushname, isGroup, groupName)}`
        );
    },

    /**
     * Error with context.
     * Format: ❌ 14:30:05 | [HANDLER] Error message
     */
    error(context, err) {
        const msg = err?.message || err;
        const stack = err?.stack;
        console.error(
            `${chalk.red("❌")} ${chalk.dim(ts())} ${chalk.red.bold(`[${context}]`)} ${msg}`
        );
        if (stack) {
            const lines = stack.split("\n").slice(1, 4).map(l => chalk.dim(l.trim()));
            if (lines.length) console.error(chalk.dim("   " + lines.join("\n   ")));
        }
    },

    /**
     * Warning — recoverable issue.
     * Format: ⚠️  14:30:05 | [CONTEXT] message
     */
    warn(context, message) {
        console.warn(
            `${chalk.yellow("⚠️ ")} ${chalk.dim(ts())} ${chalk.yellow(`[${context}]`)} ${message}`
        );
    },

    /**
     * System info — startup, cleanup, connection events.
     * Format: ℹ️  14:30:05 | [CLEANUP] files: 3, states: 0
     */
    info(tag, message) {
        console.log(
            `${chalk.blue("ℹ️ ")} ${chalk.dim(ts())} ${chalk.blue(`[${tag}]`)} ${message}`
        );
    },
};

export default logger;
