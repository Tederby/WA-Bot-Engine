/**
 * Entry Point — WhatsApp Bot
 *
 * Responsibilities:
 *  1. Initialize Baileys connection
 *  2. Handle connection lifecycle (QR, reconnect, session cleanup)
 *  3. Route incoming messages and events
 *  4. Hot-reload handler + commands on file changes
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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
import { initReminders } from "./services/reminder.js";
import { reloadCommand, initCommands, commandsDir } from "./commands/_registry.js";
import { handleGroupParticipantsUpdate } from "./lib/events/group-participants.js";
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

let currentSock = null;          // Referensi socket aktif (untuk graceful shutdown)
let reconnectAttempts = 0;       // Retry counter per siklus
let qrCount = 0;                 // Berapa kali QR di-generate tanpa di-scan
let isSuspended = false;         // Flag agar tidak reconnect setelah suspend

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
 * Hitung delay reconnect dengan exponential backoff.
 * @param {number} attempt    - Percobaan ke-berapa (1-indexed)
 * @param {boolean} isHard    - true untuk error berat (loggedOut/401), false untuk error ringan
 * @returns {number} delay dalam ms
 */
function getBackoffDelay(attempt, isHard) {
  if (isHard) {
    // loggedOut/401: 5s → 10s → 20s → 40s → 60s (cap)
    return Math.min(5000 * Math.pow(2, attempt - 1), 60000);
  }
  // Error ringan (timedOut, connectionClosed, dll): 3s → 5s → 7s → ... → 30s (cap)
  return Math.min(3000 + (attempt * 2000), 30000);
}

/**
 * Suspend program — tahan event loop agar PM2 tidak auto-restart.
 * @param {string} reason - Alasan suspend untuk di-log
 */
function suspendProgram(reason) {
  isSuspended = true;
  console.log(`${TAG} | 🛑 SUSPENDED: ${reason}`);
  console.log(`${TAG} | Untuk melanjutkan, jalankan: pm2 restart ${BOT_ID}`);
  setInterval(() => {}, 1000 * 60 * 60);
}

// ── Graceful Shutdown ───────────────────────────────────────────────────────
// Tutup WebSocket dengan benar sebelum proses mati.
// Ini MENCEGAH false loggedOut saat PM2 restart.

async function gracefulShutdown(signal) {
  console.log(`${TAG} | Received ${signal}, shutting down gracefully...`);
  if (currentSock) {
    try {
      currentSock.end();
      console.log(`${TAG} | WebSocket closed cleanly.`);
    } catch (e) {
      // Abaikan error saat cleanup
    }
  }
  // Beri waktu 2 detik untuk cleanup sebelum exit
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

  initReminders(sock);

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
      handleIncomingCall(ev["call"], sock, upsert);
    }

    // ── Group Participants Update ──────────────────────────────
    if (ev["group-participants.update"]) {
      handleGroupParticipantsUpdate(ev["group-participants.update"], sock);
    }
  });
}

// ── Event Handlers ──────────────────────────────────────────────────────────

