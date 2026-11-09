/**
 * Centralized POSIX-style CLI Flag Parser.
 *
 * Supports:
 * - Long flags: --keep, --ui, --text, --wait=5
 * - Single-letter flags: -k, -u, -x, -t
 * - Combined/clustered single-letter flags (Linux-style):
 *   -tu  → -t and -u (e.g. direct top + UI mode)
 *   -mfd → -m, -f, and -d (mobile + fullpage + dark)
 *   -lha → -l, -h, and -a
 * - Value flags: -w 5, -w=5, --wait 5, --wait=5
 * - Numeric aliases: -1 (mapped to top result if defined)
 * - Positional argument isolation: separates flags from clean query arguments.
 * - Freeform/multiline text flag extraction (for markdown/html commands).
 */

/**
 * @typedef {Object} FlagOption
 * @property {"boolean"|"string"|"number"} [type="boolean"] - Type of value
 * @property {string} [char] - Single-letter short flag (e.g. "k" for keep)
 * @property {string[]} [aliases] - Alternative names/aliases (e.g. ["top", "direct", "1"])
 * @property {*} [default] - Default value if flag is absent
 */

/**
 * @typedef {Object.<string, FlagOption>} FlagSchema
 */

/**
 * Parse an array of argument strings using an optional declarative schema.
 *
 * @param {string[]} args - Command arguments array
 * @param {FlagSchema} [schema] - Optional flag definitions
 * @returns {{
 *   flags: Object.<string, *>,
 *   cleanArgs: string[],
 *   rawQuery: string,
 *   has: (name: string) => boolean,
 *   get: (name: string, def?: *) => *
 * }}
 */
export function parseFlags(args = [], schema = {}) {
    // Build lookup maps for schema if provided
    const lookup = new Map();
    const defaults = {};

    if (schema && typeof schema === "object") {
        for (const [canonicalName, opt] of Object.entries(schema)) {
            const definition = {
                name: canonicalName,
                type: opt.type || "boolean",
                char: opt.char || null,
                aliases: opt.aliases || [],
                default: opt.default !== undefined ? opt.default : (opt.type === "boolean" ? false : null),
            };

            defaults[canonicalName] = definition.default;

            // Register canonical name (lowercase)
            lookup.set(canonicalName.toLowerCase(), definition);

            // Register single char alias
            if (definition.char) {
                lookup.set(definition.char.toLowerCase(), definition);
            }

            // Register other aliases
            for (const alias of definition.aliases) {
                lookup.set(alias.toLowerCase(), definition);
            }
        }
    }

    const flags = { ...defaults };
    const cleanArgs = [];
    let stopFlags = false;

    for (let i = 0; i < args.length; i++) {
        const token = args[i];

        // If "--" is encountered, all remaining tokens are positional (POSIX standard)
        if (token === "--") {
            stopFlags = true;
            continue;
        }

        if (stopFlags) {
            cleanArgs.push(token);
            continue;
        }

        // ── 1. Long flags (--flag or --flag=value) ───────────────────
        if (token.startsWith("--") && token.length > 2) {
            const raw = token.slice(2);
            let key = raw;
            let inlineVal = null;

            const eqIdx = raw.indexOf("=");
            if (eqIdx !== -1) {
                key = raw.slice(0, eqIdx);
                inlineVal = raw.slice(eqIdx + 1);
            }

            const def = lookup.get(key.toLowerCase());
            const canonicalName = def ? def.name : key;
            const flagType = def ? def.type : (inlineVal !== null ? "string" : "boolean");

            if (flagType === "boolean") {
                flags[canonicalName] = inlineVal !== null ? inlineVal.toLowerCase() !== "false" : true;
            } else if (flagType === "number") {
                if (inlineVal !== null) {
                    flags[canonicalName] = Number(inlineVal);
                } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                    flags[canonicalName] = Number(args[++i]);
                } else {
                    flags[canonicalName] = true;
                }
            } else {
                // string
                if (inlineVal !== null) {
                    flags[canonicalName] = inlineVal;
                } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                    flags[canonicalName] = args[++i];
                } else {
                    flags[canonicalName] = "";
                }
            }
            continue;
        }

        // ── 2. Short flags (-k, -mfd, -1, -w 5, -w=5) ────────────────
        if (token.startsWith("-") && token.length > 1 && !token.startsWith("--")) {
            const chars = token.slice(1);

            // Special case: check if the entire token after dash matches an alias directly (e.g. "-1" or "-del")
            const directMatch = lookup.get(chars.toLowerCase());
            if (directMatch) {
                const canonicalName = directMatch.name;
                if (directMatch.type === "boolean") {
                    flags[canonicalName] = true;
                } else if (directMatch.type === "number") {
                    if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                        flags[canonicalName] = Number(args[++i]);
                    } else {
                        flags[canonicalName] = true;
                    }
                } else {
                    if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                        flags[canonicalName] = args[++i];
                    } else {
                        flags[canonicalName] = "";
                    }
                }
                continue;
            }

            // Cluster decomposition (e.g. -mfd or -tu or -lha)
            let isCluster = true;

            for (let c = 0; c < chars.length; c++) {
                const char = chars[c];
                const def = lookup.get(char.toLowerCase());

                if (def && def.type !== "boolean") {
                    // Valued flag inside cluster (e.g. -w5 or -w 5)
                    const canonicalName = def.name;
                    const remainingInToken = chars.slice(c + 1);

                    if (remainingInToken.length > 0) {
                        const val = remainingInToken.startsWith("=") ? remainingInToken.slice(1) : remainingInToken;
                        flags[canonicalName] = def.type === "number" ? Number(val) : val;
                    } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                        const nextVal = args[++i];
                        flags[canonicalName] = def.type === "number" ? Number(nextVal) : nextVal;
                    } else {
                        flags[canonicalName] = def.type === "number" ? 0 : "";
                    }
                    break;
                } else {
                    const canonicalName = def ? def.name : char;
                    flags[canonicalName] = true;
                }
            }

            if (isCluster) {
                continue;
            }
        }

        // Positional argument
        cleanArgs.push(token);
    }

    return {
        flags,
        cleanArgs,
        rawQuery: cleanArgs.join(" "),
        has(name) {
            return Boolean(this.flags[name]);
        },
        get(name, def = undefined) {
            return this.flags[name] !== undefined ? this.flags[name] : def;
        },
    };
}

