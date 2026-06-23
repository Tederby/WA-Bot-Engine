import { searchYouTube } from "../services/youtube.js";
import { registerReplyHandler, deleteReplyHandler } from "./_registry.js";
import { download, getBestFormatUnderLimit } from "../services/ytdlp.js";
import { getCachedInfo } from "../services/infoCache.js";
import fs from "fs";
import { tryDelete } from "../services/cleanup.js";
import { downloadQueue } from "../services/downloadQueue.js";
import { sanitizeFilename } from "../lib/utils.js";
import setting from "../setting.js";

const ITEMS_PER_PAGE = 5;

function generatePaginator(page, totalPages) {
    if (totalPages <= 1) return `[ 📄 Page 1/1 ] ─── ━━━━━━━━━━━━━━━━`;
    let items = [];
    let startP = Math.max(0, page - 2);
    let endP = Math.min(totalPages - 1, page + 2);
    for (let i = startP; i <= endP; i++) {
        let pNum = i + 1;
        if (i === page) items.push(`*${pNum}*`);
        else items.push(`${pNum}`);
    }
    let bar = items.join(" ─ ");
    return `[ 📄 Page ${page + 1}/${totalPages} ] ─── « ─ ${bar} ─ »`;
}

function generateListText(results, page, query) {
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentItems = results.slice(start, end);

    let text = `╭━━━〔 🟥 YOUTUBE SEARCH 〕━━━\n`;
    text += `┃ 🔍 Query : ${query}\n`;
    text += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    currentItems.forEach((video, index) => {
        text += `╭───「 ${start + index + 1}. ${video.title} 」\n`;
        text += `│ 👤 ${video.channelTitle} | ⏱️ ${video.duration}\n`;
        text += `╰──────────────\n\n`;
    });

    text += generatePaginator(page, totalPages) + "\n\n";
    text += `💡 _Reply angka (1-${currentItems.length}) untuk memilih. Ketik "n" next, "b" back._`;

    return text.trim();
}

export default {
    name: "ytsearch",
    aliases: ["yts", "youtubesearch"],
    category: "download",
    description: "Mencari video YouTube dan mendownloadnya",
    usage: "!yts <query>",
    async handler({ message, args, sock, sender, prefix }) {
        if (args.length === 0) {
            return message.reply(`❌ Berikan kata kunci pencarian.\nContoh: \`${prefix}yts naruto opening\``);
        }

        const query = args.join(" ");
        const sentMsg = await sock.sendMessage(message.chat, { text: "⏳ Sedang mencari di YouTube..." }, { quoted: message });

        try {
            const results = await searchYouTube(query, 20);

            if (results.length === 0) {
                await sock.sendMessage(message.chat, { text: `❌ Video dengan kata kunci *${query}* tidak ditemukan.`, edit: sentMsg.key });
                return;
            }

            const textList = generateListText(results, 0, query);

            await sock.sendMessage(message.chat, { text: textList, edit: sentMsg.key });

            registerReplyHandler(sentMsg.key.id, listReplyHandler, {
                results,
                page: 0,
                query,
                userId: sender,
                messageKey: sentMsg.key,
                prefix
            });

        } catch (err) {
            console.error("[YTSearch]", err);
            await sock.sendMessage(message.chat, { text: `❌ Terjadi kesalahan: ${err.message || "Gagal mencari video"}`, edit: sentMsg.key });
        }
    }
};

async function listReplyHandler({ message, sock, state }) {
    const text = message.text.toLowerCase().trim();
    const { results, page, query, messageKey, prefix } = state;
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);

    if (text === "n" || text === "next") {
        if (page < totalPages - 1) {
            state.page += 1;
            const newText = generateListText(results, state.page, query);
            await sock.sendMessage(message.chat, { text: newText, edit: messageKey });
        }
        return;
    }

    if (text === "b" || text === "back") {
        if (page > 0) {
            state.page -= 1;
            const newText = generateListText(results, state.page, query);
            await sock.sendMessage(message.chat, { text: newText, edit: messageKey });
        }
        return;
    }

    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= results.length) {
        const video = results[num - 1];

        // Hapus handler lama
        deleteReplyHandler(messageKey.id);

        // Edit list menjadi indikator pilihan
        await sock.sendMessage(message.chat, { text: `>> *${video.title}*`, edit: messageKey });

        // Kirim detail video baru (tanpa thumbnail agar lebih imersif dan cepat)
        let detailText = `🎬 *${video.title}*\n\n`;
        detailText += `👤 *Creator:* ${video.channelTitle}\n`;
        detailText += `⏱️ *Durasi:* ${video.duration}\n`;
        detailText += `🔗 *URL:* ${video.url}\n\n`;
        detailText += `💡 _Balas pesan ini dengan \`mp4\` atau \`mp3\` *TANPA PREFIX* untuk mendownload._\n`;
        detailText += `_(Tambahkan \`-docs\` untuk mengirim via dokumen)_`;

        const detailMsg = await sock.sendMessage(message.chat, { text: detailText }, { quoted: message });

        registerReplyHandler(detailMsg.key.id, downloadReplyHandler, {
            video,
            messageKey: detailMsg.key,
            userId: state.userId,
            commandName: "ytsearch-download"
        });

        return;
    }
}

