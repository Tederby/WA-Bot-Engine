/**
 * Profile — Display user profile information with database integration.
 */

import { jidNormalizedUser } from "baileys";
import { getUser, isBanned, isUserGroupBanned } from "../lib/database.js";
import setting from "../setting.js";

export default {
    name: "profile",
    aliases: ["pfp", "profil"],
    category: "general",
    description: "Melihat profil pengguna dengan info registrasi dan status.",
    usage: "!profile [@user/reply]",

    async handler({ message, sock, sender, pushname, isGroup, isGroupAdmins, groupMetadata, ownerNumbers, prefix }) {
        try {
            // ── 1. Determine target ─────────────────────────────────
            let target = null;
            let targetName = null;

            if (message.mentionedJid && message.mentionedJid.length > 0) {
                target = message.mentionedJid[0];
            } else if (message.quoted) {
                target = message.quoted.sender || message.quoted.participant;
            } else {
                target = sender;
                targetName = pushname || "Tidak diketahui";
            }

            if (!target) {
                return message.reply("Gagal mendapatkan target pengguna. Pastikan tag atau reply pesan dengan benar.");
            }

            const normalizedTarget = jidNormalizedUser(target);
            const targetBaseId = target.split(":")[0].split("@")[0];

            // ── 2. Owner check ──────────────────────────────────────
            const botBaseId = sock.user.id.split(":")[0].split("@")[0];
            const isTargetOwner =
                setting.owner.includes(targetBaseId) ||
                ownerNumbers.includes(normalizedTarget) ||
                targetBaseId === botBaseId;

            // ── 3. Admin check (group only) ─────────────────────────
            let isTargetAdmin = false;
            if (isGroup) {
                if (target === sender) {
                    isTargetAdmin = isGroupAdmins;
                } else if (groupMetadata && groupMetadata.participants) {
                    isTargetAdmin = groupMetadata.participants.some(p => {
                        const pBase = p.id.split(":")[0].split("@")[0];
                        return pBase === targetBaseId && p.admin;
                    });
                }
            }

            // ── 4. Database info ────────────────────────────────────
            const userData = getUser(normalizedTarget);
            const isTargetBanned = isBanned(normalizedTarget);
            const isTargetGroupBanned = isGroup
                ? isUserGroupBanned(message.chat, normalizedTarget)
                : false;

            const regDate = userData.registeredAt
                ? new Date(userData.registeredAt).toLocaleDateString("id-ID", {
                    day: "numeric", month: "long", year: "numeric",
                })
                : null;

            // ── 5. Build profile display ────────────────────────────
            let caption = `╔══ *PROFILE INFO* ══╗\n\n`;

            // Name (only available if target is the sender)
            if (targetName) {
                caption += `👤 *Nama:* ${targetName}\n`;
            } else if (userData.name) {
                caption += `👤 *Nama:* ${userData.name}\n`;
            }

            caption += `🏷️ *User:* @${targetBaseId}\n`;
            caption += `👑 *Owner:* ${isTargetOwner ? "Ya" : "Tidak"}\n`;

            if (isGroup) {
                caption += `🛡️ *Admin Grup:* ${isTargetAdmin ? "Ya" : "Tidak"}\n`;
            }

            // Registration status
            caption += `\n━━ Status ━━\n`;

            if (userData.registered) {
                caption += `📋 *Registrasi:* ✅ Terdaftar\n`;
                if (regDate) caption += `📅 *Sejak:* ${regDate}\n`;
            } else {
                caption += `📋 *Registrasi:* ❌ Belum terdaftar\n`;
                if (target === sender) {
                    caption += `_Ketik ${prefix}register untuk mendaftar._\n`;
                }
            }

            // Ban status
            if (isTargetBanned) {
                caption += `🚫 *Global Ban:* ⛔ Ya\n`;
                if (userData.banReason) caption += `📝 *Alasan:* _${userData.banReason}_\n`;
            } else {
                caption += `🚫 *Global Ban:* Tidak\n`;
            }

            if (isGroup && isTargetGroupBanned) {
                caption += `🚫 *Ban Grup:* ⛔ Ya\n`;
            }

            caption += `\n╚═══════════════════╝`;

            // ── 6. Send ─────────────────────────────────────────────
            const placeholderImageUrl = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";

            await sock.sendMessage(
                message.chat,
                {
                    image: { url: placeholderImageUrl },
                    caption: caption,
                    mentions: [normalizedTarget],
                },
                { quoted: message }
            );

        } catch (error) {
            console.error("[PROFILE CMD]", error);
            message.reply("Terjadi kesalahan sistem saat memproses profil.");
        }
    },
};
