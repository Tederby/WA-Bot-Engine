import axios from "axios";
import { registerReplyHandler } from "./_registry.js";

const ITEMS_PER_PAGE = 5;

function generateListText(results, page, query) {
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentItems = results.slice(start, end);

    let text = `📚 *Hasil Pencarian Manga/LN: ${query}* (Page ${page + 1}/${totalPages})\n\n`;
    
    currentItems.forEach((manga, index) => {
        text += `${start + index + 1}. *${manga.title}* (${manga.type || "N/A"})\n`;
        text += `   ⭐ Score: ${manga.score || "N/A"} | 📝 Ch: ${manga.chapters || "N/A"}\n\n`;
    });

    text += `Balas pesan ini dengan:\n`;
    text += `👉 *Angka (1-${results.length})* untuk melihat detail info\n`;
    if (page < totalPages - 1) text += `👉 *'n'* atau *'next'* untuk halaman selanjutnya\n`;
    if (page > 0) text += `👉 *'b'* atau *'back'* untuk halaman sebelumnya\n`;

    return text.trim();
}

export default {
    name: "manga",
    aliases: ["ln", "lightnovel", "comic", "manhwa"],
    category: "anime",
    description: "Mencari daftar Manga / Light Novel dari MyAnimeList",
    usage: "!manga <judul manga/LN>",
    async handler({ message, args, sock }) {
        if (args.length === 0) {
            await message.reply("❌ Berikan judul manga atau light novel yang ingin dicari.\nContoh: `!manga solo leveling`\n\n💡 *Tip:* Tambahkan `-1` atau `--top` untuk langsung mendapatkan hasil paling relevan tanpa memilih list. Contoh: `!manga solo leveling -1`");
            return;
        }

        let isDirect = false;
        const cleanArgs = [];
        const directFlags = ["--top", "-t", "-1", "--direct", "top"];
        
        for (const arg of args) {
            if (directFlags.includes(arg.toLowerCase())) {
                isDirect = true;
            } else {
                cleanArgs.push(arg);
            }
        }

        const query = cleanArgs.join(" ");

        if (!query) {
            await message.reply("❌ Berikan judul manga/LN yang ingin dicari.\nContoh: `!manga solo leveling -1`");
            return;
        }

        try {
            const response = await axios.get(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=20`);
            
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                await message.reply(`❌ Manga/Light Novel dengan kata kunci *${query}* tidak ditemukan di database.`);
                return;
            }

            const results = response.data.data;

            if (isDirect) {
                await sendMangaDetail(results[0], message, sock);
                return;
            }

            const text = generateListText(results, 0, query);

            const sentMsg = await sock.sendMessage(message.chat, { text }, { quoted: message });
            
            // Register reply handler
            registerReplyHandler(sentMsg.key.id, replyHandler, {
                results,
                page: 0,
                query,
                userId: message.sender,
                messageKey: sentMsg.key,
                commandName: "manga"
            });

        } catch (err) {
            console.error("Manga Command Error:", err);
            await message.reply(`❌ Terjadi kesalahan saat mencari manga: ${err.message}`);
        }
    }
};

async function replyHandler({ message, sock, state }) {
    const text = message.text.toLowerCase().trim();
    const { results, page, query, messageKey } = state;
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
        const manga = results[num - 1];
        await sendMangaDetail(manga, message, sock);
        return;
    }
}

async function sendMangaDetail(manga, message, sock) {
    const title = manga.title || "N/A";
    const titleEng = manga.title_english ? ` (${manga.title_english})` : "";
    const status = manga.status || "N/A";
    const chapters = manga.chapters || "Unknown";
    const volumes = manga.volumes || "Unknown";
    const type = manga.type || "N/A";
    const score = manga.score || "N/A";
    const rank = manga.rank || "N/A";
    const popularity = manga.popularity || "N/A";
    const authors = manga.authors && manga.authors.length > 0 ? manga.authors.map(a => a.name).join(", ") : "N/A";

    const url = manga.url;
    const genres = manga.genres && manga.genres.length > 0 ? manga.genres.map(g => g.name).join(", ") : "N/A";
    
    let synopsis = "Tidak ada sinopsis.";
    if (manga.synopsis) {
        synopsis = manga.synopsis.replace(/\[Written by MAL Rewrite\]/i, "").trim();
    }
    
    let imageUrl = null;
    if (manga.images?.jpg?.large_image_url) {
        imageUrl = manga.images.jpg.large_image_url;
    } else if (manga.images?.jpg?.image_url) {
        imageUrl = manga.images.jpg.image_url;
    }

    let captionText = `📚 *${title}*${titleEng}\n\n`;
    captionText += `⭐ *Score:* ${score}\n`;
    captionText += `🏆 *Rank:* #${rank} | 📈 *Popularity:* #${popularity}\n`;
    captionText += `📖 *Type:* ${type}\n`;
    captionText += `📝 *Chapters:* ${chapters} | 📚 *Volumes:* ${volumes}\n`;
    captionText += `⏳ *Status:* ${status}\n`;
    captionText += `✍️ *Author:* ${authors}\n`;
    captionText += `🎭 *Genres:* ${genres}\n\n`;
    captionText += `📝 *Synopsis:*\n${synopsis}\n\n`;
    captionText += `🔗 *MyAnimeList:* ${url}`;

    if (imageUrl) {
        await sock.sendMessage(
            message.chat,
            {
                image: { url: imageUrl },
                caption: captionText
            },
            { quoted: message }
        );
    } else {
        await message.reply(captionText);
    }
}
