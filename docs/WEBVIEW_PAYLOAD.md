# WhatsApp In-App Webview Payload Specification & UI Engine

> **Comprehensive Technical Specification & Implementation Guide**
> Covers both the universal, transport-agnostic WhatsApp in-app webview protocol (`GenAIaeacdsnwHtmlPrimitive`) for any Baileys bot, and the project-specific UI engine architecture (`lib/uiEngine.js`).

---

## 0. Overview & Research Status

WhatsApp clients (Android, iOS, and Web/Desktop) contain a native sandboxed WebView container initially deployed for Meta AI rich interactive responses. By constructing an undocumented protobuf stanza structure, third-party bots can deliver rich, interactive HTML/CSS/JavaScript webviews directly into WhatsApp chat threads.

> [!NOTE]
> **Empirical Benchmark & Audit Metadata (September 4, 2026)**:
> All specifications, size boundaries, and sandbox capability matrices in this document were empirically audited and verified on **September 4, 2026** using:
> - **OS & Device**: Android 12 (Xiaomi Redmi M2003J15SC, Build `SP1A.210812.016`)
> - **WebView Engine**: Chrome WebView `151.0.7922.199` (WebKit `537.36`)
> - **Screen Benchmark**: `393x851` CSS px (DPR `2.75`)
> *Notice: Because this protocol utilizes undocumented Meta AI protobuf primitives, WhatsApp may alter, restrict, or deprecate these behaviors in future client builds or server-side router updates.*

---

## PART I: UNIVERSAL PROTOCOL SPECIFICATION (BAILEYS-AGNOSTIC)