function handleConnectionUpdate(update, sock) {
  const { connection, lastDisconnect } = update;
  const status = lastDisconnect?.error?.output?.statusCode;

  // ── QR Code ─────────────────────────────────────────────────
  if (update.qr) {
    qrCount++;
    if (qrCount >= MAX_QR_ATTEMPTS) {
      return suspendProgram(
        `QR code sudah di-generate ${qrCount}x tanpa di-scan. ` +
        `Jalankan 'pm2 restart ${BOT_ID}' untuk mencoba lagi.`
      );
    }
    console.log(`${TAG} | QR Code (${qrCount}/${MAX_QR_ATTEMPTS}):`);
    qrcode.generate(update.qr, { small: true }, (qr) => console.log(qr));
  }

  // ── Connection Close ────────────────────────────────────────
  if (connection === "close") {
    const reason = Object.entries(DisconnectReason)
      .find((i) => i[1] === status)?.[0] || "unknown";

    console.log(`${TAG} | Closed connection, status: ${reason} (${status})`);

    if (lastDisconnect?.error) {
      console.error(`${TAG} | Error details:`, lastDisconnect.error?.message || lastDisconnect.error);
    }

    // Error berat: loggedOut, multideviceMismatch, 401, 403
    // Kadang bersifat transient (network glitch), jadi masih dicoba retry.
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
          // Sudah gagal total (MAX_RECONNECT_ATTEMPTS × MAX_CYCLES kali).
          // Hapus session dan suspend — butuh scan QR baru.
          console.log(`${TAG} | Gagal total ${MAX_RECONNECT_ATTEMPTS * MAX_CYCLES}x (${MAX_CYCLES} siklus). Menghapus folder session...`);
          try {
            if (fs.existsSync(SESSION_DIR)) {
              fs.rmSync(SESSION_DIR, { recursive: true, force: true });
              console.log(`${TAG} | Folder session berhasil dihapus.`);
            }
          } catch (err) {
            console.error(`${TAG} | Gagal menghapus folder session:`, err.message);
          }
          saveCycleCount(0);
          return suspendProgram(
            "Session dihapus karena gagal reconnect berulang kali. " +
            `Jalankan 'pm2 restart ${BOT_ID}' untuk scan QR baru.`
          );
        }

        // Siklus belum habis — suspend, biarkan user restart manual
        reconnectAttempts = 0; // Reset untuk siklus berikutnya
        return suspendProgram(
          `Sesi gagal setelah ${MAX_RECONNECT_ATTEMPTS} percobaan ` +
          `(siklus ${cycleCount}/${MAX_CYCLES}). ` +
          `Jalankan 'pm2 restart ${BOT_ID}' untuk melanjutkan ke siklus berikutnya.`
        );
      }

      // Masih ada sisa retry — coba lagi dengan exponential backoff
      const delay = getBackoffDelay(reconnectAttempts, true);
      console.log(
        `${TAG} | Sesi terputus (${reason}). ` +
        `Mencoba reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) ` +
        `siklus ${cycleCount + 1}/${MAX_CYCLES} dalam ${delay / 1000}s...`
      );
      setTimeout(connectToWhatsApp, delay);

    } else {
      // Error ringan: timedOut, connectionClosed, restartRequired, dll.
      // Biasanya bisa langsung retry.
      reconnectAttempts++;
      const delay = getBackoffDelay(reconnectAttempts, false);
      console.log(`${TAG} | Mencoba reconnect dalam ${delay / 1000}s... (attempt ${reconnectAttempts})`);

      // Safety net: jika error ringan terus-menerus, jangan infinite loop
      if (reconnectAttempts >= 10) {
        reconnectAttempts = 0;
        return suspendProgram(
          "Error ringan terjadi 10x berturut-turut. " +
          `Kemungkinan ada masalah network VPS. Jalankan 'pm2 restart ${BOT_ID}' untuk retry.`
        );
      }
      setTimeout(connectToWhatsApp, delay);
    }

  // ── Connection Open ─────────────────────────────────────────
  } else if (connection === "open") {
    // Reset semua counter karena berhasil connect
    reconnectAttempts = 0;
    qrCount = 0;
    if (cycleCount > 0) {
      cycleCount = 0;
      saveCycleCount(0);
    }
    console.log(`${TAG} | ✅ Connected: ${jidDecode(sock?.user?.id)?.user}`);
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

  // fromMe diizinkan agar pemilik bot bisa memproses command
  msgHandler(upsert, sock, message);
}

async function handleIncomingCall(callEvent, sock, upsert) {
  const { id, chatId, isGroup } = callEvent[0];
  if (isGroup) return;

  await sock.rejectCall(id, chatId);
  await sock.sendMessage(
    chatId,
    { text: "Tidak bisa menerima panggilan suara/video." },
    { ephemeralExpiration: upsert?.messages[0]?.contextInfo?.expiration }
  );
}

// ── Start ───────────────────────────────────────────────────────────────────
connectToWhatsApp();

// ── Hot-Reload ──────────────────────────────────────────────────────────────
// Watch handler.js for pipeline changes
const handlerWatcher = chokidar.watch("./handler.js", {
  ignored: /(^|[/\\])\../,
  persistent: true,
});

handlerWatcher.on("change", async (filePath) => {
  console.log(`[HOT-RELOAD] handler.js changed`);
  try {
    const newModule = await import(`./handler.js?cacheBust=${Date.now()}`);
    msgHandler = newModule.msgHandler;
    console.log("[HOT-RELOAD] Handler updated ✅");
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
