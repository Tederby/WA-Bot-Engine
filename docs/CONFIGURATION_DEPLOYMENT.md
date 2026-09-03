# Configuration & Deployment Guide

This guide details configuration variables, PM2 multi-instance clustering, connection modes (QR code vs pairing code), and production deployment practices for **WA-Bot-Engine**.

---

## 1. Environment Variables & `setting.js`

Configuration is managed via environment variables (loaded through `.env` or injected by PM2) and consolidated in [`setting.js`](../setting.js).

### Configuration Options

| Variable / Key | Default | Description |
| :--- | :--- | :--- |
| `BOT_ID` | `"default"` | Unique identifier for this bot process (used for session & temp directories). |
| `BOT_NAME` | `"MyBot"` | Bot display name used in system messages and headers. |
| `OWNER_NUMBERS` | `""` | Comma-separated list of owner phone numbers (e.g. `628123456789,628987654321`). |
| `PREFIXES` | `"!.#/-"` | Characters recognized as command prefixes. |
| `PAIRING_NUMBER` | `""` | Bot's phone number for pairing code authentication (leave blank for QR). |
| `SPAM_DELAY` | `5000` | Cooldown period (in milliseconds) per chat between commands. |
| `DEFAULT_COUNTRY_CODE` | `"62"` | Country code prepended to local-format numbers (e.g. `08123...` -> `628123...`). |
| `TEMP_DIR` | `./temp/<botId>` | Directory for storing temporary downloads or rendered assets. |
| `CLEANUP_INTERVAL` | `600000` (10m) | Interval for scanning and purging expired files and states. |
| `FILE_EXPIRY` | `1800000` (30m)| Maximum age for temporary files before automatic deletion. |
| `REPLY_HANDLER_EXPIRY` | `900000` (15m)| Time before registered interactive reply handlers expire. |
| `CLAIMS_PURGE_AGE` | `300000` (5m) | Age threshold for deleting old entries in `message_claims`. |
| `VACUUM_INTERVAL` | `1800000` (30m)| Interval for running SQLite disk space `VACUUM`. |

---

## 2. Authentication Modes

WA-Bot-Engine supports two authentication methods for connecting to WhatsApp:

### Method A: Terminal QR Code (Default)
When starting in an interactive terminal, the bot prints a QR code to the console:
```bash
npm start
```
1. Open WhatsApp on your phone.
2. Tap **Settings** (or **⋮**) > **Linked Devices** > **Link a Device**.
3. Point your phone camera at the terminal QR code.

### Method B: Headless Pairing Code (Recommended for VPS)
If deploying to a headless cloud server or remote VPS without easy terminal QR rendering:
1. Set `PAIRING_NUMBER` in `.env` or `ecosystem.config.cjs`:
   ```bash
   PAIRING_NUMBER=6281234567890
   ```
2. Start the bot. The engine will request an 8-character pairing code from WhatsApp servers:
   ```
   [bot1] | Pairing Code: ABCD-1234
   ```
3. Open WhatsApp on your phone > **Linked Devices** > **Link with phone number instead**.
4. Enter the 8-character code to link.

---

## 3. Production Deployment with PM2

WA-Bot-Engine is designed to run natively under **PM2** for process resurrection, logging, and multi-bot clustering.

### `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [
    {
      name: "bot1",
      script: "./index.js",
      node_args: "--experimental-vm-modules",
      env: {
        BOT_ID: "bot1",
        BOT_NAME: "AlphaBot",
        OWNER_NUMBERS: "6281234567890",
        PREFIXES: "!.#/-",
        SPAM_DELAY: "5000",
        PAIRING_NUMBER: "6281234567890",
      },
    },
    {
      name: "bot2",
      script: "./index.js",
      node_args: "--experimental-vm-modules",
      env: {
        BOT_ID: "bot2",
        BOT_NAME: "BetaBot",
        OWNER_NUMBERS: "6281234567890",
        PREFIXES: "!.#/-",
        SPAM_DELAY: "5000",
        PAIRING_NUMBER: "6289876543210",
      },
    },
  ],
};
```

### Essential PM2 Commands

```bash
# Start all configured bot instances
npm run pm2

# Stop all bot instances
npm run pm2:stop

# Start or restart a specific bot
pm2 start ecosystem.config.cjs --only bot1
pm2 restart bot1

# View consolidated live logs
pm2 logs

# View logs for a specific bot (e.g. to see pairing code)
pm2 logs bot1 --lines 50

# Save PM2 process list to resurrect on system reboot
pm2 save
pm2 startup
```

---

## 4. System Prerequisites

- **Node.js**: v18.0.0 or higher (`Node.js v20 LTS` recommended).
- **Native Build Tools** (required by `better-sqlite3`):
  - **Linux / Ubuntu / Debian**:
    ```bash
    sudo apt update && sudo apt install -y build-essential python3
    ```
  - **Windows**:
    Run in PowerShell as Administrator:
    ```powershell
    npm install -g windows-build-tools
    ```
    *(Or install "Desktop development with C++" via Visual Studio Installer)*
