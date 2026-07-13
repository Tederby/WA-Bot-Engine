import 'dotenv/config';

const setting = {
    // ── Bot Instance Identity ───────────────────────────────────────────
    botId: process.env.BOT_ID || "default",
    name: process.env.BOT_NAME || "MyBot",
    owner: (process.env.OWNER_NUMBERS || process.env.OWNER_NUMBER || "").split(",").map(v => v.trim()).filter(Boolean),
    prefixes: (process.env.PREFIXES || "!.#/-").split(""),
    pairingNumber: process.env.PAIRING_NUMBER || "",

    // ── Spam Filter ─────────────────────────────────────────────────────
    spamDelay: Number(process.env.SPAM_DELAY) || 5000, // ms cooldown per chat

    // ── Cleanup ─────────────────────────────────────────────────────────
    tempDir: `./temp/${process.env.BOT_ID || "default"}`,
    cleanupInterval: 10 * 60 * 1000,     // Scan every 10 minutes
    fileExpiry: 30 * 60 * 1000,          // Delete temp files older than 30 minutes
    replyHandlerExpiry: 15 * 60 * 1000,  // Expire reply handlers after 15 minutes
    claimsPurgeAge: 5 * 60 * 1000,       // Purge message claims older than 5 minutes
    vacuumInterval: 30 * 60 * 1000,      // Run SQLite VACUUM every 30 minutes
};

export default setting;