This section provides a standalone reference for any bot developer using [Baileys](https://github.com/WhiskeySockets/Baileys) (or equivalent WhatsApp Web API libraries).

### 1. Protobuf Hierarchy & Envelope

Webview payloads cannot be transmitted via standard `conversation` or `extendedTextMessage` fields. They must be packaged inside a multi-layered protobuf hierarchy:

```text
Message (Stanza Root)
  └─► messageContextInfo
  │     ├─► deviceListMetadata: {}
  │     ├─► deviceListMetadataVersion: 2
  │     └─► botMetadata
  │           └─► botResponseId: <UUIDv4>
  └─► botForwardedMessage
        └─► message
              └─► richResponseMessage
                    ├─► messageType: 1
                    ├─► submessages: [
                    │     └─► messageType: 2
                    │     └─► messageText: "<Message Preview / Title>"
                    │   ]
                    ├─► unifiedResponse
                    │     └─► data: <Base64-encoded JSON payload>
                    └─► contextInfo
                          ├─► forwardingScore: 0          <-- Set 0 + isForwarded: false to hide "Forwarded" badge
                          ├─► isForwarded: false          <-- Removes the "Forwarded" label under the title
                          ├─► forwardOrigin: 1            <-- Clean origin
                          └─► forwardedAiBotMessageInfo
                                └─► botJid: "867051314767696@bot"  <-- Or custom bot JID (<number>@s.whatsapp.net)
```

#### Envelope Field Insights (Empirically Verified as of 2026-09-04)
- **Hiding the "Forwarded" Badge**: Setting `isForwarded: false`, `forwardingScore: 0`, and `forwardOrigin: 1` successfully removes the "Forwarded" tag above the card, producing a clean, native UI appearance.
- **Custom `botJid` Supported**: While `"867051314767696@bot"` is the standard Meta AI bot JID, the router and client also accept your bot's own JID (e.g. `628xxx@s.whatsapp.net`). Both render identically.
- **Native Reply Quote (`quotedMessage`) Supported**: Setting `contextInfo.stanzaId`, `contextInfo.participant`, and `contextInfo.quotedMessage` (from the triggering message) renders a clean native quote reply bubble linking the webview card directly to the user's command.
- **Ephemeral Timer Ignored**: Passing `contextInfo.expiration` (e.g. `86400`) in bot stanzas is ignored by WhatsApp client routers (disappearing message policies are enforced at the chat room level, not per-stanza). Manual auto-deletion via bot socket remains required.

### 2. JSON Payload Schema

The `unifiedResponse.data` field requires a Base64-encoded JSON string adhering to the following schema:

```json
{
  "response_id": "<UUIDv4>",
  "sections": [
    {
      "view_model": {
        "primitive": {
          "__typename": "GenAIaeacdsnwHtmlPrimitive",
          "payload": "<!DOCTYPE html><html>...</html>",
          "trusted_sources": []
        },
        "__typename": "GenAISingleLayoutViewModel"
      }
    }
  ]
}
```

#### Field Definitions & Discoveries
- `response_id` (*string*, required): Unique UUIDv4 matching `botResponseId`.
- `sections[].view_model.__typename` (*string*): Must be `"GenAISingleLayoutViewModel"`.
- `sections[].view_model.primitive.__typename` (*string*): Must be `"GenAIaeacdsnwHtmlPrimitive"`.
- `sections[].view_model.primitive.payload` (*string*): Complete HTML document markup, including `<style>` and `<script>`.
- `sections[].view_model.primitive.trusted_sources` (*array*): Array of strings. *(Empirical finding: Does **not** whitelist external image loading. Sandbox network restrictions remain strictly active even if domains are listed here).*
- **Native Multi-Card / Stacked Layout Supported**: The `sections` array natively supports multiple section items (`sections.length > 1`). WhatsApp renders multiple cards stacked together inside a single chat bubble!

### 3. Minimal Standalone Baileys Snippet

Any bot developer can copy and adapt this standalone function to dispatch HTML webviews:

```javascript
import { randomUUID } from "crypto";

/**
 * Dispatches an interactive HTML webview message to a WhatsApp chat.
 * Compatible with Baileys socket instances.
 *
 * @param {import("baileys").WASocket} sock - Baileys socket
 * @param {string} chatId - Target JID (e.g. "628xxx@s.whatsapp.net" or "xxx@g.us")
 * @param {object} options
 * @param {string} options.title - Preview title shown in push notifications and chat previews
 * @param {string} options.html - Full HTML markup string
 * @param {object} [options.quoted] - Optional quoted message context for native reply bubble
 * @param {string} [options.quoted.stanzaId] - Message ID to quote
 * @param {string} [options.quoted.participant] - JID of the quoted message sender
 * @param {object} [options.quoted.quotedMessage] - The quoted message object
 * @returns {Promise<{ key: object, messageId: string }>}
 */
export async function sendHtmlWebview(sock, chatId, { title, html, quoted }) {
    const responseId = randomUUID();
    const BOT_JID = "867051314767696@bot"; // Universal Meta AI bot JID

    // 1. Serialize the HTML primitive into Base64
    const payload = Buffer.from(
        JSON.stringify({
            response_id: responseId,
            sections: [
                {
                    view_model: {
                        primitive: {
                            __typename: "GenAIaeacdsnwHtmlPrimitive",
                            payload: html,
                            trusted_sources: [],
                        },
                        __typename: "GenAISingleLayoutViewModel",
                    },
                },
            ],
        })
    ).toString("base64");

    // 2. Build contextInfo with clean forwarding (no "Forwarded" badge)
    const contextInfo = {
        forwardingScore: 0,           // 0 = not forwarded
        isForwarded: false,           // Removes "Forwarded" label
        forwardOrigin: 1,             // Clean origin
        forwardedAiBotMessageInfo: {
            botJid: BOT_JID,
        },
    };

    // 3. Optionally attach native reply quote bubble
    if (quoted) {
        contextInfo.stanzaId = quoted.stanzaId;
        contextInfo.participant = quoted.participant;
        contextInfo.quotedMessage = quoted.quotedMessage;
    }

    // 4. Relay the message with botForwardedMessage envelope
    await sock.relayMessage(
        chatId,
        {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                botMetadata: {
                    botResponseId: responseId,
                },
            },
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: [
                            {
                                messageType: 2,
                                messageText: title || "Interactive UI",
                            },
                        ],
                        unifiedResponse: {
                            data: payload,
                        },
                        contextInfo,
                    },
                },
            },
        },
        { messageId: responseId }
    );

    return {
        key: { remoteJid: chatId, fromMe: true, id: responseId },
        messageId: responseId,
    };
}
```

---

## PART II: EMPIRICAL RUNTIME CAPABILITY MATRIX

The WhatsApp client renders the payload inside an isolated, sandboxed WebView (`about:blank` origin). The following matrix reflects verified empirical results benchmarked on **September 4, 2026** (Android 12, Chrome WebView 151.0.7922.199):

| Category | Supported (`✓`) | Blocked / Quarantined (`✗`) | Empirical Findings & Technical Details |
|:---|:---|:---|:---|
| **CSS Layout** | `display: grid`, `flex`, `subgrid`, Container Queries (`container-type`), `aspect-ratio`, `position: sticky`, `:has()`, `:is()` | — | **100% PASS**. Full modern CSS layout is functional. Fluid responsive layouts and subgrids render flawlessly. |
| **CSS Visuals** | `backdrop-filter`, `filter`, `clip-path`, `mix-blend-mode`, `color: oklch()`, `accent-color`, `scroll-snap-type`, scroll-driven animations | — | High-fidelity dark mode, custom shapes, and backdrop filters work natively without visual glitches. |
| **Client Storage** | — | `IndexedDB` (open throws `SecurityError`), `localStorage`, `sessionStorage`, `document.cookie`, `Cache Storage`, `OPFS` | **Zero Persistence**: Calling `indexedDB.open()` throws `SecurityError: access to Indexed Database API is denied in this context`. All storage APIs are quarantined due to the opaque `about:blank` sandbox origin. UI state MUST reside strictly in JavaScript memory variables. |
| **Network & Comms** | `BroadcastChannel` (API present) | Outbound `fetch()` (blocked at runtime), `WebSocket` (handshake blocked), `XMLHttpRequest`, `EventSource` | **Air-Gapped Sandbox**: Network API constructors (`fetch`, `WebSocket`, `XMLHttpRequest`) are *present* in the JavaScript global scope (`typeof` returns `"function"`), but all actual outbound network requests are blocked at the native WebView container level (`Failed to fetch`, `Handshake rejected / blocked`). |
| **JavaScript & CSP** | Modern ES6+, `Worker` (Blob Workers), `structuredClone` | Dynamic `eval()`, `new Function()`, `WebAssembly.instantiate()`, `crypto.subtle` | Content Security Policy enforces: `script-src 'unsafe-inline'`. String evaluation via `eval()` or `new Function()` throws CSP violations. `WebAssembly.instantiate()` is blocked. Blob Workers are operational. `crypto.subtle` is unavailable (non-secure context). |
| **Form Controls & Inputs** | `<input type="text">`, `<textarea>`, `<select>` (native Android dialog), `<input type="date">` (native calendar), `<input type="color">`, `<input type="range">` | `<input type="file">` (completely unhandled), `window.visualViewport` resize events | Soft keyboard pops up smoothly and pushes the card downward without obscuring it. Native selection dialogs work cleanly. Range slider gestures can collide with outer chat scrolling. |
| **Device & Haptics** | `navigator.vibrate([ms])`, `document.execCommand('copy')`, `navigator.geolocation`, `requestFullscreen`, `window.alert()` (native modal) | Clipboard API (`navigator.clipboard.writeText`), Screen Wake Lock, Device Orientation | `window.alert()` triggers a native WhatsApp popup modal. `navigator.vibrate([50])` triggers device haptics. `document.execCommand('copy')` is supported. |
| **Media & Audio** | Canvas 2D, WebGL 1/2, **Web Audio API `decodeAudioData` (ArrayBuffer)**, Web Audio Oscillators, FontFace API, HTML5 `<video>` (`canPlayType`) | HTML5 `<audio>` playback (`NotSupportedError`), Base64 `<audio src="...">`, WebGPU, Speech Synthesis | HTML5 `<audio>` tags are quarantined. However, **Web Audio API `decodeAudioData()` successfully decodes in-memory ArrayBuffers and plays audio via `AudioBufferSourceNode`!** |
| **System & Links** | `prefers-color-scheme`, `navigator.onLine` | Outbound links (`https://`, `whatsapp://`, `wa.me`, `tel:`, `mailto:`, `intent:`), Web Share API | **Total Interception**: Tapping links triggers CSS active animations, but the native Android WebView container suppresses all external navigation, deep links, dialers, and intent schemes. |

---

## PART III: STANZA SIZE BOUNDARIES & NETWORK ROUTING

Because the payload is embedded directly into the WhatsApp protocol stanza (rather than uploaded to WhatsApp media servers via CDN), the router enforces strict message size limits.

### 1. Stanza Ceiling Tiers (Audited Empirically on 2026-09-04)

Calibrated size probing with exact byte matching established the following delivery cutoffs:

| Tier | Payload Size | Delivery Status | Empirical Verification & Client Impact |
|:---|:---|:---:|:---|
| **Safe Zone** | `< 500 KB` | **100% Reliable** | Instant render. Zero mobile viewport stutter. Recommended for all menus and interactive cards. |
| **Moderate Zone** | `500 KB – 1000 KB` | **100% Reliable** | Reliable delivery. Brief mount pause on lower-end devices. Tested: `950KB`, `1000KB`, `1024KB` (1 MB) delivered cleanly. |
| **Maximum Ceiling** | `1000 KB – 1350 KB` | **Delivered** | Measurable mount latency spike. Max confirmed delivered: **1350 KB (~1.38 MB)**. |
| **Drop Zone (Silent Drop)** | `≥ 1400 KB` | **SILENT DROP** | **Message is acknowledged by transport socket, but dropped by the WhatsApp delivery router.** The recipient device never receives the stanza. Tested: **1400 KB silently dropped; 2000 KB silently dropped**. |

> [!IMPORTANT]
> **The Exact Drop Boundary**:
> The empirical ceiling is **1350 KB**. Stanzas of 1350 KB arrive on the recipient device, while stanzas of 1400 KB are silently discarded by WhatsApp server-side routers.

### 2. Asset Inlining Rules (Base64 vs Remote URLs)

- **Remote Media Strictly Blocked**: Whitelisting domains in `trusted_sources: [...]` does **not** bypass cross-origin network restrictions. Remote images (`<img src="https://...">`) will render broken.
- **Server-Side Inlining Required**: The bot must download remote thumbnails/posters on the server, convert them to Base64 Data URIs (`data:image/jpeg;base64,...`), and inline them into the HTML payload.
- **Payload Budgeting**: Keep images compressed (under 30–50 KB each) so the total stanza stays comfortably below the 700–1000 KB threshold.

---

## PART IV: CLIENT UX & INTERACTIVITY PATTERNS

Because the webview sandbox is **strictly one-way** (no WebSocket, HTTP `fetch`, or IPC back to the bot process), interactions must follow specific UX patterns:

### 1. In-Webview Client-Side SPA (Single Page Application)
Multi-screen navigation (e.g. searching, pagination, detail screens) must be pre-bundled and handled entirely inside the webview using JavaScript DOM manipulation:
```javascript
// Example client-side view switching inside <script>
function showScreen(screenId) {
    document.querySelectorAll('.ui-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}
```

### 2. Copy Chips
Render interactive commands as copyable monospace chips with `user-select: all` or utilize `document.execCommand('copy')` on tap:
```html
<div class="ui-chip" onclick="copyCommand('!cmd param')">!cmd param</div>
```

---

## PART V: PROJECT IMPLEMENTATION GUIDE (`lib/uiEngine.js`)

In this project, the webview subsystem is centralized in [`lib/uiEngine.js`](../lib/uiEngine.js).

### 1. Core API Functions

| Function | Purpose |
|:---|:---|
| `sendUI(sock, chatId, { title, html })` | Packages and relays the HTML payload. Returns `{ key: { remoteJid, fromMe: true, id }, messageId }`. |
| `renderPage({ title, body, badge, styles })` | Generates the HTML shell with the base design system, viewport tags, and optional custom CSS. |
| `renderCard({ icon, title, subtitle, rows, sections })` | Builds structured key-value cards with standard spacing and borders. |
| `renderList({ icon, title, subtitle, items })` | Builds interactive item lists with optional click handlers. |
| `esc(text)` | Escapes HTML entities to prevent XSS/rendering breakage. |

### 2. Base Design System (`BASE_CSS`)

The project follows a strict **flat, minimal, content-first** design philosophy:
- **Palette**: Dark mode neutral zinc/gray (`--bg-page: #0d0f13`, `--bg-card: #141619`, `--border: #1e2028`, `--text-primary: #e4e4e7`).
- **Typography**: System sans-serif stack (`'Segoe UI', system-ui, -apple-system, sans-serif`).
- **Forbidden**: Heavy gradients, glassmorphism, heavy drop-shadows, and bloated entrance animations.

### 3. Lifecycle & Memory Hygiene Rules

1. **Mandatory 120-Second Auto-Deletion**:
   Every time a webview message enters the mobile viewport, the WhatsApp client re-mounts the webview from scratch. Leaving dozens of webview payloads in chat history causes severe lag spikes.
   Commands delivering webviews **must** schedule deletion after 120 seconds:
   ```javascript
   const uiMsg = await sendUI(sock, message.chat, { title: "Title", html });
   setTimeout(() => {
       sock.sendMessage(message.chat, { delete: uiMsg.key }).catch(() => {});
   }, 120000);
   ```
2. **Viewport Scroll vs App Backgrounding Behavior**:
   - **Viewport Scrolling**: Scrolling away (~15–20 messages) completely destroys the webview instance. Scrolling back re-mounts the document from scratch, resetting all in-memory variables and state counters to 0.
   - **App Backgrounding**: Minimizing WhatsApp does **not** destroy the webview or pause JavaScript execution. Active `setInterval` timers continue ticking in the background.
3. **No Server Reply Handlers for Pure Webviews**:
   If a command's UI is navigated client-side via JavaScript, do not register a server `registerReplyHandler()`.
4. **Strict Text-Only for Link Auto-Detection**:
   Passive triggers in [`lib/autoDetect.js`](../lib/autoDetect.js) MUST NEVER send webviews. Only explicit user commands may send webviews.

