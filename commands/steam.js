import axios from "axios";
import { registerReplyHandler } from "./_registry.js";

const ITEMS_PER_PAGE = 5;

function formatRupiah(cents) {
    if (!cents) return "Rp 0";
    const price = Math.floor(cents / 100);
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price);
}

function generateListText(results, page, query) {
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentItems = results.slice(start, end);

    let text = `🎮 *S T E A M  S E A R C H*\n`;
    text += `──────────────────\n`;
    text += `🔍 *Query:* ${query}\n`;
    text += `📄 *Page:* ${page + 1}/${totalPages}\n`;
    text += `──────────────────\n\n`;
    
    currentItems.forEach((game, index) => {
        let priceText = "Gratis / Tidak Tersedia";
        if (game.price) {
            if (game.price.initial > game.price.final) {
                priceText = `~${formatRupiah(game.price.initial)}~ ➡️ *${formatRupiah(game.price.final)}*`;
            } else {
                priceText = `*${formatRupiah(game.price.final)}*`;
            }
        }
        
        text += `*${start + index + 1}. ${game.name}*\n`;
        text += `↳ 💰 ${priceText}\n\n`;
    });

    text += `──────────────────\n`;
    text += `💡 *Navigasi:*\n`;
    text += `└ Reply angka *1-${results.length}* untuk detail.\n`;
    if (page < totalPages - 1) text += `└ Reply *'n'* untuk lanjut (next).\n`;
    if (page > 0) text += `└ Reply *'b'* untuk kembali (back).\n`;

    return text.trim();
}

export default {
    name: "steam",
    aliases: ["steamsearch", "game"],
    category: "search",
    description: "Mencari game di Steam beserta informasi harganya",
    usage: "!steam <judul game>",
    async handler({ message, args, sock, sender }) {
        if (args.length === 0) {
            await message.reply("❌ Berikan judul game yang ingin dicari.\nContoh: `!steam stardew valley`\n\n💡 *Tip:* Tambahkan `-1` atau `--top` untuk langsung mendapatkan hasil paling relevan.");
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
            await message.reply("❌ Berikan judul game yang ingin dicari.\nContoh: `!steam stardew valley -1`");
            return;
        }

        try {
            const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=indonesian&cc=ID`;
            const response = await axios.get(searchUrl, { timeout: 15000 });
            
            if (!response.data || !response.data.items || response.data.items.length === 0) {
                await message.reply(`❌ Game dengan kata kunci *${query}* tidak ditemukan di Steam.`);
                return;
            }

            const results = response.data.items.filter(item => item.type === "app");

            if (results.length === 0) {
                await message.reply(`❌ Game dengan kata kunci *${query}* tidak ditemukan di Steam.`);
                return;
            }

            if (isDirect) {
                await sendSteamDetail(results[0].id, message, sock);
                return;
            }

            const text = generateListText(results, 0, query);
            const sentMsg = await sock.sendMessage(message.chat, { text }, { quoted: message });
            
            registerReplyHandler(sentMsg.key.id, replyHandler, {
                results,
                page: 0,
                query,
                userId: sender,
                messageKey: sentMsg.key,
                commandName: "steam"
            });

        } catch (err) {
            console.error("Steam Command Error:", err.message);
            await message.reply(`❌ Terjadi kesalahan saat mencari game di Steam. Coba lagi nanti.`);
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
        const app = results[num - 1];
        await sendSteamDetail(app.id, message, sock);
        return;
    }
}

async function sendSteamDetail(appId, message, sock) {
    try {
        const detailUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=ID&l=indonesian`;
        const response = await axios.get(detailUrl, { timeout: 15000 });
        
        const data = response.data[appId];
        if (!data || !data.success) {
            await message.reply(`❌ Gagal mengambil detail untuk game tersebut.`);
            return;
        }

        const game = data.data;
        const name = game.name || "N/A";
        const shortDesc = game.short_description ? game.short_description.replace(/<[^>]*>?/gm, '') : "Tidak ada deskripsi.";
        const releaseDate = game.release_date ? game.release_date.date : "N/A";
        const developers = game.developers ? game.developers.join(", ") : "N/A";
        const publishers = game.publishers ? game.publishers.join(", ") : "N/A";
        const metacritic = game.metacritic ? game.metacritic.score : "N/A";
        
        let priceText = "Gratis";
        if (game.is_free) {
            priceText = "Gratis (Free to Play)";
        } else if (game.price_overview) {
            const p = game.price_overview;
            if (p.discount_percent > 0) {
                const fullPrice = p.initial_formatted || formatRupiah(p.initial);
                const discountedPrice = p.final_formatted || formatRupiah(p.final);
                priceText = `~${fullPrice}~\n💸 *Harga Diskon:* ${discountedPrice}\n📉 *Diskon:* ${p.discount_percent}%`;
            } else {
                priceText = p.final_formatted || formatRupiah(p.final);
            }
        } else {
            priceText = "Tidak tersedia untuk dibeli";
        }

        const genres = game.genres ? game.genres.map(g => g.description).join(", ") : "N/A";
        const headerImage = game.header_image || game.capsule_image;

        let captionText = `🎮 *${name}*\n\n`;
        captionText += `🏷️ *Genre:* ${genres}\n`;
        captionText += `📅 *Rilis:* ${releaseDate}\n`;
        captionText += `🛠️ *Developer:* ${developers}\n`;
        captionText += `🏢 *Publisher:* ${publishers}\n`;
        captionText += `🌟 *Metacritic:* ${metacritic}\n\n`;
        captionText += `💰 *Harga:* ${priceText}\n\n`;
        captionText += `📝 *Deskripsi:*\n${shortDesc}\n\n`;
        captionText += `🔗 *Link Steam:* https://store.steampowered.com/app/${appId}`;

        if (headerImage) {
            await sock.sendMessage(
                message.chat,
                {
                    image: { url: headerImage },
                    caption: captionText
                },
                { quoted: message }
            );
        } else {
            await message.reply(captionText);
        }
    } catch (err) {
        console.error("Steam Detail Error:", err.message);
        await message.reply(`❌ Terjadi kesalahan saat mengambil detail game.`);
    }
}
