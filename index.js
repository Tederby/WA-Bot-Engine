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

// ── Initialize command registry (must happen after all static imports settle) ─
await initCommands();

// ── Dynamic handler (supports hot-reload) ───────────────────────────────────
let { msgHandler } = await import("./handler.js");

// ── Start services ──────────────────────────────────────────────────────────
initCleanup();

// ── Baileys logger ──────────────────────────────────────────────────────────
const logger = Pino({ level: "silent" });

// ── Connection ──────────────────────────────────────────────────────────────

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
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

  // QR code display
  if (update.qr) {
    qrcode.generate(update.qr, { small: true }, (qr) => console.log(qr));
  }

  if (connection === "close") {
    const reason = Object.entries(DisconnectReason)
      .find((i) => i[1] === status)?.[0] || "unknown";

    console.log(`session | Closed connection, status: ${reason} (${status})`);

    if (lastDisconnect?.error) {
      console.error("session | Error details:", lastDisconnect.error?.message || lastDisconnect.error);
    }

    // Sesi tidak bisa diselamatkan
    const isUnrecoverable =
      reason === "loggedOut" ||
      reason === "multideviceMismatch" ||
      status === 403 ||
      status === 401;

    if (isUnrecoverable) {
      console.log(`session | Sesi tidak bisa diselamatkan (${reason || status}). Menghapus folder session...`);
      try {
        if (fs.existsSync("./session")) {
          fs.rmSync("./session", { recursive: true, force: true });
          console.log("session | Folder session berhasil dihapus.");
        }
      } catch (err) {
        console.error("session | Gagal menghapus folder session:", err.message);
      }
      console.log("session | Memulai ulang untuk generate QR Code baru...");
    } else {
      console.log("session | Mencoba reconnect...");
    }

    connectToWhatsApp();
  } else if (connection === "open") {
    console.log(`session Connected: ${jidDecode(sock?.user?.id)?.user}`);
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
