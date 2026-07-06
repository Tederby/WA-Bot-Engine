export default {
    name: "ping",
    aliases: ["test", "tes"],
    category: "general",
    description: "Check bot response time",
    usage: "!ping",
    async handler({ message }) {
        const t = message.messageTimestamp;
        await message.reply(`Pong! 🏓\n\nSpeed: ${Date.now() - t * 1000} ms`);
    }
};
