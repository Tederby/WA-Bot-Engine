/**
 * PM2 Ecosystem Configuration
 *
 * Manage multiple bot instances from a single codebase.
 * Each bot gets its own BOT_ID, session folder, and config.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs              # Start all bots
 *   pm2 start ecosystem.config.cjs --only bot1  # Start specific bot
 *   pm2 logs bot1                               # View logs for bot1
 *   pm2 restart bot1                            # Restart bot1
 *
 * To add a new bot, duplicate an app entry with a unique
 * name and BOT_ID, then run: pm2 start ecosystem.config.cjs --only <name>
 */

module.exports = {
  apps: [
    {
      name: "bot1",
      script: "./index.js",
      node_args: "--experimental-vm-modules",
      env: {
        BOT_ID: "bot1",
        BOT_NAME: "MyBot",
        OWNER_NUMBER: "628xxxxxxxxxx",
        PREFIXES: "!.#/-",
        SPAM_DELAY: "5000",
        // PAIRING_NUMBER: "628xxxxxxxxxx",
      },
    },
    // ── Add more bots below ─────────────────────────────────────
    // {
    //   name: "bot2",
    //   script: "./index.js",
    //   node_args: "--experimental-vm-modules",
    //   env: {
    //     BOT_ID: "bot2",
    //     BOT_NAME: "MyBot2",
    //     OWNER_NUMBER: "628xxxxxxxxxx",
    //     PREFIXES: "!.#/-",
    //     SPAM_DELAY: "5000",
    //     // PAIRING_NUMBER: "628xxxxxxxxxx",
    //   },
    // },
  ],
};
