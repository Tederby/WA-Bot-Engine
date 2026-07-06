/**
 * Register — User registration command.
 *
 * Scalable design: stores basic metadata now, extensible via meta bag
 * for future features (XP, level, bio, etc.)
 */

import { registerUser, unregisterUser, isRegistered, getUser, saveUser, resolveUserId } from "../lib/database.js";
import { registerReplyHandler, deleteReplyHandler } from "./_registry.js";
import { verifyMalAccount } from "../services/mal.js";
import { verifySteamAccount } from "../services/steam.js";

async function processDirectLinking(cmd, value, sender, pushname, message, sock, messageKey = null) {
    if (!value) {
        const replyText = `❌ Berikan ${cmd === 'mal' ? 'username MAL' : 'custom URL atau SteamID64'}.\nContoh: \`${cmd} <value>\``;
        if (messageKey) {
            await message.reply(replyText);
        } else {
            await message.reply(replyText);
        }
        return;
    }

    if (!isRegistered(sender)) {
        registerUser(sender, pushname);
    }

    let loadingMsg = null;
    if (messageKey) {
        await sock.sendMessage(message.chat, { text: `>> *Linking ${cmd.toUpperCase()}*`, edit: messageKey });
    } else {
        loadingMsg = await sock.sendMessage(message.chat, { text: `🔍 Memverifikasi akun ${cmd.toUpperCase()}...` }, { quoted: message });
    }

    if (cmd === 'mal') {
        const result = await verifyMalAccount(value);
        if (!result) {
            const errText = `❌ Akun MAL *${value}* tidak ditemukan.`;
            if (messageKey) await sock.sendMessage(message.chat, { text: errText, edit: messageKey });
            else if (loadingMsg) await sock.sendMessage(message.chat, { text: errText, edit: loadingMsg.key });
            return;
        }

        const user = getUser(sender);
        user.meta = user.meta || {};
        user.meta.malUsername = result.username;
        saveUser(sender, user);

        const successText = `✅ Akun MAL berhasil ditautkan:\n🎌 *${result.username}*\n🔗 ${result.url}`;
        if (messageKey) await sock.sendMessage(message.chat, { text: successText, edit: messageKey });
        else if (loadingMsg) await sock.sendMessage(message.chat, { text: successText, edit: loadingMsg.key });

    } else if (cmd === 'steam') {
        const result = await verifySteamAccount(value);
        if (!result) {
            const errText = `❌ Akun Steam tidak ditemukan atau format salah.\nPastikan memasukkan Custom URL atau SteamID64 yang tepat.`;
            if (messageKey) await sock.sendMessage(message.chat, { text: errText, edit: messageKey });
            else if (loadingMsg) await sock.sendMessage(message.chat, { text: errText, edit: loadingMsg.key });
            return;
        }

        const user = getUser(sender);
        user.meta = user.meta || {};
        user.meta.steamId = result.steamId;
        saveUser(sender, user);

        const successText = `✅ Akun Steam berhasil ditautkan:\n🎮 *${result.name}*\n🔗 ${result.url}`;
        if (messageKey) await sock.sendMessage(message.chat, { text: successText, edit: messageKey });
        else if (loadingMsg) await sock.sendMessage(message.chat, { text: successText, edit: loadingMsg.key });
    }
}

export default {
    name: "register",
    aliases: ["reg", "daftar", "registrasi"],
    category: "general",
    description: "Mendaftarkan diri ke database bot dan mengatur profil.",
    usage: "!register [mal/steam] [value]",

    async handler({ message, args, sender, pushname, prefix, sock }) {
        try {
            // Safety net: pastikan sender selalu PN, bukan LID
            sender = resolveUserId(sender);

            if (args && args.length > 0) {
                const cmd = args[0].toLowerCase();
                if (cmd === "mal" || cmd === "steam") {
                    await processDirectLinking(cmd, args.slice(1).join(" ").trim(), sender, pushname, message, sock);
                    return;
                }
            }

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

    // ── Account Linking: MAL & Steam ────────────────────────────────────────
    if (cmd === "mal" || cmd === "steam") {
        const value = args.slice(1).join(" ").trim();
        deleteReplyHandler(messageKey.id);
        await processDirectLinking(cmd, value, userId, null, message, sock, messageKey);
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

