/**
 * Global Ban — Owner-only commands for global user bans and group bans.
 *
 * Global user ban: user cannot use bot anywhere.
 * Global group ban: bot stops responding in the group entirely.
 * Owner can ban a group without being in it (by JID).
 */

import { jidNormalizedUser } from "baileys";
import {
    banUser, unbanUser, getAllBannedUsers,
    banGroup, unbanGroup, getAllBannedGroups,
} from "../lib/database.js";

export default {
    name: "gban",
    aliases: ["gunban", "gbanlist", "bangrup", "unbangrup", "bangruplist"],
    category: "owner",
    description: "Ban/unban user secara global atau ban grup. (Owner only)",
    usage: "!gban @user | !gunban @user | !gbanlist | !bangrup <groupId> | !unbangrup <groupId> | !bangruplist",
    ownerOnly: true,

    async handler({ message, sock, args, sender, prefix }) {
        try {
            const text = message.text || "";

            // Detect which sub-command was invoked based on the command used
            const cmdMatch = text.match(/^[!.#/\-](\w+)/i);
            const invokedCmd = cmdMatch ? cmdMatch[1].toLowerCase() : "gban";

            // ═══════════════════════════════════════════════════════════
            // GLOBAL USER BAN
            // ═══════════════════════════════════════════════════════════

            if (invokedCmd === "gbanlist") {
                const banned = getAllBannedUsers();
                if (banned.length === 0) {
                    return message.reply("✅ Tidak ada user yang di-global-ban.");
                }

                let reply = `🚫 *GLOBAL BAN LIST* 🚫\n\nTotal: ${banned.length} user\n\n`;
                const mentions = [];

                banned.forEach(({ userId, data }, i) => {
                    const baseId = userId.split("@")[0];
                    reply += `${i + 1}. @${baseId}`;
                    if (data.banReason) reply += ` — _${data.banReason}_`;
                    reply += `\n`;
                    mentions.push(userId);
                });

                reply += `\n_Gunakan ${prefix}gunban @user untuk unban._`;

                return sock.sendMessage(message.chat, { text: reply, mentions }, { quoted: message });
            }

            if (invokedCmd === "gunban") {
                let target = null;
                if (message.mentionedJid && message.mentionedJid.length > 0) {
                    target = message.mentionedJid[0];
                } else if (message.quoted) {
                    target = message.quoted.sender || message.quoted.participant;
                } else if (args[0]) {
                    // Allow raw number input
                    const num = args[0].replace(/[^0-9]/g, "");
                    if (num) target = num + "@s.whatsapp.net";
                }

                if (!target) {
                    return message.reply("Tag, reply, atau masukkan nomor user yang ingin di-unban.\n\nContoh: *!gunban @user* atau *!gunban 6281234567890*");
                }

                const normalizedTarget = jidNormalizedUser(target);
                const targetBaseId = target.split(":")[0].split("@")[0];

                unbanUser(normalizedTarget);

                return sock.sendMessage(
                    message.chat,
                    {
                        text: `✅ @${targetBaseId} telah di-unban secara global. Mereka bisa menggunakan bot kembali di mana pun.`,
                        mentions: [normalizedTarget],
                    },
                    { quoted: message }
                );
            }

            if (invokedCmd === "gban") {
                let target = null;
                if (message.mentionedJid && message.mentionedJid.length > 0) {
                    target = message.mentionedJid[0];
                } else if (message.quoted) {
                    target = message.quoted.sender || message.quoted.participant;
                } else if (args[0] && !args[0].includes("@g.us")) {
                    const num = args[0].replace(/[^0-9]/g, "");
                    if (num) target = num + "@s.whatsapp.net";
                }

                if (!target) {
                    return message.reply(
                        "Tag, reply, atau masukkan nomor user yang ingin di-global-ban.\n\n" +
                        "Contoh:\n" +
                        `• *${prefix}gban @user* — Ban user global\n` +
                        `• *${prefix}gunban @user* — Unban user global\n` +
                        `• *${prefix}gbanlist* — Lihat daftar global ban`
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

                // Get reason (remaining args after target)
                const reason = args.slice(1).join(" ") || null;

                banUser(normalizedTarget, sender, reason);

                let reply = `🚫 @${targetBaseId} telah di-ban secara *global*.\nUser ini tidak bisa menggunakan bot di mana pun.`;
                if (reason) reply += `\n\n📝 Alasan: _${reason}_`;
                reply += `\n\n_Gunakan ${prefix}gunban @user untuk membatalkan._`;

                return sock.sendMessage(
                    message.chat,
                    { text: reply, mentions: [normalizedTarget] },
                    { quoted: message }
                );
            }

            // ═══════════════════════════════════════════════════════════
            // GLOBAL GROUP BAN
            // ═══════════════════════════════════════════════════════════

            if (invokedCmd === "bangruplist") {
                const banned = getAllBannedGroups();
                if (banned.length === 0) {
                    return message.reply("✅ Tidak ada grup yang di-ban.");
                }

                let reply = `🚫 *BANNED GROUPS* 🚫\n\nTotal: ${banned.length} grup\n\n`;

                banned.forEach(({ chatId, data }, i) => {
                    reply += `${i + 1}. \`${chatId}\``;
                    if (data.banReason) reply += ` — _${data.banReason}_`;
                    reply += `\n`;
                });

                reply += `\n_Gunakan ${prefix}unbangrup <groupId> untuk unban._`;

                return message.reply(reply);
            }

            if (invokedCmd === "unbangrup") {
                const groupId = args[0];
                if (!groupId) {
                    return message.reply(`Masukkan Group ID yang ingin di-unban.\n\nContoh: *${prefix}unbangrup 628xxx-xxx@g.us*`);
                }

                // Validate format
                const targetGroup = groupId.includes("@g.us") ? groupId : groupId + "@g.us";

                unbanGroup(targetGroup);

                return message.reply(`✅ Grup \`${targetGroup}\` telah di-unban. Bot akan kembali merespon di grup tersebut.`);
            }

            if (invokedCmd === "bangrup") {
                // Can ban the current group or a remote group by JID
                let targetGroup = null;

                if (args[0]) {
                    // Remote group ban by JID
                    targetGroup = args[0].includes("@g.us") ? args[0] : args[0] + "@g.us";
                } else if (message.chat.endsWith("@g.us")) {
                    // Ban current group
                    targetGroup = message.chat;
                }

                if (!targetGroup) {
                    return message.reply(
                        "Masukkan Group ID atau gunakan di dalam grup.\n\n" +
                        "Contoh:\n" +
                        `• *${prefix}bangrup* — Ban grup saat ini\n` +
                        `• *${prefix}bangrup 628xxx-xxx@g.us* — Ban grup remote\n` +
                        `• *${prefix}unbangrup 628xxx-xxx@g.us* — Unban grup\n` +
                        `• *${prefix}bangruplist* — Lihat semua grup yang di-ban`
                    );
                }

                const reason = args.length > 1 ? args.slice(1).join(" ") : (args[0] ? null : (args.join(" ") || null));

                banGroup(targetGroup, sender, reason);

                let reply = `🚫 Grup \`${targetGroup}\` telah di-ban.\nBot tidak akan merespon pesan apapun di grup tersebut.`;
                if (reason) reply += `\n\n📝 Alasan: _${reason}_`;
                reply += `\n\n_Gunakan ${prefix}unbangrup ${targetGroup} untuk membatalkan._`;

                return message.reply(reply);
            }

            // Fallback usage
            return message.reply(
                `*Global Ban Commands:*\n\n` +
                `━━ User ━━\n` +
                `• *${prefix}gban @user [alasan]* — Ban user global\n` +
                `• *${prefix}gunban @user* — Unban user global\n` +
                `• *${prefix}gbanlist* — Lihat daftar\n\n` +
                `━━ Grup ━━\n` +
                `• *${prefix}bangrup [groupId]* — Ban grup\n` +
                `• *${prefix}unbangrup <groupId>* — Unban grup\n` +
                `• *${prefix}bangruplist* — Lihat daftar`
            );

        } catch (error) {
            console.error("[GBAN CMD]", error);
            message.reply("Terjadi kesalahan saat memproses perintah global ban.");
        }
    },
};
