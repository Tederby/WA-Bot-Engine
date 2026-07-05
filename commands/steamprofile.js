import { sendSteamProfileDetail } from "../services/steam.js";
import { getUser, resolveUserId } from "../lib/database.js";
import setting from "../setting.js";

export default {
    name: "steamprofile",
    aliases: ["steamuser", "sp"],
    category: "search",
    description: "Mencari informasi profil user Steam",
    usage: "!steamprofile <username/steamid>",
    async handler({ message, args, sock, sender, prefix }) {
        if (args.length === 0) {
            // Cek apakah user punya linked Steam account
            const userData = getUser(resolveUserId(sender));
            if (userData.meta?.steamId) {
                await sendSteamProfileDetail(userData.meta.steamId, message, sock, false);
                return;
            }

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
                `💡 _Tautkan akun Steam kamu via \`${prefix}register\` agar bisa cek profil tanpa argumen_`
            );
            return;
        }

        const input = args.join("").trim();
        await sendSteamProfileDetail(input, message, sock, false);
    }
};
