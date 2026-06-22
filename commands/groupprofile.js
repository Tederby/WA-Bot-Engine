/**
 * Group Profile — Display group info from the database.
 */

import { getGroupConfig, getGroupBannedUsers } from "../lib/database.js";

export default {
    name: "groupprofile",
    aliases: ["gprofile", "grupinfo", "ginfo"],
    category: "admin",
    description: "Menampilkan informasi grup dari database bot.",
    usage: "!groupprofile",
    groupOnly: true,

    async handler({ message, sock, groupMetadata, prefix }) {
        try {
            const chatId = message.chat;
            const config = getGroupConfig(chatId);
            const bannedUsers = getGroupBannedUsers(chatId);

            // Group metadata from WhatsApp
            const groupName = groupMetadata?.subject || "Tidak diketahui";
            const totalMembers = groupMetadata?.participants?.length || 0;
            const totalAdmins = groupMetadata?.participants?.filter(p => p.admin)?.length || 0;

            // Registration info
            const isRegistered = config.registered === true;
            const regDate = config.registeredAt
                ? new Date(config.registeredAt).toLocaleDateString("id-ID", {
                    day: "numeric", month: "long", year: "numeric",
                })
                : null;
            const regByBaseId = config.registeredBy ? config.registeredBy.split("@")[0] : null;

            // Build display
            let caption = `╔══ *GROUP INFO* ══╗\n\n`;

            caption += `📛 *Nama:* ${groupName}\n`;
            caption += `👥 *Member:* ${totalMembers}\n`;
            caption += `🛡️ *Admin:* ${totalAdmins}\n\n`;

            caption += `━━ Registrasi ━━\n`;
            if (isRegistered) {
                caption += `📋 *Status:* ✅ Terdaftar\n`;
                if (regDate) caption += `📅 *Sejak:* ${regDate}\n`;
                if (regByBaseId) caption += `📝 *Oleh:* @${regByBaseId}\n`;
            } else {
                caption += `📋 *Status:* ❌ Belum terdaftar\n`;
                caption += `_Ketik ${prefix}gregister untuk mendaftarkan grup._\n`;
            }

            caption += `\n━━ Fitur ━━\n`;
            caption += `👋 *Welcome:* ${config.welcome ? "✅ Aktif" : "❌ Nonaktif"}\n`;
            caption += `👋 *Goodbye:* ${config.goodbye ? "✅ Aktif" : "❌ Nonaktif"}\n`;
            caption += `🚫 *Banned Users:* ${bannedUsers.length}\n`;

            if (config.banned) {
                caption += `\n⚠️ *GRUP INI DI-BAN SECARA GLOBAL*\n`;
                if (config.banReason) caption += `📝 Alasan: _${config.banReason}_\n`;
            }

            caption += `\n╚══════════════════╝`;

            // Collect mentions
            const mentions = [];
            if (config.registeredBy) mentions.push(config.registeredBy);

            await sock.sendMessage(
                chatId,
                { text: caption, mentions },
                { quoted: message }
            );

        } catch (error) {
            console.error("[GROUPPROFILE CMD]", error);
            message.reply("Terjadi kesalahan saat menampilkan info grup.");
        }
    },
};
