export default {
    name: "ping",
    aliases: ["test", "tes"],
    category: "general",
    description: "Check bot response time",
    usage: "!ping",
    multiBot: true,
    async handler({ message }) {
        const t = message.messageTimestamp;
        const latency = Math.max(0, Date.now() - t * 1000);
        await message.reply(
            `🏓 *PONG*\n` +
            `────────────────────────\n` +
            `⋄ Response : *${latency} ms*\n` +
            `────────────────────────`
        );
    }
};
