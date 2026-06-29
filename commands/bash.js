/**
 * Bash Command — Stateful Shell Execution via WhatsApp
 *
 * Maintains a persistent bash process per owner, so state (cwd, env vars,
 * etc.) persists across commands — just like a real terminal session.
 *
 * - If bot runs on Linux (VPS): spawns /bin/bash locally
 * - If bot runs on Windows (dev): spawns an SSH tunnel to VPS
 *
 * Special sub-commands:
 *   $ reset   — Kill current session, next command starts fresh
 *
 * Output is always wrapped in WhatsApp monospace code blocks (```).
 * Uses message editing instead of sending two separate messages.
 *
 * Security: ownerOnly — only owner numbers can execute this command.
 */

import { spawn } from "child_process";
import os from "os";

// ── Configuration ───────────────────────────────────────────────────────────
const SSH_HOST = "103.168.146.150";
const SSH_PORT = 40015;
const SSH_USER = "root";
const EXEC_TIMEOUT = 60_000;        // 60 seconds max per command
const MAX_OUTPUT_LENGTH = 4000;     // WhatsApp safe limit (chars)
const SHELL = "/bin/bash";
const isVPS = os.platform() === "linux";

// ── Persistent Sessions (keyed by sender JID) ──────────────────────────────
const sessions = new Map();

/**
 * Spawn a new bash process (local or via SSH).
 */
function spawnShell() {
    if (isVPS) {
        return spawn(SHELL, ["--norc", "--noprofile"], {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: process.env.HOME || "/root",
            env: {
                ...process.env,
                TERM: "dumb",
                LANG: "en_US.UTF-8",
                PS1: "", PS2: "",
                PROMPT_COMMAND: "",
            },
        });
    }

    // Windows dev — tunnel through SSH
    return spawn("ssh", [
        "-p", String(SSH_PORT),
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-T",
        `${SSH_USER}@${SSH_HOST}`,
        `${SHELL} --norc --noprofile`,
    ], {
        stdio: ["pipe", "pipe", "pipe"],
    });
}

/**
 * Get or create a persistent session for a sender.
 */
function getSession(sender) {
    const existing = sessions.get(sender);
    if (existing && existing.proc.exitCode === null && !existing.proc.killed) {
        return existing;
    }

    // Clean up dead session
    if (existing) {
        try { existing.proc.kill(); } catch { /* ignore */ }
        sessions.delete(sender);
    }

    // Create new session
    const proc = spawnShell();
    const session = { proc, busy: false, new: true };

    proc.on("exit", () => sessions.delete(sender));
    proc.on("error", () => sessions.delete(sender));

    // Suppress any startup output (SSH banner etc.)
    proc.stdout.resume();
    proc.stderr.resume();

    sessions.set(sender, session);
    return session;
}

/**
 * Destroy a session and kill the process.
 */
function destroySession(sender) {
    const session = sessions.get(sender);
    if (session) {
        try { session.proc.kill("SIGTERM"); } catch { /* ignore */ }
        sessions.delete(sender);
    }
}

/**
 * Execute a command inside a persistent session using marker-based delimiting.
 * Stderr is merged into stdout with 2>&1 so output order matches a real terminal.
 */
function executeInSession(session, command) {
    return new Promise((resolve) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const marker = `__XEND_${id}__`;

        let output = "";
        let resolved = false;

        session.busy = true;

        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            try { session.proc.stdin.write("\x03\n"); } catch { /* ignore */ }
            cleanup();
            session.busy = false;
            resolve({ output: output.trimEnd(), code: 130, killed: true });
        }, EXEC_TIMEOUT);

        function cleanup() {
            session.proc.stdout.removeListener("data", onData);
            session.proc.stderr.removeListener("data", onStderr);
        }

        function onData(chunk) {
            output += chunk.toString();
            const idx = output.indexOf(marker);
            if (idx !== -1) {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);

                const body = output.substring(0, idx);
                const tail = output.substring(idx + marker.length);
                const exitMatch = tail.match(/:(\d+)/);
                const code = exitMatch ? parseInt(exitMatch[1]) : 0;

                cleanup();
                session.busy = false;
                resolve({ output: body.trimEnd(), code, killed: false });
            }
        }

        function onStderr(chunk) {
            // stderr shouldn't contain marker, but collect it for edge cases
            output += chunk.toString();
        }

        session.proc.stdout.on("data", onData);
        session.proc.stderr.on("data", onStderr);

        // If this is a brand-new session, drain any startup noise first
        if (session.new) {
            session.new = false;
            const drainMarker = `__DRAIN_${id}__`;
            session.proc.stdin.write(
                `echo "${drainMarker}" > /dev/null 2>&1\n`
            );
            // Small delay to let startup output flush, then send actual command
            setTimeout(() => {
                session.proc.stdin.write(
                    `${command} 2>&1\necho "${marker}:$?"\n`
                );
            }, 200);
        } else {
            session.proc.stdin.write(
                `${command} 2>&1\necho "${marker}:$?"\n`
            );
        }
    });
}

