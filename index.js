/**
 * Entry Point — WhatsApp Bot
 *
 * Responsibilities:
 *  1. Initialize Baileys connection
 *  2. Handle connection lifecycle (QR, reconnect, session cleanup)
 *  3. Route incoming messages and events
 *  4. Hot-reload handler + commands on file changes
 */

// NOTE: NODE_TLS_REJECT_UNAUTHORIZED removed — was disabling TLS verification globally.
// If you encounter SSL errors during development, set it per-request or use a custom agent.

import fs from "fs";
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  jidDecode,
  Browsers
} from "baileys";
import qrcode from "qrcode-terminal";
import Pino from "pino";
import chokidar from "chokidar";
import { Messages } from "./lib/Messages.js";
import { initCleanup } from "./services/cleanup.js";
import { reloadCommand, initCommands, commandsDir } from "./commands/_registry.js";
import { upsertBotRegistry, getUser, saveUser, banUser } from "./lib/database.js";
import { resolveTarget } from "./lib/jidHelper.js";
import setting from "./setting.js";

// ── Initialize command registry (must happen after all static imports settle) ─
await initCommands();

// ── Dynamic handler (supports hot-reload) ───────────────────────────────────
let { msgHandler } = await import("./handler.js");

// ── Start services ──────────────────────────────────────────────────────────
initCleanup();

// ── Baileys logger ──────────────────────────────────────────────────────────
const logger = Pino({ level: "silent" });

// ── Bot Instance Identity ───────────────────────────────────────────────────
const BOT_ID = setting.botId;
const TAG = `[${BOT_ID}]`;

// ── Per-Bot Paths ───────────────────────────────────────────────────────────
const SESSION_DIR = `./sessions/session_${BOT_ID}`;
const CYCLE_FILE = `./sessions/cycle_${BOT_ID}.json`;

// Ensure sessions directory exists
if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions", { recursive: true });

// ── Connection State ────────────────────────────────────────────────────────

let currentSock = null;          // Active socket reference (for graceful shutdown)
let registryInterval = null;     // Auto-Discovery Heartbeat
let reconnectAttempts = 0;       // Retry counter per cycle
let qrCount = 0;                 // How many times QR was generated without being scanned
let isSuspended = false;         // Flag to prevent reconnect after suspend
let pairingCodeRequested = false; // Prevent duplicate pairing requests

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_QR_ATTEMPTS = 5;

let cycleCount = 0;

try {
  if (fs.existsSync(CYCLE_FILE)) {
    cycleCount = JSON.parse(fs.readFileSync(CYCLE_FILE, "utf-8")).count || 0;
  }
} catch (e) {
  cycleCount = 0;
}

function saveCycleCount(count) {
  try {
    fs.writeFileSync(CYCLE_FILE, JSON.stringify({ count }));
  } catch (e) {}
}

const MAX_CYCLES = 3;

/**
 * Calculate reconnect delay with exponential backoff.
 * @param {number} attempt    - Attempt number (1-indexed)
 * @param {boolean} isHard    - true for severe errors (loggedOut/401), false for soft errors
 * @returns {number} delay in ms
 */
function getBackoffDelay(attempt, isHard) {
  if (isHard) {
    // loggedOut/401: 5s → 10s → 20s → 40s → 60s (cap)
    return Math.min(5000 * Math.pow(2, attempt - 1), 60000);
  }
  // Soft errors (timedOut, connectionClosed, etc): 3s → 5s → 7s → ... → 30s (cap)
  return Math.min(3000 + (attempt * 2000), 30000);
}

/**
 * Suspend program — keep event loop alive so PM2 doesn't auto-restart.
 * @param {string} reason - Suspension reason to log
 */
function suspendProgram(reason) {
  isSuspended = true;
  console.log(`${TAG} | 🛑 SUSPENDED: ${reason}`);
  console.log(`${TAG} | To resume, run: pm2 restart ${BOT_ID}`);
  setInterval(() => {}, 1000 * 60 * 60);
}

