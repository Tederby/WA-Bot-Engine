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
 * Output styled with p10k-inspired unicode, showing cwd, timestamp, exit
 * code, and execution time. Uses message editing instead of double-send.
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
 * After the command, captures cwd and user for the p10k-style prompt.
 * Stderr is merged into stdout with 2>&1 so output order matches a real terminal.
 */
function executeInSession(session, command) {
    return new Promise((resolve) => {
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const marker = `__XEND_${id}__`;
        // Metadata marker to capture cwd and user after execution
        const metaMarker = `__META_${id}__`;

        let output = "";
        let resolved = false;

        session.busy = true;

        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            try { session.proc.stdin.write("\x03\n"); } catch { /* ignore */ }
            cleanup();
            session.busy = false;
            resolve({ output: output.trimEnd(), code: 130, killed: true, cwd: "?", user: "?" });
        }, EXEC_TIMEOUT);

        function cleanup() {
            session.proc.stdout.removeListener("data", onData);
            session.proc.stderr.removeListener("data", onStderr);
            session.proc.removeListener("exit", onExit);
        }

        function onExit(exitCode) {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            cleanup();
            session.busy = false;
            resolve({ output: output.trimEnd(), code: exitCode ?? 1, killed: false, cwd: "?", user: "?" });
        }

        function onData(chunk) {
            // Guard: ignore data from dead processes
            if (session.proc.exitCode !== null) return;
            
            output += chunk.toString();
            const idx = output.indexOf(metaMarker);
            if (idx !== -1) {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);

                // Split: command output | marker:exitcode | metadata
                const markerIdx = output.indexOf(marker);
                const cmdOutput = markerIdx !== -1
                    ? output.substring(0, markerIdx)
                    : output.substring(0, idx);

                // Parse exit code from between marker and metaMarker
                const between = markerIdx !== -1
                    ? output.substring(markerIdx + marker.length, idx)
                    : "";
                const exitMatch = between.match(/:(\d+)/);
                const code = exitMatch ? parseInt(exitMatch[1]) : 0;

                // Parse metadata (cwd:user) after metaMarker
                const metaTail = output.substring(idx + metaMarker.length);
                const metaMatch = metaTail.match(/([^|]*)\|([^\n]*)/);
                const cwd = metaMatch ? metaMatch[1].trim() : "~";
                const user = metaMatch ? metaMatch[2].trim() : "root";

                cleanup();
                session.busy = false;
                resolve({
                    output: cmdOutput.trimEnd(),
                    code,
                    killed: false,
                    cwd,
                    user,
                });
            }
        }

        function onStderr(chunk) {
            output += chunk.toString();
        }

        session.proc.stdout.on("data", onData);
        session.proc.stderr.on("data", onStderr);
        session.proc.on("exit", onExit);

        // Build the command sequence:
        // 1. Run user command (stderr → stdout)
        // 2. Capture exit code via marker
        // 3. Capture cwd and user via metaMarker
        const cmdSequence = [
            `${command} 2>&1`,
            `__exit_code__=$?; echo "${marker}:$__exit_code__"`,
            `echo "${metaMarker}$(pwd)|$(whoami)"`,
        ].join("\n") + "\n";

        if (session.new) {
            session.new = false;
            // Drain startup noise first
            session.proc.stdin.write(`true\n`);
            setTimeout(() => {
                session.proc.stdin.write(cmdSequence);
            }, 200);
        } else {
            session.proc.stdin.write(cmdSequence);
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
    return text.slice(0, maxLen) + `\n\n… [+${text.length - maxLen} chars]`;
}

/**
 * Shorten home directory in path for display (like p10k).
 * /root/wa-bot → ~/wa-bot
 */
function shortPath(cwd, user) {
    const home = user === "root" ? "/root" : `/home/${user}`;
    if (cwd === home) return "~";
    if (cwd.startsWith(home + "/")) return "~" + cwd.substring(home.length);
    return cwd;
}

/**
 * Get current WIB timestamp (HH:mm).
 */
function timeWIB() {
    return new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
    });
}

/**
 * Format elapsed time smartly.
 */
