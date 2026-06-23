/**
 * ytdl — Quick Download
 *
 * Downloads with the best auto-selected format (≤720p by default).
 * If the estimated size exceeds the WhatsApp video limit (64 MB),
 * the bot cascades down to lower resolutions automatically.
 * Sends the result as an inline-playable video.
 */

import fs from "fs";
import { getCachedInfo } from "../services/infoCache.js";
import { download, formatDuration, getPlatformName, formatSize, getBestFormatUnderLimit } from "../services/ytdlp.js";
import { downloadQueue } from "../services/downloadQueue.js";
import { tryDelete } from "../services/cleanup.js";
import { isUrl, sanitizeFilename } from "../lib/utils.js";
import setting from "../setting.js";

export default {
    name: "ytdl",
    aliases: ["yt", "video", "ytv", "mp4"],
    category: "download",
    description: "Quick video/audio download (auto format)",
    usage: "!ytdl <url>",

    async handler({ message, sock, args, prefix }) {
        const url = args[0];
        if (!url || !isUrl(url)) {
            return message.reply("❌ Masukkan URL yang valid.\nContoh: `!ytdl https://youtube.com/watch?v=xxx`");
        }

        // ── 1. Fetch info ───────────────────────────────────────────
        const update = await message.replyUpdate("⏳ Mengambil info video & memilih format terbaik...");
        let info;
        try {
            info = await getCachedInfo(url);
        } catch (err) {
            return update("❌ Gagal mengambil info. URL mungkin tidak valid atau tidak didukung.");
        }

        const title = info.title || "Untitled";
        const duration = formatDuration(info.duration);
        const platform = getPlatformName(info.extractor_key);

        // ── 2. Find best format that fits under the video size limit ─
        const maxSize = setting.ytdlp.maxFileSize;
        const bestFormatInfo = getBestFormatUnderLimit(info.formats, maxSize);

        let chosenFormat = "bv*[height<=720]+ba/b"; // fallback
        if (bestFormatInfo) {
            chosenFormat = bestFormatInfo.formatStr;
        }

        // ── 3. Acquire queue slot ───────────────────────────────────
        const queuePos = downloadQueue.pending;
        if (queuePos > 0) {
            await update(`📋 Antrian ke-${queuePos + 1}. Mohon tunggu...`);
        }
        await downloadQueue.acquire();

        let filePath;
        try {
            // ── 4. Download ─────────────────────────────────────────
            await update(`⏳ Mengunduh *${title}*...`);

            filePath = await download(url, chosenFormat, title, "auto");

            // ── 5. Check actual file size ───────────────────────────
            const stat = fs.statSync(filePath);
            if (stat.size > maxSize) {
                // File too large even after cascade → send as document instead
                await update(`⏳ Mengirim sebagai dokumen (${formatSize(stat.size)})...`);
                await sock.sendMessage(message.chat, {
                    document: fs.readFileSync(filePath),
                    mimetype: "video/mp4",
                    fileName: `${sanitizeFilename(title)}.mp4`,
                    caption: [
                        `🎬 *${title}*`,
                        `📏 Durasi: ${duration}`,
                        `🌐 Platform: ${platform}`,
                        `📦 Ukuran: ${formatSize(stat.size)}`,
                        ``,
                        `💡 Gunakan \`${prefix}ytdlf\` untuk format kustom`,
                    ].join("\n"),
                }, { quoted: message, ephemeralExpiration: message.contextInfo?.expiration });
            } else {
                // ── 6. Send as inline video ─────────────────────────
                await update("✅ Berhasil!");
                await sock.sendMessage(message.chat, {
                    video: fs.readFileSync(filePath),
                    caption: [
                        `🎬 *${title}*`,
                        `📏 Durasi: ${duration}`,
                        `🌐 Platform: ${platform}`,
                        ``,
                        `💡 Gunakan \`${prefix}ytdlf\` untuk format kustom`,
                    ].join("\n"),
                }, { quoted: message, ephemeralExpiration: message.contextInfo?.expiration });
            }
        } catch (err) {
            console.error("[ytdl]", err);
            await update("❌ Gagal mengunduh. " + (err.message || "Coba lagi nanti."));
        } finally {
            tryDelete(filePath);
            downloadQueue.release();
        }
    }
};

// ── Helpers ─────────────────────────────────────────────────────────────────


