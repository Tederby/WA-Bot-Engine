import axios from "axios";
import setting from "../setting.js";

const STEAM_API = "https://api.steampowered.com";

// ── Steam Game ──────────────────────────────────────────

export function formatRupiah(cents) {
    if (!cents) return "Rp 0";
    const price = Math.floor(cents / 100);
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price);
}

export async function sendSteamGameDetail(appId, message, sock, isAutoDetect = false) {
    try {
        const detailUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=ID&l=indonesian`;
        const response = await axios.get(detailUrl, { timeout: 15000 });

        const data = response.data[appId];
        if (!data || !data.success) {
            if (!isAutoDetect) await message.reply(`❌ Gagal mengambil detail untuk game tersebut.`);
            return;
        }

        const game = data.data;
        const name = game.name || "N/A";
        const shortDesc = game.short_description ? game.short_description.replace(/<[^>]*>?/gm, '') : "Tidak ada deskripsi.";
        const releaseDate = game.release_date ? game.release_date.date : "N/A";
        const developers = game.developers ? game.developers.join(", ") : "N/A";
        const publishers = game.publishers ? game.publishers.join(", ") : "N/A";
        const metacritic = game.metacritic ? game.metacritic.score : "N/A";
        let supportedLanguages = "N/A";
        if (game.supported_languages) {
            let rawLangs = game.supported_languages.replace(/<br[^>]*>[\s\S]*$/i, '');
            rawLangs = rawLangs.replace(/<strong>\*<\/strong>\s*bahasa dengan dukungan audio penuh/gi, '');
            rawLangs = rawLangs.replace(/\*bahasa dengan dukungan audio penuh/gi, '');
            rawLangs = rawLangs.replace(/\*languages with full audio support/gi, '');

            const audioLangs = [];
            const textLangs = [];

            rawLangs.split(',').forEach(l => {
                let text = l.trim();
                let hasAudio = text.includes('<strong>*</strong>') || text.includes('*');
                text = text.replace(/<[^>]*>?/gm, '').replace(/\*/g, '').trim();

                if (text) {
                    if (hasAudio) audioLangs.push(text);
                    else textLangs.push(text);
                }
            });

            let formatArr = [];
            if (audioLangs.length > 0) {
                formatArr.push(`🔊 *UI, Audio & Subtitle:*\n${audioLangs.join(', ')}`);
            }
            if (textLangs.length > 0) {
                formatArr.push(`💬 *UI & Subtitle:*\n${textLangs.join(', ')}`);
            }

            supportedLanguages = formatArr.join('\n\n');
        }

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
        captionText += `🔗 *Link Steam:* https://store.steampowered.com/app/${appId}\n\n`;
        captionText += `🏷️ *Genre:* ${genres}\n`;
        captionText += `📅 *Rilis:* ${releaseDate}\n`;
        captionText += `🛠️ *Developer:* ${developers}\n`;
        captionText += `🏢 *Publisher:* ${publishers}\n`;
        captionText += `🌟 *Metacritic:* ${metacritic}\n\n`;
        captionText += `💰 *Harga:* ${priceText}\n\n`;
        captionText += `📝 *Deskripsi:*\n${shortDesc}\n\n`;
        captionText += `🌐 *Bahasa didukung:*\n${supportedLanguages}`;

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
        console.error("Steam Game Detail Error:", err.message);
        if (!isAutoDetect) await message.reply(`❌ Terjadi kesalahan saat mengambil detail game.`);
    }
}

// ── Steam Profile ──────────────────────────────────────────

function detectInputType(input) {
    return /^\d{17}$/.test(input) ? "steamid" : "vanity";
}

async function resolveVanityURL(apiKey, vanityUrl) {
    const url = `${STEAM_API}/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityUrl)}`;
    const { data } = await axios.get(url, { timeout: 15000 });

    if (data.response.success === 1) {
        return data.response.steamid;
    }
    return null;
}