function fmtElapsed(ms) {
    if (ms < 1000) return `${ms}ms`;
    const s = (ms / 1000).toFixed(1);
    if (ms < 60_000) return `${s}s`;
    const m = Math.floor(ms / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    return `${m}m${sec}s`;
}

/**
 * Build p10k-style formatted output.
 *
 * ╭─ 🖥 root@vps ⋄ ~/wa-bot
 * ╰─ $ ls -la
 * ────────────────────
 * total 48
 * drwxr-xr-x  5 root ...
 * ────────────────────
 * ╭─ ✅ 0 ⋄ ⏱ 0.2s ⋄ 🕐 17:48
 * ╰─ ~/wa-bot $
 */
function formatOutput({ command, output, code, elapsed, cwd, user, killed }) {
    const displayPath = shortPath(cwd, user);
    const hostname = isVPS ? os.hostname() : "vps";
    const time = timeWIB();
    const exitIcon = code === 0 ? "✅" : "❌";
    const elapsedStr = fmtElapsed(elapsed);

    let text = "";

    // ── Prompt header (before command) ──────────────────
    text += `╭─ 🖥 ${user}@${hostname} ⋄ ${displayPath}\n`;
    text += `╰─ $ ${command}\n`;

    // ── Output body ─────────────────────────────────────
    if (output && output !== "(no output)") {
        text += `────────────────────\n`;
        text += output + "\n";
    }

    // ── Status footer ───────────────────────────────────
    text += `────────────────────\n`;
    text += `╭─ ${exitIcon} ${code}`;
    text += ` ⋄ ⏱ ${elapsedStr}`;
    text += ` ⋄ 🕐 ${time}`;
    if (killed) text += ` ⋄ ⚠️ TIMEOUT`;
    text += "\n";
    text += `╰─ ${displayPath} $`;

    return text;
}

export default {
    name: "bash",
    aliases: ["sh", "exec", "terminal", "shell"],
    category: "system",
    description: "Eksekusi command bash di VPS — stateful (owner only)",
    usage: "!bash <command>  |  $ <command>  |  $ reset",
    ownerOnly: true,

    async handler({ message, sock, rawArgs, sender }) {
        // ── Validate input ──────────────────────────────────────────
        if (!rawArgs || !rawArgs.trim()) {
            return message.reply(
                "╭━━━〔 🖥 Terminal VPS 〕━━━\n" +
                "┃ Shell bash via WhatsApp\n" +
                "┃ Session stateful (cd/export)\n" +
                "╰━━━━━━━━━━━━━━━━━━━━\n\n" +
                "╭───「 📖 Penggunaan 」\n" +
                "│ ⋄ $ ls -la\n" +
                "│ ⋄ $ cd /etc && ls\n" +
                "│ ⋄ $ export FOO=bar\n" +
                "│ ⋄ $ reset\n" +
                "╰──────────────"
            );
        }

        const command = rawArgs.trim();

        // ── Handle reset ────────────────────────────────────────────
        if (command.toLowerCase() === "reset") {
            const hadSession = sessions.has(sender);
            destroySession(sender);

            const text = hadSession
                ? "╭─ 🔄 Session direset\n╰─ Session baru dibuat otomatis"
                : "╭─ ℹ️ Tidak ada session aktif\n╰─ Kirim command untuk memulai";

            return message.reply("```" + text + "```");
        }

        // ── Send initial message (will be edited later) ─────────────
        const sentMsg = await sock.sendMessage(
            message.chat,
            { text: "```╭─ ⏳ Executing...\n╰─ $ " + command + "```" },
            { quoted: message }
        );

        // ── Get/create session ──────────────────────────────────────
        const session = getSession(sender);

        if (session.busy) {
            await sock.sendMessage(message.chat, {
                text: "```╭─ ⚠️ Sedang menjalankan command\n╰─ Tunggu atau kirim: $ reset```",
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
                text: "```╭─ ❌ Gagal: " + err.message + "\n╰─ Coba: $ reset```",
                edit: sentMsg.key,
            });
            return;
        }
        const elapsed = Date.now() - startTime;

        // ── Build output ────────────────────────────────────────────
        let output = stripAnsi(result.output).trim();
        if (!output) output = "(no output)";

        // Calculate max body size for truncation
        const overhead = 200; // estimated header+footer length
        const body = truncate(output, MAX_OUTPUT_LENGTH - overhead);

        const formatted = formatOutput({
            command,
            output: body,
            code: result.code,
            elapsed,
            cwd: result.cwd || "~",
            user: result.user || "root",
            killed: result.killed,
        });

        // ── Edit message with result ────────────────────────────────
        await sock.sendMessage(message.chat, {
            text: "```" + formatted + "```",
            edit: sentMsg.key,
        });
    },
};
