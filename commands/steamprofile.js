import axios from "axios";
import setting from "../setting.js";

const STEAM_API = "https://api.steampowered.com";

/**
 * Detect whether the input is a SteamID64 (17-digit number) or a vanity URL.
 * @param {string} input
 * @returns {"steamid"|"vanity"}
 */
function detectInputType(input) {
    return /^\d{17}$/.test(input) ? "steamid" : "vanity";
}

/**
 * Resolve a vanity URL to a SteamID64.
 * @returns {string|null} SteamID64 or null if not found
 */
async function resolveVanityURL(apiKey, vanityUrl) {
    const url = `${STEAM_API}/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityUrl)}`;
    const { data } = await axios.get(url, { timeout: 15000 });

    if (data.response.success === 1) {
        return data.response.steamid;
    }
    return null;
}

/**
 * Fetch all profile data in parallel.
 */
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

/**
 * Format playtime in hours.
 */
function formatPlaytime(minutes) {
    if (!minutes || minutes <= 0) return "0 jam";
    const hours = (minutes / 60).toFixed(1);
    return `${hours.replace(/\.0$/, "")} jam`;
}

/**
 * Format online status.
 */
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

    // Append game name if currently in-game
    if (player.gameextrainfo) {
        statusText = `🟣 In-Game: *${player.gameextrainfo}*`;
    }

    // Append last logoff for offline users
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

/**
 * Get country code emoji flag.
 */
function getCountryFlag(code) {
    if (!code || code.length !== 2) return "";
    const offset = 0x1F1E6;
    const chars = [...code.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) - 65 + offset));
    return chars.join("");
}

/**
 * Build the profile text output.
 */
function buildProfileText(steamId, player, games, recent, level) {
    const isPublic = player.communityvisibilitystate === 3;
    const name = player.personaname || "N/A";
    const realName = player.realname || null;
    const country = player.loccountrycode || null;
    const created = player.timecreated ? new Date(player.timecreated * 1000) : null;

    let text = `╭━━━〔 🎮 STEAM PROFILE 〕━━━\n`;
    text += `┃ 👤 *Nama*     : ${name}\n`;
    if (realName) text += `┃ 📛 *Nama Asli* : ${realName}\n`;
    text += `┃ 🆔 *SteamID*  : \`${steamId}\`\n`;
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

        // Top 5 by playtime
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
        // Public profile but empty game list — could be 0 games or private game list
        // Steam returns {"response":{}} for both cases on public profiles
        // If game_count exists and is 0, user has no games; otherwise games might be hidden
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

    // ── Permanent link (always use ID-based URL) ──
    text += `\n🔗 *Profil:* https://steamcommunity.com/profiles/${steamId}`;

    return text.trim();
}

export default {
    name: "steamprofile",
    aliases: ["steamuser", "sp"],
    category: "search",
    description: "Mencari informasi profil user Steam",
    usage: "!steamprofile <username/steamid>",
    async handler({ message, args, sock }) {
        const apiKey = setting.steam?.apiKey;
        if (!apiKey) {
            await message.reply("❌ Steam API Key belum dikonfigurasi. Hubungi owner bot.");
            return;
        }

        if (args.length === 0) {
            await message.reply(
                "❌ Berikan *custom URL* atau *SteamID64* yang ingin dicari.\n\n" +
                "Contoh:\n" +
                "• `!sp gabelogannewell`\n" +
                "• `!sp 76561197960287930`\n\n" +
                "⚠️ *Pencarian bersifat exact match* — harus sama persis dengan custom URL profil Steam, bukan display name.\n\n" +
                "📌 *Cara menemukan custom URL:*\n" +
                "Buka profil Steam → lihat URL-nya:\n" +
                "• `steamcommunity.com/id/`*gabelogannewell* ← ini custom URL\n" +
                "• `steamcommunity.com/profiles/`*76561197960287930* ← ini SteamID64\n\n" +
                "💡 _Cari game? Gunakan `!steam <judul game>`_"
            );
            return;
        }

        const input = args.join("").trim();

        try {
            // ── Step 1: Resolve to SteamID64 ──
            let steamId;
            const inputType = detectInputType(input);

            if (inputType === "steamid") {
                steamId = input;
            } else {
                await message.reply(`🔍 Mencari profil *${input}*...`);
                steamId = await resolveVanityURL(apiKey, input);

                if (!steamId) {
                    await message.reply(
                        `❌ User Steam dengan custom URL *${input}* tidak ditemukan.\n\n` +
                        `⚠️ Pencarian harus *exact match* — pastikan:\n` +
                        `• Bukan display name, tapi *custom URL* dari profil\n` +
                        `• Cek di: \`steamcommunity.com/id/\`*username_disini*\n` +
                        `• Atau gunakan *SteamID64* (angka 17 digit)\n\n` +
                        `💡 _Jika user tidak punya custom URL, gunakan SteamID64 dari profil mereka._`
                    );
                    return;
                }
            }

            // ── Step 2: Fetch all data in parallel ──
            if (inputType === "steamid") {
                await message.reply(`🔍 Mengambil profil *${steamId}*...`);
            }

            const profileData = await fetchProfileData(apiKey, steamId);

            // ── Step 3: Validate player exists ──
            const players = profileData.summary?.response?.players;
            if (!players || players.length === 0) {
                await message.reply(`❌ Profil Steam dengan ID *${steamId}* tidak ditemukan.`);
                return;
            }

            const player = players[0];
            const steamLevel = profileData.level?.response?.player_level ?? null;
            const avatarUrl = player.avatarfull || player.avatarmedium || player.avatar;

            // ── Step 4: Build output ──
            const profileText = buildProfileText(
                steamId,
                player,
                profileData.games,
                profileData.recent,
                steamLevel
            );

            // ── Step 5: Send with avatar ──
            if (avatarUrl) {
                await sock.sendMessage(
                    message.chat,
                    {
                        image: { url: avatarUrl },
                        caption: profileText
                    },
                    { quoted: message }
                );
            } else {
                await message.reply(profileText);
            }

        } catch (err) {
            console.error("SteamProfile Error:", err.message);

            if (err.response?.status === 403) {
                await message.reply("❌ Steam API Key tidak valid atau expired. Hubungi owner bot.");
            } else {
                await message.reply("❌ Terjadi kesalahan saat mengambil profil Steam. Coba lagi nanti.");
            }
        }
    }
};