async function fetchProfileData(apiKey, steamId) {
    const [summaryRes, gamesRes, recentRes, levelRes] = await Promise.allSettled([
        axios.get(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`, { timeout: 15000 }),
        axios.get(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`, { timeout: 15000 }),
        axios.get(`${STEAM_API}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${apiKey}&steamid=${steamId}`, { timeout: 15000 }),
        axios.get(`${STEAM_API}/IPlayerService/GetSteamLevel/v1/?key=${apiKey}&steamid=${steamId}`, { timeout: 15000 }),
    ]);

    return {
        summary: summaryRes.status === "fulfilled" ? summaryRes.value.data : null,
        games: gamesRes.status === "fulfilled" ? gamesRes.value.data : null,
        recent: recentRes.status === "fulfilled" ? recentRes.value.data : null,
        level: levelRes.status === "fulfilled" ? levelRes.value.data : null,
    };
}

function formatPlaytime(minutes) {
    if (!minutes || minutes <= 0) return "0 jam";
    const hours = (minutes / 60).toFixed(1);
    return `${hours.replace(/\.0$/, "")} jam`;
}

function getStatusText(player) {
    const statusMap = {
        0: "🔴 Offline",
        1: "🟢 Online",
        2: "🟡 Busy",
        3: "🟡 Away",
        4: "🟡 Snooze",
        5: "🔵 Looking to Trade",
        6: "🔵 Looking to Play",
    };

    let statusText = statusMap[player.personastate] || "❓ Unknown";

    if (player.gameextrainfo) {
        statusText = `🟣 In-Game: *${player.gameextrainfo}*`;
    }

    if (player.personastate === 0 && player.lastlogoff) {
        const lastSeen = new Date(player.lastlogoff * 1000);
        const diff = Date.now() - lastSeen.getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(mins / 60);
        const days = Math.floor(hours / 24);

        let agoText;
        if (days > 0) agoText = `${days} hari lalu`;
        else if (hours > 0) agoText = `${hours} jam lalu`;
        else agoText = `${mins} menit lalu`;

        statusText += ` _(terakhir: ${agoText})_`;
    }

    return statusText;
}

function getCountryFlag(code) {
    if (!code || code.length !== 2) return "";
    const offset = 0x1F1E6;
    const chars = [...code.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) - 65 + offset));
    return chars.join("");
}

function extractCustomUrl(profileUrl) {
    if (!profileUrl) return null;
    const match = profileUrl.match(/steamcommunity\.com\/id\/([^/]+)/i);
    return match ? match[1] : null;
}

function buildProfileText(steamId, player, games, recent, level) {
    const isPublic = player.communityvisibilitystate === 3;
    const name = player.personaname || "N/A";
    const realName = player.realname || null;
    const country = player.loccountrycode || null;
    const created = player.timecreated ? new Date(player.timecreated * 1000) : null;
    const customUrl = extractCustomUrl(player.profileurl);

    let text = `╭━━━〔 🎮 STEAM PROFILE 〕━━━\n`;
    text += `┃ 👤 *Nama*     : ${name}\n`;
    if (realName) text += `┃ 📛 *Nama Asli* : ${realName}\n`;
    text += `┃ 🆔 *SteamID*  : \`${steamId}\`\n`;
    if (customUrl) {
        text += `┃ 🏷️ *Custom ID* : ${customUrl}\n`;
    } else {
        text += `┃ 🏷️ *Custom ID* : _Belum diatur_\n`;
    }
    text += `┃ 🌐 *Status*   : ${getStatusText(player)}\n`;
    if (country) text += `┃ 🏳️ *Negara*   : ${getCountryFlag(country)} ${country}\n`;
    if (created) {
        const dateStr = created.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
        text += `┃ 📅 *Dibuat*   : ${dateStr}\n`;
    }
    if (level !== null) text += `┃ ⭐ *Level*    : ${level}\n`;

    if (!isPublic) {
        text += `┃ 🔒 *Visibilitas* : Private\n`;
    }

    text += `╰━━━━━━━━━━━━━━━━━━━━━\n`;

    // ── Games section ──
    if (!isPublic) {
        text += `\n🔒 _Profil ini bersifat Private — data game tidak tersedia._\n`;
    } else if (games && games.response && games.response.game_count > 0) {
        const totalGames = games.response.game_count;
        const totalPlaytime = games.response.games.reduce((sum, g) => sum + (g.playtime_forever || 0), 0);
        text += `\n┃ 🎮 *Total Game* : ${totalGames.toLocaleString("id-ID")} game (${formatPlaytime(totalPlaytime)} total)\n\n`;

        const top5 = [...games.response.games]
            .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
            .slice(0, 5);

        if (top5.length > 0 && top5[0].playtime_forever > 0) {
            text += `╭───「 🏆 Top Games (by Playtime) 」\n`;
            top5.forEach((g, i) => {
                text += `│ ${i + 1}. ${g.name} — *${formatPlaytime(g.playtime_forever)}*\n`;
            });
            text += `╰──────────────\n`;
        }
    } else if (games && games.response) {
        if (typeof games.response.game_count === "number") {
            text += `\n_User ini belum memiliki game._\n`;
        } else {
            text += `\n🔒 _Daftar game di-private oleh user._\n`;
        }
    } else {
        text += `\n🔒 _Daftar game di-private oleh user._\n`;
    }

    // ── Recent activity section ──
    if (!isPublic) {
        // Already shown the private notice above
    } else if (recent && recent.response && recent.response.total_count > 0) {
        text += `\n╭───「 📅 Aktivitas 2 Minggu Terakhir 」\n`;
        recent.response.games.forEach(g => {
            text += `│ • ${g.name} — *${formatPlaytime(g.playtime_2weeks)}*\n`;
        });
        text += `╰──────────────\n`;
    } else if (isPublic) {
        text += `\n_Tidak ada aktivitas dalam 2 minggu terakhir._\n`;
    }

    // ── Custom URL tip ──
    if (!customUrl) {
        text += `\n💡 _Ini profil kamu? Setup custom URL di:_\n_Steam > Edit Profile > Custom URL_\n`;
    }

    text += `\n🔗 *Profil:* https://steamcommunity.com/profiles/${steamId}`;

    return text.trim();
}