/**
 * Extract flags from a freeform text string (such as in markdown or html commands)
 * without corrupting multiline markdown bullets (- item) or separators (---).
 *
 * @param {string} text - Raw input text
 * @param {FlagSchema} schema - Flag schema to match
 * @returns {{ flags: Object.<string, *>, cleanText: string }}
 */
export function extractFlagsFromText(text = "", schema = {}) {
    if (!text || typeof text !== "string") {
        return { flags: {}, cleanText: "" };
    }

    const lines = text.split("\n");
    const firstLine = lines[0] || "";

    // Parse flags primarily from the first line or trailing end of input
    const tokens = firstLine.trim().split(/\s+/);
    const parsed = parseFlags(tokens, schema);

    // If flags were detected in the first line, rebuild the first line without those flag tokens
    if (tokens.length !== parsed.cleanArgs.length) {
        lines[0] = parsed.cleanArgs.join(" ");
        const cleanText = lines.join("\n").trim();
        return { flags: parsed.flags, cleanText };
    }

    // Check last line if no flags were found on the first line (e.g. `text content -k`)
    if (lines.length > 1) {
        const lastLine = lines[lines.length - 1] || "";
        const lastTokens = lastLine.trim().split(/\s+/);
        const lastParsed = parseFlags(lastTokens, schema);
        if (lastTokens.length !== lastParsed.cleanArgs.length) {
            lines[lines.length - 1] = lastParsed.cleanArgs.join(" ");
            const cleanText = lines.join("\n").trim();
            return { flags: lastParsed.flags, cleanText };
        }
    }

    return { flags: parsed.flags, cleanText: text.trim() };
}

export default { parseFlags, extractFlagsFromText };

