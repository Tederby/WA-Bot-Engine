import axios from "axios";
import https from "https";
import { registerReplyHandler } from "./_registry.js";

const ITEMS_PER_PAGE = 5;

function generateListText(results, page, query) {
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentItems = results.slice(start, end);

    let text = `🎌 *Hasil Pencarian Anime: ${query}* (Page ${page + 1}/${totalPages})\n\n`;
    
    currentItems.forEach((anime, index) => {
        text += `${start + index + 1}. *${anime.title}* (${anime.type || "N/A"})\n`;
        text += `   ⭐ Score: ${anime.score || "N/A"} | 🎬 Eps: ${anime.episodes || "N/A"}\n\n`;
    });

    text += `Balas pesan ini dengan:\n`;
    text += `👉 *Angka (1-${results.length})* untuk melihat detail info\n`;
    if (page < totalPages - 1) text += `👉 *'n'* atau *'next'* untuk halaman selanjutnya\n`;
    if (page > 0) text += `👉 *'b'* atau *'back'* untuk halaman sebelumnya\n`;

    return text.trim();
}

export default {
    name: "anime",
    aliases: ["myanimelist"],
    category: "anime",
    description: "Mencari daftar anime dari MyAnimeList",
    usage: "!anime <judul>",
    async handler({ message, args, sock }) {
        if (args.length === 0) {
            await message.reply("❌ Berikan judul anime yang ingin dicari.\nContoh: `!anime naruto`\n\n💡 *Tip:* Tambahkan `-1` atau `--top` untuk langsung mendapatkan hasil paling relevan tanpa memilih list. Contoh: `!anime naruto -1`");
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
            await message.reply("❌ Berikan judul anime yang ingin dicari.\nContoh: `!anime naruto -1`");
            return;
        }

        try {
            const response = await axios.get(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=20`, {
                timeout: 15000, // Timeout 15 detik
                httpsAgent: new https.Agent({ family: 4 }), // Paksa IPv4
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (!response.data || !response.data.data || response.data.data.length === 0) {
                await message.reply(`❌ Anime dengan kata kunci *${query}* tidak ditemukan di database.`);
                return;
            }

            const results = response.data.data;

            if (isDirect) {
                await sendAnimeDetail(results[0], message, sock);
                return;
            }

            const text = generateListText(results, 0, query);

            const sentMsg = await sock.sendMessage(message.chat, { text }, { quoted: message });
            
            // Register reply handler for pagination and detail selection
            registerReplyHandler(sentMsg.key.id, replyHandler, {
                results,
                page: 0,
                query,
                userId: message.sender,
                messageKey: sentMsg.key,
                commandName: "anime"
            });

        } catch (err) {
            let errorMsg = err.message || "Unknown error";
            if (err.response) {
                // Server merespon dengan status code selain 2xx
                errorMsg = `HTTP ${err.response.status}: ${err.response.statusText}`;
                console.error("Anime Command Error (Response):", errorMsg, err.response.data);
            } else if (err.request) {
                // Request terkirim tapi tidak ada respon (timeout/network error)
                console.error("Anime Command Error (Request):", errorMsg);
            } else {
                console.error("Anime Command Error:", err);
            }

            if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
                await message.reply(`❌ Server MyAnimeList (Jikan API) sedang sibuk atau down. Silakan coba beberapa saat lagi.`);
            } else if (err.response && err.response.status === 403) {
                await message.reply(`❌ Akses ditolak oleh API Jikan (403 Forbidden). Ini sering terjadi jika IP server/VPS diblokir oleh sistem keamanan mereka (Cloudflare).`);
            } else if (err.response && err.response.status === 429) {
                await message.reply(`❌ Terlalu banyak request ke Jikan API (429 Rate Limit). Mohon tunggu beberapa saat.`);
            } else {
                await message.reply(`❌ Terjadi kesalahan saat mencari anime: ${errorMsg}`);
            }
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
        const anime = results[num - 1];
        await sendAnimeDetail(anime, message, sock);
        return;
    }
}

async function sendAnimeDetail(anime, message, sock) {
    const title = anime.title || "N/A";
    const titleEng = anime.title_english ? ` (${anime.title_english})` : "";
    const status = anime.status || "N/A";
    const episodes = anime.episodes || "Unknown";
    const type = anime.type || "N/A";
    const score = anime.score || "N/A";
    const rank = anime.rank || "N/A";
    const popularity = anime.popularity || "N/A";
    const season = anime.season ? anime.season.charAt(0).toUpperCase() + anime.season.slice(1) : "";
    const year = anime.year || "";
    const seasonYear = season && year ? `${season} ${year}` : (season || year || "N/A");
    const studios = anime.studios && anime.studios.length > 0 ? anime.studios.map(s => s.name).join(", ") : "N/A";
    const duration = anime.duration || "N/A";
    const rating = anime.rating || "N/A";

    const url = anime.url;
    const genres = anime.genres && anime.genres.length > 0 ? anime.genres.map(g => g.name).join(", ") : "N/A";
    
    let synopsis = "Tidak ada sinopsis.";
    if (anime.synopsis) {
        synopsis = anime.synopsis.replace(/\[Written by MAL Rewrite\]/i, "").trim();
    }
    
    let imageUrl = null;
    if (anime.images?.jpg?.large_image_url) {
        imageUrl = anime.images.jpg.large_image_url;
    } else if (anime.images?.jpg?.image_url) {
        imageUrl = anime.images.jpg.image_url;
    }

    let captionText = `🎌 *${title}*${titleEng}\n\n`;
    captionText += `⭐ *Score:* ${score}\n`;
    captionText += `🏆 *Rank:* #${rank} | 📈 *Popularity:* #${popularity}\n`;
    captionText += `📺 *Type:* ${type}\n`;
    captionText += `🎬 *Episodes:* ${episodes}\n`;
    captionText += `⏳ *Status:* ${status}\n`;
    captionText += `📅 *Season:* ${seasonYear}\n`;
    captionText += `🎥 *Studio:* ${studios}\n`;
    captionText += `⏱️ *Duration:* ${duration}\n`;
    captionText += `⚠️ *Rating:* ${rating}\n`;
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