export async function sendSteamProfileDetail(input, message, sock, isAutoDetect = false) {
    const apiKey = setting.steam?.apiKey;
    if (!apiKey) {
        if (!isAutoDetect) await message.reply("❌ Steam API Key belum dikonfigurasi. Hubungi owner bot.");
        return;
    }

    let sentMsg;
    if (!isAutoDetect) {
        sentMsg = await sock.sendMessage(
            message.chat,
            { text: `🔍 Mengambil profil *${input}*...` },
            { quoted: message }
        );
    }

    try {
        let steamId;
        const inputType = detectInputType(input);

        if (inputType === "steamid") {
            steamId = input;
        } else {
            steamId = await resolveVanityURL(apiKey, input);

            if (!steamId) {
                if (!isAutoDetect) {
                    await sock.sendMessage(message.chat, {
                        text: `❌ User Steam dengan custom URL *${input}* tidak ditemukan.\n\n` +
                            `⚠️ Pencarian harus *exact match* — pastikan:\n` +
                            `• Bukan display name, tapi *custom URL* dari profil\n` +
                            `• Cek di: \`steamcommunity.com/id/\`*username_disini*\n` +
                            `• Atau gunakan *SteamID64* (angka 17 digit)\n\n` +
                            `💡 _Jika user tidak punya custom URL, gunakan SteamID64 dari profil mereka._`,
                        edit: sentMsg.key
                    });
                }
                return;
            }
        }

        const profileData = await fetchProfileData(apiKey, steamId);

        const players = profileData.summary?.response?.players;
        if (!players || players.length === 0) {
            if (!isAutoDetect) {
                await sock.sendMessage(message.chat, {
                    text: `❌ Profil Steam dengan ID *${steamId}* tidak ditemukan.`,
                    edit: sentMsg.key
                });
            }
            return;
        }

        const player = players[0];
        const steamLevel = profileData.level?.response?.player_level ?? null;

        const profileText = buildProfileText(
            steamId,
            player,
            profileData.games,
            profileData.recent,
            steamLevel
        );

        if (!isAutoDetect) {
            await sock.sendMessage(message.chat, {
                text: `>> *${player.personaname}*`,
                edit: sentMsg.key
            });
        }

        await sock.sendMessage(
            message.chat,
            { text: profileText },
            { quoted: message }
        );

    } catch (err) {
        console.error("SteamProfile Error:", err.message);

        if (!isAutoDetect) {
            const errText = err.response?.status === 403
                ? "❌ Steam API Key tidak valid atau expired. Hubungi owner bot."
                : "❌ Terjadi kesalahan saat mengambil profil Steam. Coba lagi nanti.";

            await sock.sendMessage(message.chat, {
                text: errText,
                edit: sentMsg.key
            }).catch(() => {});
        }
    }
}
