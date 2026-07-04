/**
 * Profile — Display user profile information with database integration.
 */

import { jidNormalizedUser } from "baileys";
import { getUser, isBanned, isUserGroupBanned } from "../lib/database.js";
import setting from "../setting.js";
import fs from "fs";
import path from "path";

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
            let caption = `╭━━━〔 👤 Profile Info 〕━━━\n`;

            if (targetName) {
                caption += `┃ 📛 Nama  : ${targetName}\n`;
            } else if (userData.name) {
                caption += `┃ 📛 Nama  : ${userData.name}\n`;
            } else {
                caption += `┃ 📛 Nama  : -\n`;
            }

            const isTargetBotAdmin = userData.meta?.isBotAdmin === true;

            const roles = [];
            if (isTargetOwner) roles.push("👑 System Owner");
            else if (isTargetBotAdmin) roles.push("🛡️ Bot Admin");

            if (isTargetAdmin) roles.push("👮 Group Admin");

            if (roles.length === 0) roles.push("👤 Member");

            caption += `┃ 🏷️ User  : @${targetBaseId}\n`;
            caption += `┃ 🎖️ Role  : ${roles.join(", ")}\n`;
            caption += `╰━━━━━━━━━━━━━━━━━━━━\n\n`;

            // Registration status
            caption += `╭───「 📝 Registrasi 」\n`;

            if (userData.registered) {
                caption += `│ ⋄ Status : ✅ Terdaftar\n`;
                if (regDate) caption += `│ ⋄ Sejak  : ${regDate}\n`;
                if (target === sender) {
                    caption += `│   └ _Ketik \`${prefix}register\` untuk pengaturan_\n`;
                }
            } else {
                caption += `│ ⋄ Status : ❌ Belum terdaftar\n`;
                if (target === sender) {
                    caption += `│   └ _Ketik \`${prefix}register\` untuk mendaftar_\n`;
                }
            }
            caption += `╰──────────────\n\n`;

            // Ban status
            caption += `╭───「 🚫 Status Ban 」\n`;
            if (isTargetBanned) {
                caption += `│ ⋄ Global : ⛔ Ya\n`;
                if (userData.banReason) caption += `│   └ Alasan: _${userData.banReason}_\n`;
            } else {
                caption += `│ ⋄ Global : Tidak\n`;
            }

            if (isGroup) {
                if (isTargetGroupBanned) {
                    caption += `│ ⋄ Grup   : ⛔ Ya\n`;
                } else {
                    caption += `│ ⋄ Grup   : Tidak\n`;
                }
            }
            caption += `╰──────────────`;

            // ── 6. Send ─────────────────────────────────────────────
            const placeholderImageUrl = "https://i.imgur.com/ckO9GJN.png";
            let pfpSource = { url: placeholderImageUrl };
            let isDefault = true;

            if (userData.meta?.pfp) {
                const pfpPath = path.resolve(process.cwd(), "database", "pfp", userData.meta.pfp);
                if (fs.existsSync(pfpPath)) {
                    pfpSource = { url: pfpPath };
                    isDefault = false;
                }
            }

            if (isDefault) {
                try {
                    // Try to fetch from WhatsApp with a timeout to prevent hanging
                    const waPfpPromise = sock.profilePictureUrl(normalizedTarget, 'image');
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
                    const waPfp = await Promise.race([waPfpPromise, timeoutPromise]);
                    if (waPfp) {
                        pfpSource = { url: waPfp };
                        isDefault = false; // We got a real PFP from WA
                    }
                } catch (err) {
                    // Silent catch, fallback to placeholder
                }
            }

            if (isDefault) {
                caption += `\n\n💡 *Tips*: Gunakan perintah \`${prefix}setpfp\` untuk memasang PFP kustom, atau \`${prefix}setpfp delete\` untuk menghapusnya.`;
            }

            await sock.sendMessage(
                message.chat,
                {
                    image: pfpSource,
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
