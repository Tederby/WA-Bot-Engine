# Database & Storage Architecture

WA-Bot-Engine uses **SQLite 3** via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) with Write-Ahead Logging (WAL) enabled. This architecture provides zero-configuration local persistence while safely supporting multi-process concurrency across multiple bot instances.

---

## 1. Concurrency & Connection Pragmas

The database connection is established once in [`lib/db.js`](../lib/db.js) and shared across engine modules.

```javascript
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("temp_store = MEMORY");
db.pragma("cache_size = -20000");
```

### Why WAL (Write-Ahead Logging)?
- **Concurrent Readers & Writers**: Read queries never block write queries, and write queries never block read queries. Multiple bot processes managed by PM2 can read and write to `database.db` concurrently without database locking errors.
- **`busy_timeout = 5000`**: If SQLite encounters a transient write lock from another bot instance, it retries for up to 5,000ms before throwing an exception.
- **`synchronous = NORMAL`**: Drastically reduces disk I/O latency while retaining ACID guarantees in WAL mode.

---

## 2. Table Schemas

### `users`
Stores global user metadata, registration state, and ban records.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | Canonical Phone Number JID (`<number>@s.whatsapp.net`). |
| `registered` | `INTEGER` | `DEFAULT 0` | 1 if registered, 0 if guest. |
| `registered_at`| `INTEGER` | `NULLABLE` | Unix timestamp (ms) of registration. |
| `name` | `TEXT` | `NULLABLE` | Display name from WhatsApp pushname. |
| `banned` | `INTEGER` | `DEFAULT 0` | 1 if globally banned, 0 otherwise. |
| `banned_at` | `INTEGER` | `NULLABLE` | Unix timestamp (ms) when ban was issued. |
| `banned_by` | `TEXT` | `NULLABLE` | Canonical JID of the owner/admin who issued the ban. |
| `ban_reason` | `TEXT` | `NULLABLE` | Human-readable reason for the ban. |
| `meta` | `TEXT` | `DEFAULT '{}'` | Serialized JSON object for arbitrary user metadata (e.g. `meta.isBotAdmin`, `meta.callCount`). |

---

### `groups`
Stores group configurations, features, and group-wide ban status.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | Group JID (`<id>@g.us`). |
| `welcome` | `INTEGER` | `DEFAULT 0` | Welcome toggle flag. |
| `welcome_text` | `TEXT` | `DEFAULT ''` | Custom welcome message template. |
| `goodbye` | `INTEGER` | `DEFAULT 0` | Goodbye toggle flag. |
| `goodbye_text` | `TEXT` | `DEFAULT ''` | Custom goodbye message template. |
| `registered` | `INTEGER` | `DEFAULT 0` | 1 if registered in bot registry. |
| `registered_at`| `INTEGER` | `NULLABLE` | Unix timestamp (ms) of registration. |
| `registered_by`| `TEXT` | `NULLABLE` | JID of the user who registered the group. |
| `banned` | `INTEGER` | `DEFAULT 0` | 1 if bot is globally disabled in this group. |
| `banned_at` | `INTEGER` | `NULLABLE` | Unix timestamp (ms) of ban. |
| `banned_by` | `TEXT` | `NULLABLE` | JID of issuer. |
| `ban_reason` | `TEXT` | `NULLABLE` | Reason string. |
| `auto_replies` | `TEXT` | `DEFAULT '{}'` | Serialized JSON dictionary of custom keyword triggers. |
| `meta` | `TEXT` | `DEFAULT '{}'` | Serialized JSON object for arbitrary group metadata. |

---

### `group_banned_users`
Junction table tracking users banned from using the bot within a specific group.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `group_id` | `TEXT` | `NOT NULL` | Group JID (`<id>@g.us`). |
| `user_id` | `TEXT` | `NOT NULL` | Canonical Phone Number JID of the banned user. |
| `banned_at` | `INTEGER` | `NOT NULL` | Unix timestamp (ms). |
| `banned_by` | `TEXT` | `NULLABLE` | Admin/Owner who banned the user. |
| `reason` | `TEXT` | `NULLABLE` | Reason for group-level ban. |

*Primary Key:* `PRIMARY KEY (group_id, user_id)`

---

### `message_claims`
Coordinates message processing among multiple bot instances sharing the same groups.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `stanza_id` | `TEXT` | `PRIMARY KEY` | Unique message ID emitted by WhatsApp (`message.key.id`). |
| `bot_id` | `TEXT` | `NOT NULL` | Instance identifier (`setting.botId`). |
| `created_at` | `INTEGER` | `NOT NULL` | Unix timestamp (ms) of claim. |

*Indexes:* `idx_claims_created ON message_claims(created_at)`

---

### `bot_registry`
Tracks online bot instances for auto-discovery and priority ranking.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `bot_id` | `TEXT` | `PRIMARY KEY` | Configured bot ID (`bot1`, `bot2`, etc.). |
| `jid` | `TEXT` | `NOT NULL` | Phone number JID of the bot instance. |
| `last_seen` | `INTEGER` | `NOT NULL` | Unix timestamp (ms) of latest heartbeat. |

---

### `identity_map`
Passive mapping table between WhatsApp Privacy LIDs (`@lid`) and Phone Number JIDs (`@s.whatsapp.net`).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `lid` | `TEXT` | `PRIMARY KEY` | Linked Device ID (`<hash>@lid`). |
| `pn` | `TEXT` | `NOT NULL` | Phone Number JID (`<number>@s.whatsapp.net`). |

*Indexes:* `idx_identity_pn ON identity_map(pn)`

---

## 3. The Canonical JID Rule

> **Never use raw JIDs as primary keys or query arguments for user data.**

Always pass user identifiers through [`toCanonicalUserId(jid)`](../lib/database.js):

```javascript
import { toCanonicalUserId } from "./database.js";

// Input:  "628123456789:12@s.whatsapp.net" -> Output: "628123456789@s.whatsapp.net"
// Input:  "12345678901234@lid"             -> Output: "628123456789@s.whatsapp.net" (via identity_map)
const canonicalId = toCanonicalUserId(rawJid);
```

Every database function inside `lib/database.js` automatically applies this transformation:
- `getUser(userId)`
- `saveUser(userId, data)`
- `banUser(userId, bannedBy, reason)`
- `isBanned(userId)`
- `banUserInGroup(chatId, userId)`
- `isUserGroupBanned(chatId, userId)`

---

## 4. Periodic Maintenance & Space Reclamation

SQLite databases in WAL mode accumulate database pages and wal logs over time. WA-Bot-Engine automatically maintains the database through [`services/cleanup.js`](../services/cleanup.js):

- **Stale Claims Purging**: Claims older than 5 minutes (`setting.claimsPurgeAge`) are purged periodically.
- **Periodic VACUUM**: Executes `VACUUM` every 30 minutes (`setting.vacuumInterval`) to defragment the SQLite database file and reclaim unused disk space.