/**
 * Strip ANSI escape codes from terminal output.
 */
function stripAnsi(str) {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/**
 * Truncate output to stay within WhatsApp message limits.
 */
function truncate(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + `\n\n... [terpotong, ${text.length - maxLen} karakter lagi]`;
}

export default {
    name: "bash",
    aliases: ["sh", "exec", "terminal", "shell"],
    category: "owner",
    description: "Eksekusi command bash di VPS — stateful (owner only)",
    usage: "!bash <command>  |  $ <command>  |  $ reset",
    ownerOnly: true,

    async handler({ message, sock, rawArgs, sender }) {
        // ── Validate input ──────────────────────────────────────────
        if (!rawArgs || !rawArgs.trim()) {
            return message.reply(
                "```[bash] Terminal VPS via WhatsApp\n\n" +
                "Penggunaan:\n" +
                "  $ ls -la          — jalankan command\n" +
                "  $ cd /etc && ls   — stateful (cwd tersimpan)\n" +
                "  $ reset           — reset session (terminal baru)\n\n" +
                "Session bersifat persistent,\n" +
                "cd/export/alias tetap tersimpan.```"
            );
        }

        const command = rawArgs.trim();

        // ── Handle reset ────────────────────────────────────────────
        if (command.toLowerCase() === "reset") {
            const hadSession = sessions.has(sender);
            destroySession(sender);
            return message.reply(
                hadSession
                    ? "```🔄 Session bash direset.\nSession baru akan dibuat otomatis.```"
                    : "```ℹ️ Tidak ada session aktif.```"
            );
        }

        // ── Send initial message (will be edited later) ─────────────
        const sentMsg = await sock.sendMessage(
            message.chat,
            { text: `\`\`\`⏳ $ ${command}\`\`\`` },
            { quoted: message }
        );

        // ── Get/create session ──────────────────────────────────────
        const session = getSession(sender);

        if (session.busy) {
            await sock.sendMessage(message.chat, {
                text: "```⚠️ Command sebelumnya masih berjalan.\nTunggu selesai atau kirim: $ reset```",
                edit: sentMsg.key,
            });
            return;
        }

        // ── Execute ─────────────────────────────────────────────────
        const startTime = Date.now();
        let result;
        try {
            result = await executeInSession(session, command);
        } catch (err) {
            await sock.sendMessage(message.chat, {
                text: `\`\`\`❌ Gagal eksekusi: ${err.message}\nCoba: $ reset\`\`\``,
                edit: sentMsg.key,
            });
            return;
        }
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        // ── Build output ────────────────────────────────────────────
        let output = stripAnsi(result.output).trim();
        if (!output) output = "(no output)";

        let header = `$ ${command}\n`;
        header += "─".repeat(Math.min(command.length + 2, 30)) + "\n";

        let footer = "\n" + "─".repeat(30) + "\n";
        footer += `exit: ${result.code} | ${elapsed}s`;
        if (result.killed) footer += " | ⚠️ TIMEOUT";

        const maxBodyLen = MAX_OUTPUT_LENGTH - header.length - footer.length - 10;
        const body = truncate(output, maxBodyLen);

        // ── Edit message with result ────────────────────────────────
        await sock.sendMessage(message.chat, {
            text: "```" + header + body + footer + "```",
            edit: sentMsg.key,
        });
    },
};
