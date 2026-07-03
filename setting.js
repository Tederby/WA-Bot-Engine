import 'dotenv/config';

const setting = {
    // ── Bot Instance Identity ───────────────────────────────────────────
    botId: process.env.BOT_ID || "default",
    name: process.env.BOT_NAME || "Tederby18",
    owner: (process.env.OWNER_NUMBERS || process.env.OWNER_NUMBER || "6287825136146").split(",").map(v => v.trim()),
    prefixes: (process.env.PREFIXES || "!.#/-").split(""),

    // ── yt-dlp ──────────────────────────────────────────────────────────
    ytdlp: {
        tempDir: `./temp/${process.env.BOT_ID || "default"}`,
        maxFileSize: 64 * 1024 * 1024,           // 64MB (WhatsApp video limit)
        maxFileSizeDoc: 2 * 1024 * 1024 * 1024,   // 2GB (WhatsApp doc limit)
        stateExpiry: 15 * 60 * 1000,              // 15 menit
        fileExpiry: 30 * 60 * 1000,               // 30 menit
        cleanupInterval: 10 * 60 * 1000,          // Scan setiap 10 menit
        cacheExpiry: 10 * 60 * 1000,              // 10 menit
        maxConcurrent: 4,                          // Max downloads global
        defaultFormats: [
            "bv*[vcodec^=avc][height<=720]+ba[ext=m4a]/bv*[ext=mp4][height<=720]+ba[ext=m4a]/bv*[height<=720]+ba/b",
            "bv*[height<=480]+ba/b",
            "bv*[height<=360]+ba/b",
            "b"                                    // Fallback: best single file
        ],
        processTimeout: 5 * 60 * 1000,            // 5 menit timeout
        purgeOnStartup: true,
    },

    // ── Steam ────────────────────────────────────────────────────────────
    steam: {
        apiKey: process.env.STEAM_API_KEY || "",
    },

    // ── Spam Filter ─────────────────────────────────────────────────────
    spamDelay: Number(process.env.SPAM_DELAY) || 5000, // ms cooldown per chat
};

export default setting;