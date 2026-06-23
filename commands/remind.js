import { addReminder, hasReminder } from "../services/reminder.js";

function parseDuration(str) {
    const regex = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
    const match = str.match(regex);
    if (!match) return null;
    if (!match[1] && !match[2] && !match[3] && !match[4]) return null;

    let ms = 0;
    if (match[1]) ms += parseInt(match[1]) * 86400000;
    if (match[2]) ms += parseInt(match[2]) * 3600000;
    if (match[3]) ms += parseInt(match[3]) * 60000;
    if (match[4]) ms += parseInt(match[4]) * 1000;
    return ms;
}

function parseAbsoluteTime(str) {
    let match = str.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        let now = new Date();
        let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(match[1]), parseInt(match[2]));
        if (target.getTime() <= now.getTime()) {
            target.setDate(target.getDate() + 1); // tomorrow if time already passed
        }
        return target.getTime();
    }
    
    match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (match) {
        let target = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]), parseInt(match[4]), parseInt(match[5]));
        return target.getTime();
    }

    match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (match) {
        let target = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]));
        return target.getTime();
    }

    return null;
}

function formatTime(timestamp) {
    const d = new Date(timestamp);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default {
    name: "remind",
    aliases: ["reminder", "pengingat"],
    category: "tools",
    description: "Membuat pengingat (waktu relatif / waktu spesifik).",
    usage: "!remind 10m Cek oven\n!remind 1d 12h Bayar tagihan\n!remind 31/12/2026 23:59 Happy New Year!",

    async handler({ message, rawArgs, sender }) {
        const chatId = message.chat;

        if (!rawArgs || rawArgs.trim() === "") {
            return message.reply(`❌ Format salah. Contoh:\n\n*Durasi:*\n!remind 10m Cek oven\n!remind 1d 12h Bayar tagihan\n\n*Tanggal Spesifik:*\n!remind 20:30 Nonton bola\n!remind 31/12/2026 23:59 Tahun Baru`);
        }

        // Cek limitasi 1 remind per user per chat
        if (hasReminder(sender, chatId)) {
            return message.reply("⚠️ Kamu masih memiliki pengingat yang aktif di obrolan ini.\nKetik *!unremind* untuk membatalkannya terlebih dahulu.");
        }

        let raw = rawArgs.trim();
        let triggerTime = null;
        let messageStr = "";
        
        // 1. Coba parsing waktu absolut
        let matchAbs1 = raw.match(/^(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})\s+(.+)/i);
        let matchAbs2 = raw.match(/^(\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})\s+(.+)/i);
        let matchAbs3 = raw.match(/^(\d{1,2}:\d{2})\s+(.+)/i);

        if (matchAbs1) {
            triggerTime = parseAbsoluteTime(matchAbs1[1]);
            if (triggerTime) messageStr = matchAbs1[2];
        } else if (matchAbs2) {
            triggerTime = parseAbsoluteTime(matchAbs2[1]);
            if (triggerTime) messageStr = matchAbs2[2];
        } else if (matchAbs3) {
            triggerTime = parseAbsoluteTime(matchAbs3[1]);
            if (triggerTime) messageStr = matchAbs3[2];
        }

        // 2. Coba parsing waktu relatif (durasi)
        if (!triggerTime) {
            let matchRel = raw.match(/^((?:\d+\s*[dhms]\s*)+)(.+)/i);
            if (matchRel) {
                let relStr = matchRel[1].replace(/\s+/g, ""); // "1d 12h" -> "1d12h"
                let duration = parseDuration(relStr);
                if (duration) {
                    triggerTime = Date.now() + duration;
                    messageStr = matchRel[2].trim();
                }
            }
        }

        // 3. Validasi akhir
        if (!triggerTime || !messageStr) {
            return message.reply("❌ Gagal mem-parsing waktu atau pesan kosong.\nPastikan formatnya benar. Contoh: `!remind 15m Angkat jemuran`");
        }

        // Limitasi maksimal 30 hari
        const maxLimitMs = 30 * 24 * 60 * 60 * 1000;
        if (triggerTime - Date.now() > maxLimitMs) {
            return message.reply("❌ Pengingat maksimal adalah 30 hari dari sekarang.");
        }
        
        if (triggerTime < Date.now()) {
            return message.reply("❌ Waktu pengingat sudah berlalu.");
        }

        try {
            addReminder(sender, chatId, triggerTime, messageStr);
            message.reply(`✅ Pengingat berhasil diset untuk:\n*🗓️ ${formatTime(triggerTime)}*`);
        } catch (error) {
            console.error(error);
            message.reply("❌ Gagal membuat pengingat.");
        }
    }
};
