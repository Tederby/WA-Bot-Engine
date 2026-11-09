import { getGroupConfig, resolveUserId, isGroupBanned, isBanned, isUserGroupBanned, getActiveBotsInGroup } from "../database.js";
import { invalidateGroupMetadataCache } from "../contextBuilder.js";

/**
 * Handle group-participants.update events
 * Triggered when users join, leave, are promoted, or demoted.
 */
export async function handleGroupParticipantsUpdate(update, sock) {
  // Baileys may wrap events in an array
  if (Array.isArray(update)) update = update[0];
  if (!update) return;

  const { id, participants, action } = update;

  // Invalidate group metadata cache whenever group structure changes
  if (id) invalidateGroupMetadataCache(id);

  if ((action !== "add" && action !== "remove") || !Array.isArray(participants)) {
    return;
  }

  // Ignore events if group is globally banned
  if (isGroupBanned(id)) {
    return;
  }

  try {
    const config = getGroupConfig(id);
    const isWelcome = action === "add";
    const isEnabled = isWelcome ? config.welcome : config.goodbye;

    if (!isEnabled) {
      return;
    }

    // Text template with fallback defaults
    const defaultWelcome = "Welcome @user to *@group*!\n\n_Automated message from Bot_";
    const defaultGoodbye = "Goodbye @user!\n\n_Automated message from Bot_";
    const textTemplate = isWelcome ? (config.welcomeText || defaultWelcome) : (config.goodbyeText || defaultGoodbye);

    // Use timeout race to prevent socket hang on idle
    let groupMetadata = null;
    let groupName = "Group";
    try {
      groupMetadata = await Promise.race([
        sock.groupMetadata(id),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout metadata")), 3000))
      ]);
      if (groupMetadata?.subject) groupName = groupMetadata.subject;
    } catch {
      // Failed to fetch group metadata (timeout/error)
    }

    // Multi-Bot Coordination: Only the highest priority active bot sends greetings
    if (groupMetadata?.participants) {
      const participantJids = groupMetadata.participants.map(p => p.id);
      const activeBots = getActiveBotsInGroup(participantJids);
      const myJid = sock.user.id.includes(":") ? sock.user.id.split(":")[0] + "@s.whatsapp.net" : sock.user.id;
      const myIndex = activeBots.indexOf(myJid);
      if (myIndex > 0) return; // Skip if another active bot has higher priority
    }

    for (let participantObj of participants) {
      // Handle participant object formats and WhatsApp LID
      // Prioritize phoneNumber so @tags always show phone numbers instead of LID
      let actualJid;
      if (typeof participantObj === "object" && participantObj !== null) {
        actualJid = participantObj.phoneNumber || participantObj.id || participantObj.jid;
      } else {
        actualJid = participantObj;
      }

      if (typeof actualJid !== "string") continue;

      // If still LID, resolve to PN via identity_map
      if (actualJid.endsWith("@lid")) {
        const resolved = resolveUserId(actualJid);
        if (resolved !== actualJid) actualJid = resolved;
      }

      // Ignore if user is globally banned or group banned
      if (isBanned(actualJid) || isUserGroupBanned(id, actualJid)) {
        continue;
      }

      let text = textTemplate
        .replace(/@user/gi, `@${actualJid.split("@")[0]}`)
        .replace(/@group/gi, groupName);

      await sock.sendMessage(id, {
        text: text,
        mentions: [actualJid]
      });
    }
  } catch (err) {
    console.error("Error in group-participants.update:", err);
  }
}

