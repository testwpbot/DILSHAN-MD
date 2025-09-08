const { cmd, commands } = require("../command");
const fs = require("fs");
const path = require("path");

const pendingMenu = {};
const numberEmojis = ["0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];

const channelJid = "120363418166326365@newsletter"; // newsletter channel
const channelName = "🍁 ＤＡＮＵＷＡ－ 〽️Ｄ 🍁";
const videoPath = path.join(__dirname, "../media/0908.mp4"); // anime video note
const headerImage = "https://github.com/dilshan62/DILSHAN-MD/blob/main/images/DILSHAN-MD-ALIVE.png?raw=true";

cmd({
  pattern: "menu",
  react: "📋",
  desc: "Show command categories",
  category: "main",
  filename: __filename
}, async (dilshan, m, msg, { from, sender, reply }) => {
  await dilshan.sendMessage(from, { react: { text: "📋", key: m.key } });

  const commandMap = {};

  for (const command of commands) {
    if (command.dontAddCommandList) continue;
    const category = (command.category || "MISC").toUpperCase();
    if (!commandMap[category]) commandMap[category] = [];
    commandMap[category].push(command);
  }

  const categories = Object.keys(commandMap);

  let menuText = `╭━━━❰ 📲 *MAIN MENU* ❱━━━╮\n`;
  menuText += `┃🔰 *WELCOME TO DILSHAN-MD* 🔰\n`;
  menuText += `┃───────────────────────\n`;

  categories.forEach((cat, i) => {
    const emojiIndex = (i + 1).toString().split("").map(n => numberEmojis[n]).join("");
    menuText += `┃ ${emojiIndex} *${cat}* (${commandMap[cat].length})\n`;
  });

  menuText += `┃───────────────────────\n`;
  menuText += `┃ ❤️ *CHOOSE MENU CATEGORY...!*\n`;
  menuText += `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n`;
  menuText += `⚡ Powered by: *Dilshan Chanushka*`;

  const videoBuffer = fs.readFileSync(videoPath);
  await dilshan.sendMessage(from, {
    video: videoBuffer,
    mimetype: "video/mp4",
    ptv: true
  });

  await dilshan.sendMessage(from, {
    image: { url: headerImage },
    caption: menuText,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: channelJid,
        newsletterName: channelName,
        serverMessageId: -1
      }
    }
  }, { quoted: m });

  pendingMenu[sender] = { step: "category", commandMap, categories };
});

cmd({
  filter: (text, { sender }) => pendingMenu[sender] && pendingMenu[sender].step === "category" && /^[1-9][0-9]*$/.test(text.trim())
}, async (dilshan, m, msg, { from, body, sender, reply }) => {
  await dilshan.sendMessage(from, { react: { text: "✅", key: m.key } });

  const { commandMap, categories } = pendingMenu[sender];
  const index = parseInt(body.trim()) - 1;
  if (index < 0 || index >= categories.length) return reply("❌ Invalid selection.");

  const selectedCategory = categories[index];
  const cmdsInCategory = commandMap[selectedCategory];

  let cmdText = `╭━━━❰ 📍 *${selectedCategory} COMMANDS*\n`;
  cmdsInCategory.forEach(c => {
    const patterns = [c.pattern, ...(c.alias || [])].filter(Boolean).map(p => `.${p}`);
    cmdText += `┃🔸 ${patterns.join(", ")} - ${c.desc || "No description"}\n`;
  });
  cmdText += `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n`;
  cmdText += `Total Commands: ${cmdsInCategory.length}\n`;
  cmdText += `⚡ Powered by: *Dilshan Chanushka*`;

  await dilshan.sendMessage(from, {
    image: { url: headerImage },
    caption: cmdText,
    contextInfo: {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: channelJid,
        newsletterName: channelName,
        serverMessageId: -1
      }
    }
  }, { quoted: m });

  delete pendingMenu[sender];
});
