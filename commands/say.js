export default {
    name: "say",
    aliases: [],
    category: "tools",
    description: "Echo text back to the sender",
    usage: "!say <text>",
    async handler({ message, rawArgs, sock }) {
        if (!rawArgs) return message.reply("Masukkan teks!");
        
        let outText = rawArgs;
        
        // Mencegah loop eksekusi jika user iseng memasukkan command bot (misal: !say !menu)
        // Dengan menyisipkan karakter tidak terlihat (Zero-Width Space) di awal
        const prefixes = ["!", ".", "#", "/", "-", "$"];
        if (prefixes.includes(outText[0])) {
            outText = "\u200B" + outText;
        }

        // Cari URL di dalam teks
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const match = outText.match(urlRegex);
        
        if (match && match.length > 0) {
            // Jika ada link, gunakan matchedText agar Baileys men-generate preview
            await sock.sendMessage(
                message.chat,
                { 
                    text: outText,
                    matchedText: match[0] 
                },
                { quoted: message }
            );
        } else {
            await message.reply(outText);
        }
    }
};
