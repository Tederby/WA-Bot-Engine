/**
 * Register — User registration command.
 *
 * Scalable design: stores basic metadata now, extensible via meta bag
 * for future features (XP, level, bio, etc.)
 */

import { registerUser, unregisterUser, isRegistered, getUser, saveUser } from "../lib/database.js";
import { registerReplyHandler, deleteReplyHandler } from "./_registry.js";

export default {
    name: "register",
    aliases: ["reg", "daftar", "registrasi"],
    category: "general",
    description: "Mendaftarkan diri ke database bot dan mengatur profil.",
    usage: "!register",

    async handler({ message, sender, pushname, prefix, sock }) {
        try {
            let user;
            let isNewUser = false;
            
            if (!isRegistered(sender)) {
                user = registerUser(sender, pushname);
                isNewUser = true;
            } else {
                user = getUser(sender);
            }

            const regDate = user.registeredAt
                ? new Date(user.registeredAt).toLocaleDateString("id-ID", {
                    day: "numeric", month: "long", year: "numeric",
                })
                : "Tidak diketahui";

            let caption = `╭━━━〔 📝 Registrasi 〕━━━\n`;
            if (isNewUser) {
                caption += `┃ ✅ *Registrasi Berhasil!*\n`;
                caption += `┃ Selamat datang di database bot.\n`;
            } else {
                caption += `┃ ℹ️ *Informasi Akun*\n`;
            }
            caption += `┣━━━━━━━━━━━━━━━━━━━━\n`;
            caption += `┃ 📛 Nama   : ${user.name || "Tidak diketahui"}\n`;
            caption += `┃ 📅 Tanggal: ${regDate}\n`;
            caption += `╰━━━━━━━━━━━━━━━━━━━━\n\n`;

            caption += `╭━━━〔 ⚙️ Menu Pengaturan 〕━━━\n`;
            caption += `┃ Balas pesan ini dengan:\n`;
            caption += `┃\n`;
            caption += `┃ ⚙️ *Akun*\n`;
            caption += `┃ ⋄ \`name <nama baru>\` ganti nama\n`;
            caption += `┃ ⋄ \`unreg\` hapus registrasi\n`;
            caption += `┃\n`;
            caption += `┃ 🔗 *Link Akun*\n`;
            caption += `┃ ⋄ \`mal <username>\` tautkan MAL\n`;
            caption += `┃ ⋄ \`steam <custom_url/steamid>\` tautkan Steam\n`;
            caption += `┃ ⋄ \`unlink mal\` lepas MAL\n`;
            caption += `┃ ⋄ \`unlink steam\` lepas Steam\n`;
            caption += `╰━━━━━━━━━━━━━━━━━━━━`;

            const sentMsg = await sock.sendMessage(message.chat, { text: caption }, { quoted: message });

            registerReplyHandler(sentMsg.key.id, replyHandler, {
                userId: sender,
                messageKey: sentMsg.key,
                commandName: "register"
            });

        } catch (error) {
            console.error("[REGISTER CMD]", error);
            message.reply("Terjadi kesalahan saat memproses registrasi.");
        }
    },
};

async function replyHandler({ message, sock, state }) {
    const text = message.text.trim();
    const args = text.split(" ");
    const cmd = args[0].toLowerCase();
    
    const { userId, messageKey } = state;

    if (cmd === "name") {
        const newName = args.slice(1).join(" ");
        if (!newName) {
            await message.reply("❌ Berikan nama baru yang ingin digunakan.\nContoh: `name Tederby`");
            return;
        }

        const user = getUser(userId);
        user.name = newName;
        saveUser(userId, user);

        deleteReplyHandler(messageKey.id);
        
        await sock.sendMessage(message.chat, { text: `>> *Changing name*`, edit: messageKey });
        await message.reply(`✅ Nama kamu berhasil diubah menjadi *${newName}*.`);
        return;
    }

    if (cmd === "unreg" || cmd === "unregister") {
        unregisterUser(userId);
        deleteReplyHandler(messageKey.id);
        
        await sock.sendMessage(message.chat, { text: `>> *Unregistering*`, edit: messageKey });
        await message.reply(`✅ Registrasi kamu telah dihapus dari database bot.`);
        return;
    }

    // ── Account Linking: MAL ────────────────────────────────────────
    if (cmd === "mal") {
        const username = args.slice(1).join(" ").trim();
        if (!username) {
            await message.reply("❌ Berikan username MAL.\nContoh: `mal Tederby`");
            return;
        }

        const user = getUser(userId);
        user.meta = user.meta || {};
        user.meta.malUsername = username;
        saveUser(userId, user);

        deleteReplyHandler(messageKey.id);
        await sock.sendMessage(message.chat, { text: `>> *Linking MAL*`, edit: messageKey });
        await message.reply(`✅ Akun MAL berhasil ditautkan: *${username}*`);
        return;
    }

    // ── Account Linking: Steam ──────────────────────────────────────
    if (cmd === "steam") {
        const steamId = args.slice(1).join("").trim();
        if (!steamId) {
            await message.reply("❌ Berikan custom URL atau SteamID64.\nContoh: `steam gabelogannewell`");
            return;
        }

        const user = getUser(userId);
        user.meta = user.meta || {};
        user.meta.steamId = steamId;
        saveUser(userId, user);

        deleteReplyHandler(messageKey.id);
        await sock.sendMessage(message.chat, { text: `>> *Linking Steam*`, edit: messageKey });
        await message.reply(`✅ Akun Steam berhasil ditautkan: *${steamId}*`);
        return;
    }

    // ── Unlink Accounts ─────────────────────────────────────────────
    if (cmd === "unlink") {
        const service = (args[1] || "").toLowerCase();
        if (service !== "mal" && service !== "steam") {
            await message.reply("❌ Pilih akun yang ingin dilepas: `unlink mal` atau `unlink steam`");
            return;
        }

        const user = getUser(userId);
        user.meta = user.meta || {};

        const metaKey = service === "mal" ? "malUsername" : "steamId";
        if (!user.meta[metaKey]) {
            await message.reply(`❌ Tidak ada akun ${service.toUpperCase()} yang tertaut.`);
            return;
        }

        delete user.meta[metaKey];
        saveUser(userId, user);

        deleteReplyHandler(messageKey.id);
        await sock.sendMessage(message.chat, { text: `>> *Unlinking ${service.toUpperCase()}*`, edit: messageKey });
        await message.reply(`✅ Tautan akun ${service.toUpperCase()} telah dilepas.`);
        return;
    }
}