// ── Graceful Shutdown ───────────────────────────────────────────────────────
// Close WebSocket cleanly before the process dies.
// This PREVENTS false loggedOut errors during PM2 restart.

async function gracefulShutdown(signal) {
  console.log(`${TAG} | Received ${signal}, shutting down gracefully...`);
  if (currentSock) {
    try {
      currentSock.end();
      console.log(`${TAG} | WebSocket closed cleanly.`);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  // Allow 2 seconds for cleanup before exit
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

async function connectToWhatsApp() {
  if (isSuspended) return;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    retryRequestDelayMs: 300,
    maxMsgRetryCount: 10,
    version,
    logger,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    browser: Browsers.macOS("Chrome"),
  });

  currentSock = sock;

  sock.ev.process(async (ev) => {
    // ── Connection lifecycle ────────────────────────────────────
    if (ev["connection.update"]) {
      handleConnectionUpdate(ev["connection.update"], sock);
    }

    // ── Credential persistence ─────────────────────────────────
    if (ev["creds.update"]) {
      await saveCreds();
    }

    // ── Incoming messages ──────────────────────────────────────
    const upsert = ev["messages.upsert"];
    if (upsert) {
      handleMessageUpsert(upsert, sock);
    }

    // ── Call rejection ─────────────────────────────────────────
    if (ev["call"]) {
      handleIncomingCall(ev["call"], sock);
    }
  });
}

// ── Event Handlers ──────────────────────────────────────────────────────────

function handleConnectionUpdate(update, sock) {
  const { connection, lastDisconnect } = update;
  const status = lastDisconnect?.error?.output?.statusCode;

  // ── QR Code / Pairing Code ──────────────────────────────────
  if (update.qr) {
    if (setting.pairingNumber && !pairingCodeRequested) {
      pairingCodeRequested = true;
      (async () => {
        try {
          // Normalize phone number — strip non-digits, apply country code for local format
          let number = setting.pairingNumber.replace(/[^0-9]/g, "");
          if (number.startsWith("0")) {
            number = setting.defaultCountryCode + number.slice(1);
          }
          
          const code = await sock.requestPairingCode(number);
          console.log(`\n======================================================`);
          console.log(`${TAG} | 📱 PAIRING CODE: ${code}`);
          console.log(`======================================================\n`);
        } catch (err) {
          console.error(`${TAG} | ❌ Failed to request Pairing Code:`, err.message);
        }
      })();
    } else if (!setting.pairingNumber) {
      qrCount++;
      if (qrCount >= MAX_QR_ATTEMPTS) {
        return suspendProgram(
          `QR code generated ${qrCount}x without being scanned. ` +
          `Run 'pm2 restart ${BOT_ID}' to try again.`
        );
      }
      console.log(`${TAG} | QR Code (${qrCount}/${MAX_QR_ATTEMPTS}):`);
      qrcode.generate(update.qr, { small: true }, (qr) => console.log(qr));
    }
  }

  // ── Connection Close ────────────────────────────────────────
  if (connection === "close") {
    const reason = Object.entries(DisconnectReason)
      .find((i) => i[1] === status)?.[0] || "unknown";

    console.log(`${TAG} | Closed connection, status: ${reason} (${status})`);

    if (lastDisconnect?.error) {
      console.error(`${TAG} | Error details:`, lastDisconnect.error?.message || lastDisconnect.error);
    }

    // Severe errors: loggedOut, multideviceMismatch, 401, 403
    // Can be transient (network glitch), so still retry.
    const isHardError =
      reason === "loggedOut" ||
      reason === "multideviceMismatch" ||
      status === 403 ||
      status === 401;

    if (isHardError) {
      reconnectAttempts++;

      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        cycleCount++;
        saveCycleCount(cycleCount);

        if (cycleCount >= MAX_CYCLES) {
          // Total failure (MAX_RECONNECT_ATTEMPTS × MAX_CYCLES times).
          // Delete session and suspend — needs new QR scan.
          console.log(`${TAG} | Total failure ${MAX_RECONNECT_ATTEMPTS * MAX_CYCLES}x (${MAX_CYCLES} cycles). Deleting session folder...`);
          try {
            if (fs.existsSync(SESSION_DIR)) {
              fs.rmSync(SESSION_DIR, { recursive: true, force: true });
              console.log(`${TAG} | Session folder deleted successfully.`);
            }
          } catch (err) {
            console.error(`${TAG} | Failed to delete session folder:`, err.message);
          }
          saveCycleCount(0);
          return suspendProgram(
            "Session deleted due to repeated reconnect failures. " +
            `Run 'pm2 restart ${BOT_ID}' to scan a new QR code.`
          );
        }

        // Cycles remaining — suspend, let user restart manually
        reconnectAttempts = 0; // Reset for next cycle
        return suspendProgram(
          `Session failed after ${MAX_RECONNECT_ATTEMPTS} attempts ` +
          `(cycle ${cycleCount}/${MAX_CYCLES}). ` +
          `Run 'pm2 restart ${BOT_ID}' to continue to the next cycle.`
        );
      }

      // Retries remaining — try again with exponential backoff
      const delay = getBackoffDelay(reconnectAttempts, true);
      console.log(
        `${TAG} | Session disconnected (${reason}). ` +
        `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) ` +
        `cycle ${cycleCount + 1}/${MAX_CYCLES} in ${delay / 1000}s...`
      );
      setTimeout(connectToWhatsApp, delay);

    } else {
      // Soft errors: timedOut, connectionClosed, restartRequired, etc.
      // Usually safe to retry immediately.
      reconnectAttempts++;
      const delay = getBackoffDelay(reconnectAttempts, false);
      console.log(`${TAG} | Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);

      // Safety net: prevent infinite loop on persistent soft errors
      if (reconnectAttempts >= 10) {
        reconnectAttempts = 0;
        return suspendProgram(
          "Soft errors occurred 10x in a row. " +
          `Possible VPS network issue. Run 'pm2 restart ${BOT_ID}' to retry.`
        );
      }
      setTimeout(connectToWhatsApp, delay);
    }

  // ── Connection Open ─────────────────────────────────────────
  } else if (connection === "open") {
    // Reset semua counter karena berhasil connect
    reconnectAttempts = 0;
    qrCount = 0;
    pairingCodeRequested = false;
    if (cycleCount > 0) {
      cycleCount = 0;
      saveCycleCount(0);
    }
    
    console.log(`${TAG} | ✅ Connected: ${jidDecode(sock?.user?.id)?.user}`);
    
    // ── Auto-Discovery Heartbeat ─────────────────────────────
    if (registryInterval) clearInterval(registryInterval);
    const myJid = sock.user.id.includes(":") ? sock.user.id.split(":")[0] + "@s.whatsapp.net" : sock.user.id;
    upsertBotRegistry(BOT_ID, myJid);
    registryInterval = setInterval(() => {
        upsertBotRegistry(BOT_ID, myJid);
    }, 60000);
  }
}

function handleMessageUpsert(upsert, sock) {
  const message = Messages(upsert, sock);
  if (!message) return;

  if (upsert.type !== "notify") {
    if (!(upsert.type === "append" && message.key && message.key.fromMe)) {
      return;
    }
    // Jangan proses pesan append yang sudah terlalu lama (history sync)
    const now = Math.floor(Date.now() / 1000);
    if (now - message.messageTimestamp > 60) return;
  }

  if (message.key && message.key.remoteJid === "status@broadcast") return;

  // fromMe is allowed so the bot owner can process their own commands
  msgHandler(upsert, sock, message);
}

// ── Call Dedup (prevents Baileys from firing multiple events per call) ──────
const processedCalls = new Map();
const CALL_DEDUP_TTL = 60_000; // 60 seconds

setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of processedCalls) {
    if (now - ts > CALL_DEDUP_TTL) processedCalls.delete(id);
  }
}, 600000); // Cleanup every 10 minutes

async function handleIncomingCall(callEvent, sock) {
  const call = callEvent[0];
  if (!call) return;
  
  const { id, chatId, isGroup, status } = call;
  if (isGroup) return;

  // Reject call
  await sock.rejectCall(id, chatId).catch(() => {});

  // Prevent duplicate call events from Baileys (multiple events per single call)
  // Only process if status is 'offer' or ID hasn't been processed before
  if (status && status !== "offer") return;
  
  if (processedCalls.has(id)) return;
  processedCalls.set(id, Date.now());

  // Resolve chatId to canonical PN — chatId may be LID in newer addressing modes
  const { jid: resolvedJid, baseId } = resolveTarget(chatId);
  const userId = resolvedJid || chatId; // Fallback to raw chatId if resolve fails

  // Exempt owners from ban penalties (call is still rejected above)
  const normalizeNum = (n) => n.replace(/^\+/, "").replace(/^0/, setting.defaultCountryCode);
  if (setting.owner.some(num => normalizeNum(num) === baseId)) return;

  // Track warnings and auto-ban
  const user = getUser(userId);
  if (user.banned) return; // Already banned — silent drop

  user.meta = user.meta || {};
  user.meta.callCount = (user.meta.callCount || 0) + 1;
  saveUser(userId, user);

  if (user.meta.callCount >= 4) {
    banUser(userId, sock.user.id, "Repeated voice/video call spam");
    await sock.sendMessage(
      chatId,
      { text: "🚫 You have been globally banned for repeatedly calling the bot." }
    ).catch(() => {});
  } else {
    let warningText = `⚠️ This bot does not accept voice/video calls.`;
    if (user.meta.callCount === 3) {
      warningText += `\n\n*Final warning!* One more call and you will be globally banned.`;
    } else {
      warningText += `\n\n_Warning ${user.meta.callCount}/3. After 3 warnings, automatic global ban._`;
    }
    
    await sock.sendMessage(
      chatId,
      { text: warningText }
    ).catch(() => {});
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
connectToWhatsApp();

// ── Hot-Reload ──────────────────────────────────────────────────────────────
// Watch handler.js for pipeline changes
const handlerWatcher = chokidar.watch("./handler.js", {
  ignored: /(^|[/\\])\../,
  persistent: true,
});

let handlerReloadCount = 0;

handlerWatcher.on("change", async (filePath) => {
  console.log(`[HOT-RELOAD] handler.js changed`);
  try {
    const newModule = await import(`./handler.js?cacheBust=${Date.now()}`);
    msgHandler = newModule.msgHandler;
    handlerReloadCount++;
    console.log(`[HOT-RELOAD] Handler updated ✅ (reload #${handlerReloadCount})`);
    if (handlerReloadCount >= 20) {
      console.warn(`[HOT-RELOAD] ⚠️ ${handlerReloadCount} reloads — ESM cache-busting causes gradual memory leak. Consider 'pm2 restart ${BOT_ID}' to reclaim memory.`);
    }
  } catch (err) {
    console.error("[HOT-RELOAD] Handler reload failed ❌", err.message);
  }
});

// Watch commands/ directory for new or changed command files
const commandWatcher = chokidar.watch(commandsDir, {
  ignored: /(^|[/\\])(_|\.)/, // ignore dotfiles and files starting with _
  persistent: true,
  ignoreInitial: true,        // don't fire for files that already exist on startup
});

commandWatcher.on("add", async (filePath) => {
  // New command file added
  if (!filePath.endsWith(".js")) return;
  console.log(`[HOT-RELOAD] New command file detected: ${filePath}`);
  await reloadCommand(filePath);
});

commandWatcher.on("change", async (filePath) => {
  // Existing command file changed
  if (!filePath.endsWith(".js")) return;
  await reloadCommand(filePath);
});
