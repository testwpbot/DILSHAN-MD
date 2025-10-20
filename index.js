// index.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  proto,
  generateWAMessageContent,
  generateWAMessage,
  AnyMessageContent,
  prepareWAMessageMedia,
  areJidsSameUser,
  downloadContentFromMessage,
  MessageRetryMap,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  makeInMemoryStore,
  jidDecode,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const path = require('path');
const config = require('./config');
const { ownerNumber } = require('./config');
const { BOT_OWNER } = require('./config');
const util = require('util');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { sms } = require('./lib/msg');
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions');
const { File } = require('megajs');
const express = require("express");

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';

// Ensure auth_info_baileys directory exists
const authDir = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

// If creds.json missing, try to fetch session file from mega using config.SESSION_ID
const sessdata = config.SESSION_ID || null;
if (!fs.existsSync(path.join(authDir, 'creds.json'))) {
  if (!sessdata) {
    console.log('❗ [DILSHAN-MD] SESSION_ID not found in env or config. Please configure it.');
  } else {
    // extract real file id if custom format provided
    let realFileId = sessdata;
    if (sessdata.includes('|')) {
      realFileId = sessdata.split('|')[1];
    } else {
      console.log(`🔧 Using file ID directly: ${realFileId}`);
    }

    try {
      const filer = File.fromURL(`https://mega.nz/file/${realFileId}`);
      filer.download((err, data) => {
        if (err) {
          console.error("❌ Failed to download session from MEGA:", err);
          return;
        }
        fs.writeFile(path.join(authDir, 'creds.json'), data, (writeErr) => {
          if (writeErr) {
            console.error("❌ Failed to save creds.json:", writeErr);
            return;
          }
          console.log("📥 [DILSHAN-MD] Session file downloaded and saved.");
        });
      });
    } catch (e) {
      console.error("❌ Error while trying to download session file:", e.message || e);
    }
  }
}

const { replyHandlers = [], commands = [] } = require('./command') || {};
const antiDeletePlugin = require('./plugins/antidelete.js');
global.pluginHooks = global.pluginHooks || [];
global.pluginHooks.push(antiDeletePlugin);

async function connectToWA() {
  console.log("🛰️ [DILSHAN-MD] Initializing WhatsApp connection...");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const conn = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS("Firefox"),
    syncFullHistory: true,
    auth: state,
    version
  });

  // Basic buttons handler (keeps small and separate)
  conn.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m || !m.message) return;
    const buttonResponse = m.message.buttonsResponseMessage;
    if (buttonResponse) {
      const selectedId = buttonResponse.selectedButtonId;
      if (selectedId === 'btn_1') {
        await conn.sendMessage(m.key.remoteJid, { text: 'You pressed Button 1!' }, { quoted: m });
      } else if (selectedId === 'btn_2') {
        await conn.sendMessage(m.key.remoteJid, { text: 'You pressed Button 2!' }, { quoted: m });
      }
    }
  });

  // Group participants update (single combined handler)