async function downloadReplyHandler({ message, sock, state }) {
    const text = message.text.toLowerCase().trim();
    const args = text.split(" ");
    const format = args[0]; // mp4 or mp3
    const isDocs = args.includes("-docs");

    if (format !== "mp4" && format !== "mp3") return; // Abaikan jika bukan command yg tepat

    const { video, messageKey } = state;

    // Ubah pesan detail menjadi loading
    await sock.sendMessage(message.chat, { text: `⏳ Mengunduh *${video.title}* sebagai ${format.toUpperCase()}...`, edit: messageKey });

    deleteReplyHandler(messageKey.id);

    try {
        let formatStr = "ba";
        if (format === "mp4") {
            const maxSize = setting.ytdlp.maxFileSize;
            try {
                const info = await getCachedInfo(video.url);
                const bestFormatInfo = getBestFormatUnderLimit(info.formats, maxSize);
                formatStr = bestFormatInfo ? bestFormatInfo.formatStr : "bv*[height<=720]+ba/b";
            } catch (e) {
                formatStr = "bv*[height<=720]+ba/b";
            }
        }

        await downloadQueue.acquire();
        let filePath;
        try {
            filePath = await download(video.url, formatStr, video.title, format);
        } finally {
            downloadQueue.release();
        }

        const stat = fs.statSync(filePath);
        const maxSize = setting.ytdlp.maxFileSize;
        const captionStr = `🎬 *${video.title}*\n🔗 ${video.url}`;

        // Jika resolusi tinggi membuat file terlalu besar, akan di fallback sebagai dokumen
        if (stat.size > maxSize) {
            await sock.sendMessage(message.chat, { text: `⏳ File besar, mengirim sebagai dokumen...`, edit: messageKey });
            await sock.sendMessage(message.chat, {
                document: fs.readFileSync(filePath),
                mimetype: format === "mp4" ? "video/mp4" : "audio/mpeg",
                fileName: `${sanitizeFilename(video.title)}.${format}`,
                caption: captionStr
            }, { quoted: message });
        } else {
            if (isDocs) {
                await sock.sendMessage(message.chat, {
                    document: fs.readFileSync(filePath),
                    mimetype: format === "mp4" ? "video/mp4" : "audio/mpeg",
                    fileName: `${sanitizeFilename(video.title)}.${format}`,
                    caption: captionStr
                }, { quoted: message });
            } else {
                if (format === "mp4") {
                    await sock.sendMessage(message.chat, {
                        video: fs.readFileSync(filePath),
                        caption: captionStr
                    }, { quoted: message });
                } else {
                    await sock.sendMessage(message.chat, {
                        audio: fs.readFileSync(filePath),
                        mimetype: "audio/mp4"
                    }, { quoted: message });
                }
            }
        }

        await sock.sendMessage(message.chat, {
            text: `✅ Berhasil dikirim!\n💡 Reply pesan ini dalam 60 detik dengan \`-docs\` untuk meminta file ini sebagai dokumen, atau \`-resend\` untuk media.`,
            edit: messageKey
        });

        // Timeout logic untuk menghapus file dari cache sementara
        const timeoutId = setTimeout(async () => {
            deleteReplyHandler(messageKey.id);
            tryDelete(filePath);
            await sock.sendMessage(message.chat, { text: `✅ Berhasil dikirim!`, edit: messageKey }).catch(() => { });
        }, 60000);

        registerReplyHandler(messageKey.id, resendReplyHandler, {
            filePath,
            video,
            format,
            messageKey,
            timeoutId,
            userId: state.userId
        });

    } catch (err) {
        console.error("[YTSearch Download]", err);
        await sock.sendMessage(message.chat, { text: `❌ Gagal mengunduh: ${err.message || "Coba lagi nanti."}`, edit: messageKey });
    }
}

async function resendReplyHandler({ message, sock, state }) {
    const text = message.text.toLowerCase().trim();
    if (text !== "-docs" && text !== "-resend") return;

    const { filePath, video, format, messageKey, timeoutId } = state;

    // Clear the timeout so it doesn't delete our file while we send
    clearTimeout(timeoutId);
    // Remove handler immediately
    deleteReplyHandler(messageKey.id);

    try {
        await sock.sendMessage(message.chat, { text: `⏳ Mengirim ulang...`, edit: messageKey });
        const isDocs = text === "-docs";
        const captionStr = `🎬 *${video.title}*\n🔗 ${video.url}`;

        if (isDocs) {
            await sock.sendMessage(message.chat, {
                document: fs.readFileSync(filePath),
                mimetype: format === "mp4" ? "video/mp4" : "audio/mpeg",
                fileName: `${sanitizeFilename(video.title)}.${format}`,
                caption: captionStr
            }, { quoted: message });
        } else {
            if (format === "mp4") {
                await sock.sendMessage(message.chat, {
                    video: fs.readFileSync(filePath),
                    caption: captionStr
                }, { quoted: message });
            } else {
                await sock.sendMessage(message.chat, {
                    audio: fs.readFileSync(filePath),
                    mimetype: "audio/mp4"
                }, { quoted: message });
            }
        }
        await sock.sendMessage(message.chat, { text: `✅ Berhasil dikirim!`, edit: messageKey });
    } catch (err) {
        console.error("[YTSearch Resend]", err);
        await sock.sendMessage(message.chat, { text: `❌ Gagal mengirim ulang.`, edit: messageKey });
    } finally {
        tryDelete(filePath);
    }
}
