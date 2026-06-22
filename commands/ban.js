/**
 * Group-Level Ban — Ban a user from using the bot in a specific group.
 *
 * Admin and Owner can ban/unban. The banned user can still use the
 * bot in other groups or DMs.
 */

import { jidNormalizedUser } from "baileys";
import { banUserInGroup, unbanUserInGroup, getGroupBannedUsers } from "../lib/database.js";

export default {
    name: "ban",
    aliases: ["gban-user"],
    category: "admin",
    description: "Ban/unban user dari menggunakan bot di grup ini.",
    usage: "!ban @user [alasan] | !unban @user | !banlist",
    groupOnly: true,
    adminOnly: true,

    async handler({ message, sock, args, sender, isGroup, groupMetadata }) {
        try {
            const chatId = message.chat;
            const sub = args[0]?.toLowerCase();

            // ── !banlist ────────────────────────────────────────────
            if (message.text?.match(/^[!.#/\-]banlist/i)) {
                const banned = getGroupBannedUsers(chatId);
                if (banned.length === 0) {
                    return message.reply("✅ Tidak ada user yang di-ban di grup ini.");
                }

                let text = `🚫 *DAFTAR BAN GRUP* 🚫\n\n`;
                text += `Total: ${banned.length} user\n\n`;
                const mentions = [];

                banned.forEach((userId, i) => {
                    const baseId = userId.split("@")[0];
                    text += `${i + 1}. @${baseId}\n`;
                    mentions.push(userId);
                });

                text += `\n_Gunakan !unban @user untuk membatalkan ban._`;

                return sock.sendMessage(chatId, { text, mentions }, { quoted: message });
            }

            // ── !unban @user ────────────────────────────────────────
            if (message.text?.match(/^[!.#/\-]unban/i)) {
                let target = null;
                if (message.mentionedJid && message.mentionedJid.length > 0) {
                    target = message.mentionedJid[0];
                } else if (message.quoted) {
                    target = message.quoted.sender || message.quoted.participant;
                }

                if (!target) {
                    return message.reply("Tag atau reply pesan user yang ingin di-unban.\n\nContoh: *!unban @user*");
                }

                const normalizedTarget = jidNormalizedUser(target);
                const targetBaseId = target.split(":")[0].split("@")[0];

                unbanUserInGroup(chatId, normalizedTarget);

                return sock.sendMessage(
                    chatId,
                    {
                        text: `✅ @${targetBaseId} telah di-unban di grup ini. Mereka bisa menggunakan bot kembali.`,
                        mentions: [normalizedTarget],
                    },
                    { quoted: message }
                );
            }

            // ── !ban @user [alasan] ─────────────────────────────────
            let target = null;
            if (message.mentionedJid && message.mentionedJid.length > 0) {
                target = message.mentionedJid[0];
            } else if (message.quoted) {
                target = message.quoted.sender || message.quoted.participant;
            }

            if (!target) {
                return message.reply(
                    "Tag atau reply pesan user yang ingin di-ban.\n\n" +
                    "Contoh:\n" +
                    "• *!ban @user* — Ban user di grup ini\n" +
                    "• *!unban @user* — Unban user\n" +
                    "• *!banlist* — Lihat daftar ban"
                );
            }

            const normalizedTarget = jidNormalizedUser(target);
            const targetBaseId = target.split(":")[0].split("@")[0];

            // Prevent banning self
            const senderBaseId = sender.split(":")[0].split("@")[0];
            if (targetBaseId === senderBaseId) {
                return message.reply("❌ Kamu tidak bisa mem-ban diri sendiri.");
            }

            // Prevent banning bot
            const botBaseId = sock.user.id.split(":")[0].split("@")[0];
            if (targetBaseId === botBaseId) {
                return message.reply("❌ Tidak bisa mem-ban bot.");
            }

            // Prevent banning admins
            if (groupMetadata && groupMetadata.participants) {
                const isTargetAdmin = groupMetadata.participants.some(p => {
                    const pBase = p.id.split(":")[0].split("@")[0];
                    return pBase === targetBaseId && p.admin;
                });
                if (isTargetAdmin) {
                    return message.reply("❌ Tidak bisa mem-ban admin grup.");
                }
            }

            banUserInGroup(chatId, normalizedTarget);

            return sock.sendMessage(
                chatId,
                {
                    text: `🚫 @${targetBaseId} telah di-ban dari menggunakan bot di grup ini.\n\n_Gunakan !unban @user untuk membatalkan._`,
                    mentions: [normalizedTarget],
                },
                { quoted: message }
            );

        } catch (error) {
            console.error("[BAN CMD]", error);
            message.reply("Terjadi kesalahan saat memproses perintah ban.");
        }
    },
};
