import { sendSteamProfileDetail } from "../services/steam.js";
import setting from "../setting.js";

export default {
    name: "steamprofile",
    aliases: ["steamuser", "sp"],
    category: "search",
    description: "Mencari informasi profil user Steam",
    usage: "!steamprofile <username/steamid>",
    async handler({ message, args, sock }) {
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
        await sendSteamProfileDetail(input, message, sock, false);
    }
};
