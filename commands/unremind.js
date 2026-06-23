import { removeReminder } from "../services/reminder.js";

export default {
    name: "unremind",
    aliases: ["cancelremind", "batalremind"],
    category: "tools",
    description: "Membatalkan pengingat yang sedang aktif di obrolan ini.",
    usage: "!unremind",

    async handler({ message, sender }) {
        const chatId = message.chat;
        const isRemoved = removeReminder(sender, chatId);

        if (isRemoved) {
            message.reply("✅ Pengingat aktifmu di obrolan ini telah dibatalkan.");
        } else {
            message.reply("⚠️ Kamu tidak memiliki pengingat yang aktif di obrolan ini.");
        }
    }
};