conn.ev.on('group-participants.update', async (update) => {
  try {
    // Normalize group ID safely
    const groupId = typeof update.id === 'string' ? update.id : update.id?.id || '';
    if (!groupId) return;

    console.log("📥 New Group Update:", groupId, update.action);

    const { participants = [], action } = update;
    if (!Array.isArray(participants) || !action) return;

    // Fetch group metadata safely
    const metadata = await conn.groupMetadata(groupId).catch(() => ({}));
    const groupName = metadata?.subject || 'this group';

    // Loop through participants
    for (const p of participants) {
      // Normalize participant JID
      const jid = typeof p === 'string' ? p : p?.id || '';
      if (!jid || typeof jid !== 'string') continue;
      const number = jid.split('@')[0];

      // 🛡️ Anti-fake enforcement
      if (action === 'add' && global.antiFakeGroups?.[groupId]) {
        if (!number.startsWith("94")) {
          try {
            await conn.sendMessage(groupId, {
              text: `📵 @${number} removed — only Sri Lankan numbers allowed.`,
              mentions: [jid]
            });
            await conn.groupParticipantsUpdate(groupId, [jid], "remove");
          } catch (err) {
            console.error("Anti-fake removal error:", err);
          }
          continue; // Skip welcome for non-SL number
        }
      }

      // 🌟 Welcome message
      if (action === 'add') {
        const message = `
🌟 Hey @${number}, welcome to *${groupName}*! 🥳

We’re super happy to have you join us.  

📌 Take a moment to check out the group rules so everyone has a great experience.  
💬 Feel free to introduce yourself and say hi to everyone!  

✨ Together, let’s create a fun, supportive, and respectful community. 💖
`;
        await conn.sendMessage(groupId, {
          image: { url: 'https://github.com/dilshan62/DILSHAN-MD/blob/main/images/WELCOME_DILSHAN_MD.jpg?raw=true' },
          caption: message,
          mentions: [jid]
        });
      }

      // 👋 Goodbye message
      if (action === 'remove') {
        const message = `
👋 Hey @${number}, we’ll miss you! 💔

Thank you for being part of *${groupName}*.  
✨ Wishing you happiness and all the best in everything you do! 💖
`;
        await conn.sendMessage(groupId, {
          image: { url: 'https://github.com/dilshan62/DILSHAN-MD/blob/main/images/GOOD_BYE_DILSHAN_MD.jpg?raw=true' },
          caption: message,
          mentions: [jid]
        });
      }
    }
  } catch (e) {
    console.error('Group participants update error:', e);
  }
});


  // connection.update handler
  conn.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      console.log('🔁 Connection closed unexpectedly, reconnecting...');
      connectToWA().catch(e => console.error("Reconnect error:", e));
    } else if (connection === 'open') {
      (async () => {
        try {
          //console.log("🔧 [DILSHAN-MD] Installing plugins...");
          // Load local plugins
          const pluginsDir = path.join(__dirname, 'plugins');
          if (fs.existsSync(pluginsDir)) {
            fs.readdirSync(pluginsDir).forEach((plugin) => {
              if (path.extname(plugin).toLowerCase() === ".js") {
                try {
                  require(path.join(pluginsDir, plugin));
                } catch (e) {
                  console.error(`Failed to load local plugin ${plugin}:`, e.message || e);
                }
              }
            });
          }

          console.log("🔧 [DILSHAN-MD] installing plugins...");
          // Fetch remote plugin list and download
          const { data: pluginList } = await axios.get("https://dilshan-md-plugins.pages.dev/plugins.json", { timeout: 10000 }).catch(() => ({ data: [] }));
          if (!Array.isArray(pluginList)) {
            //console.warn("Remote plugins.json not an array, skipping remote plugin installation.");
          } else {
            for (const pluginName of pluginList) {
              const url = `https://dilshan-md-plugins.pages.dev/plugins/${pluginName}`;
              try {
                const { data } = await axios.get(url, { responseType: "text", timeout: 10000 });
                const filename = path.join(pluginsDir, pluginName);
                fs.writeFileSync(filename, data, "utf-8");
                delete require.cache[require.resolve(filename)];
                require(filename);
                // console.log(`✅ Remote plugin loaded: ${pluginName}`);
              } catch (e) {
               // console.error(`❌ Failed to load remote plugin ${pluginName}:`, e.message || e);
              }
            }
          }

          console.log("✅ [DILSHAN-MD] All plugins installed successfully.");
          console.log("📶 [DILSHAN-MD] Successfully connected to WhatsApp!");

          // Notify owner that bot is online
          const up = `
╭━━━〔 🔔 *BOT CONNECTED* 🔔〕
┃ ✅ *Connection Status* : ONLINE
┃ 👑 *Owner* : DILSHAN CHANUSHKA
┃ 📡 *Bot Name* : DILSHAN-MD
┃ 💠 *Powered By* : WhatsApp
╰━━━━━━━━━━━━━━━━━━━━━━━╯

🎉 *Welcome back, Master!*  
🔹 Your bot is now *ready to rock* 🚀  
🔹 Use *.menu* or *.help* to explore commands.  
`;
          try {
            await conn.sendMessage((ownerNumber && ownerNumber[0] ? ownerNumber[0] + "@s.whatsapp.net" : null), {
              image: { url: config.ALIVE_IMG },
              caption: up
            }).catch(() => null);
          } catch (e) {
            // ignore notify errors
          }
        } catch (e) {
          console.error("❌ Error during post-connection setup:", e.message || e);
        }
      })();
    }
  });

  conn.ev.on('creds.update', saveCreds);

  // Main message handler
  conn.ev.on('messages.upsert', async (mekWrap) => {
    try {
      const mekObj = Array.isArray(mekWrap?.messages) ? mekWrap.messages[0] : (mekWrap?.messages?.[0] || mekWrap);
      const mek = mekObj || mekWrap;
      if (!mek || !mek.message) return;

      // VIEW ONCE V2 recovery
      if (mek.message?.viewOnceMessageV2) {
        try {
          const msg = mek.message.viewOnceMessageV2.message;
          const msgType = Object.keys(msg)[0]; // imageMessage / videoMessage
          const mediaMsg = msg[msgType];

          const stream = await downloadContentFromMessage(
            mediaMsg,
            msgType === "imageMessage" ? "image" : "video"
          );

          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }

          await conn.sendMessage(mek.key.remoteJid, {
            [msgType === "imageMessage" ? "image" : "video"]: buffer,
            caption: "📤 *Here’s the recovered ViewOnce media!*"
          }, { quoted: mek });
        } catch (err) {
          console.error("❌ Error recovering viewOnce:", err);
        }
      }

      // Pre-download other media
      const contentType = getContentType(mek.message);
      const content = mek.message[contentType];
      if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(contentType)) {
        try {
          const stream = await downloadContentFromMessage(content, contentType.replace('Message', ''));
          const bufferChunks = [];
          for await (const chunk of stream) bufferChunks.push(chunk);
          mek._mediaBuffer = Buffer.concat(bufferChunks);
          mek._mediaType = contentType;
        } catch (err) {
          console.log('❌ Failed to pre-download media:', err?.message || err);
        }
      }

      // Run plugin onMessage hooks
      if (global.pluginHooks) {
        for (const plugin of global.pluginHooks) {
          if (plugin.onMessage) {
            try {
              await plugin.onMessage(conn, mek);
            } catch (e) {
              console.log("onMessage error:", e);
            }
          }
        }
      }

      // Expand ephemeral
      mek.message = (getContentType(mek.message) === 'ephemeralMessage')
        ? mek.message.ephemeralMessage.message
        : mek.message;

      if (config.READ_MESSAGE === 'true') {
        try {
          await conn.readMessages([mek.key]);
          console.log(`Marked message from ${mek.key.remoteJid} as read.`);
        } catch (e) {
          // ignore
        }
      }

      // Status broadcasts (status@broadcast) handling
      if (mek.key?.remoteJid === 'status@broadcast') {
        const senderJid = mek.key.participant || mek.key.remoteJid || "unknown@s.whatsapp.net";
        const mentionJid = senderJid.includes("@s.whatsapp.net") ? senderJid : senderJid + "@s.whatsapp.net";

        if (config.AUTO_STATUS_SEEN === "true") {
          try {
            await conn.readMessages([mek.key]);
            console.log(`[✓] Status seen: ${mek.key.id}`);
          } catch (e) {
            console.error("❌ Failed to mark status as seen:", e);
          }
        }

        if (config.AUTO_STATUS_REACT === "true" && mek.key.participant) {
          try {
            const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '💜', '💙', '🌝', '🖤', '💚'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            await conn.sendMessage(mek.key.participant, {
              react: { text: randomEmoji, key: mek.key }
            });
            console.log(`[✓] Reacted to status of ${mek.key.participant} with ${randomEmoji}`);
          } catch (e) {
            console.error("❌ Failed to react to status:", e);
          }
        }

        if (mek.message?.extendedTextMessage && !mek.message.imageMessage && !mek.message.videoMessage) {
          const text = mek.message.extendedTextMessage.text || "";
          if (text.trim().length > 0) {
            try {
              await conn.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                text: `📝 *Text Status*\n👤 From: @${mentionJid.split("@")[0]}\n\n${text}`,
                mentions: [mentionJid]
              });
              console.log(`✅ Text-only status from ${mentionJid} forwarded.`);
            } catch (e) {
              console.error("❌ Failed to forward text status:", e);
            }
          }
        }

        if (mek.message?.imageMessage || mek.message?.videoMessage) {
          try {
            const msgType = mek.message.imageMessage ? "imageMessage" : "videoMessage";
            const mediaMsg = mek.message[msgType];
            const stream = await downloadContentFromMessage(
              mediaMsg,
              msgType === "imageMessage" ? "image" : "video"
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const mimetype = mediaMsg.mimetype || (msgType === "imageMessage" ? "image/jpeg" : "video/mp4");
            const captionText = mediaMsg.caption || "";

            await conn.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
              [msgType === "imageMessage" ? "image" : "video"]: buffer,
              mimetype,
              caption: `📥 *Forwarded Status*\n👤 From: @${mentionJid.split("@")[0]}\n\n${captionText}`,
              mentions: [mentionJid]
            });

            console.log(`✅ Media status from ${mentionJid} forwarded.`);
          } catch (err) {
            console.error("❌ Failed to download or forward media status:", err);
          }
        }
      }

      // Set up command parsing and environment
      const m = sms(conn, mek);
      const type = getContentType(mek.message);
      const from = mek.key.remoteJid;
      const body = type === 'conversation'
        ? mek.message.conversation
        : mek.message[type]?.text || mek.message[type]?.caption || '';

      const isCmd = typeof body === 'string' && body.startsWith(prefix);
      const commandName = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : '';
      const args = (typeof body === 'string' ? body.trim().split(/ +/).slice(1) : []);
      const q = args.join(' ');

      const sender = mek.key.fromMe
        ? (conn.user?.id?.split(':')[0] + '@s.whatsapp.net' || conn.user?.id)
        : (mek.key.participant || mek.key.remoteJid);

      const senderNumber = (sender || '').split('@')[0];
      const isGroup = (from || '').endsWith('@g.us');

      const botNumber = conn.user?.id?.split(':')[0] || '';
      const pushname = mek.pushName || 'Sin Nombre';
      const isMe = botNumber.includes(senderNumber);
      const isOwner = Array.isArray(ownerNumber) ? ownerNumber.includes(senderNumber) || isMe : (ownerNumber === senderNumber) || isMe;

      const botNumber2 = await jidNormalizedUser(conn.user.id);

      const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(() => ({})) : {};
      const groupName = groupMetadata?.subject || 'No Group Name';
      const participants = groupMetadata.participants || [];

      const groupAdminsRaw = isGroup ? getGroupAdmins(participants) : [];
      const groupAdmins = groupAdminsRaw.map(jidNormalizedUser);

      const senderId = jidNormalizedUser(sender);
      const botId = jidNormalizedUser(conn.user.id);

      const isAdmins = groupAdmins.includes(senderId);
      const isBotAdmins = groupAdmins.includes(botId);

      // Anti-link
      if (isGroup && global.antiLinkGroups?.[from] && !isAdmins && /(https?:\/\/[^\s]+)/i.test(body)) {
        await conn.sendMessage(from, {
          text: `🚫 Link detected!\n@${senderNumber} has been removed from *${groupName}*!`,
          mentions: [sender]
        });
        await conn.groupParticipantsUpdate(from, [sender], "remove");
      }

      // Anti-badword
      const badwords = ["fuck", "shit", "idiot", "bitch", "puka", "උඹ", "කැරියා", "හුත්තා", "පකයා", "හුකන්නා", "පොන්නයා"];
      if (isGroup && global.antiBadwordGroups?.[from] && !isAdmins) {
        if (badwords.some(word => (body || '').toLowerCase().includes(word))) {
          await conn.sendMessage(from, {
            text: `🧼 Bad word detected!\n@${senderNumber} has been removed from *${groupName}*!`,
            mentions: [sender]
          });
          await conn.groupParticipantsUpdate(from, [sender], "remove");
        }
      }

      const reply = (text, options = {}) => conn.sendMessage(from, { text, ...options }, { quoted: mek });

      conn.decodeJid = jid => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
          let decode = jidDecode(jid) || {};
          return (
            (decode.user && decode.server && decode.user + '@' + decode.server) || jid
          );
        } else return jid;
      };

      // Command handling
      if (isCmd) {
        const cmd = commands.find((c) => c.pattern === commandName || (c.alias && c.alias.includes(commandName)));
        if (cmd) {
          switch ((config.MODE || 'public').toLowerCase()) {
            case 'private':
              if (!isOwner) return;
              break;
            case 'public':
            default:
              break;
          }

          if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });

          try {
            await cmd.function(conn, mek, m, {
              from, quoted: mek, body, isCmd, command: commandName, args, q,
              isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
              isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
              isBotAdmins, isAdmins, reply,
            });
          } catch (e) {
            console.error("[PLUGIN ERROR] " + (e.stack || e));
          }
        }
      }

      // Reply handlers
      const replyText = body;
      for (const handler of replyHandlers) {
        if (handler.filter(replyText, { sender, message: mek })) {
          try {
            await handler.function(conn, mek, m, {
              from, quoted: mek, body: replyText, sender, reply,
            });
            break;
          } catch (e) {
            console.log("Reply handler error:", e);
          }
        }
      }
    } catch (err) {
      console.error("Main messages.upsert handler error:", err);
    }
  });

  // messages.update -> allow plugins to handle deletes etc.
  conn.ev.on('messages.update', async (updates) => {
    if (global.pluginHooks) {
      for (const plugin of global.pluginHooks) {
        if (plugin.onDelete) {
          try {
            await plugin.onDelete(conn, updates);
          } catch (e) {
            console.log("onDelete error:", e);
          }
        }
      }
    }
  });
}

// Simple webserver for uptime
app.get("/", (req, res) => {
  res.send("Hey, DILSHAN-MD started✅");
});

app.listen(port, () => console.log(`🌐 [DILSHAN-MD] Web server running → http://localhost:${port}`));

setTimeout(() => {
  connectToWA().catch(e => console.error("connectToWA error:", e));
}, 4000);
