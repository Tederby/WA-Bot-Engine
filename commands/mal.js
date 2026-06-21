export default {
    name: "mal",
    aliases: [],
    category: "anime",
    description: "Redirect pencarian anime & manga",
    usage: "!mal",
    async handler({ message }) {
        await message.reply("🔄 Command pencarian kini telah dipisah agar lebih presisi.\n\nSilakan gunakan:\n👉 `!anime <judul>` untuk mencari Anime\n👉 `!manga <judul>` untuk mencari Manga/Light Novel/Manhwa\n\nKedua perintah ini akan memberikan list pencarian yang bisa dipilih! ✨");
    }
};
