const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ==============================
// CONFIG
// ==============================
const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || "1561499976872370339";
const GUILD_ID = process.env.GUILD_ID || "1552438137299664977";
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "1552637829815865414";

const PORT = process.env.PORT || 10000;
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || null;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATABASE_PATH = path.join(DATA_DIR, "database.json");

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN or TOKEN in environment variables.");
  process.exit(1);
}

// ==============================
// KEEP-ALIVE WEB SERVER
// ==============================
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.status(200).send("💗 Jayce bot is online!");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "online",
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// optional endpoints to expose tos/rules
app.get("/tos", (_req, res) => {
  res.status(200).json({ tos: database?.tos?.text || null });
});

app.get("/rules", (_req, res) => {
  res.status(200).json({ rules: database?.rules?.text || null });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`💗 Keep-alive server running on port ${PORT}`);
});

if (KEEP_ALIVE_URL) {
  function pingKeepAlive() {
    try {
      const urlObj = new URL(KEEP_ALIVE_URL);
      const lib = urlObj.protocol === "http:" ? http : https;
      const req = lib.get(KEEP_ALIVE_URL, (res) => {
        // noop, just trigger
        res.on("data", () => {});
        res.on("end", () => {});
      });
      req.on("error", (err) => console.error("[KEEPALIVE] ping error:", err.message));
      req.setTimeout(10_000, () => req.abort());
    } catch (err) {
      console.error("[KEEPALIVE] Invalid KEEP_ALIVE_URL:", err.message);
    }
  }

  setInterval(pingKeepAlive, 4 * 60 * 1000);
  setTimeout(pingKeepAlive, 5_000);
  console.log(`[KEEPALIVE] enabled for ${KEEP_ALIVE_URL}`);
}

// ==============================
// DATABASE (atomic write)
// ==============================
fs.mkdirSync(DATA_DIR, { recursive: true });

let database = {
  products: [],
  tos: { text: null },
  rules: { text: null },
  logs: [],
  accounts: {}, // username -> { password, ownerId, key, hwid, mobileMain }
};

function saveDatabase() {
  try {
    const tmp = `${DATABASE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(database, null, 2), "utf8");
    fs.renameSync(tmp, DATABASE_PATH);
  } catch (err) {
    console.error("[DATABASE] save error:", err);
  }
}

function loadDatabase() {
  try {
    if (fs.existsSync(DATABASE_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATABASE_PATH, "utf8"));
      database = Object.assign(database, data);
    }
    // ensure file exists
    saveDatabase();
  } catch (err) {
    console.error("[DATABASE] load error:", err);
  }
}

loadDatabase();

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] saving database...");
  saveDatabase();
  process.exit(0);
});

// ==============================
// HELPERS
// ==============================
function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xff9ed2)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "jayce ♡ soft & secure" })
    .setTimestamp();
}

function appendLog(action, meta = {}) {
  try {
    database.logs.push({ timestamp: new Date().toISOString(), action, ...meta });
    if (database.logs.length > 5000) database.logs = database.logs.slice(-5000);
    saveDatabase();
  } catch (err) {
    console.error("[LOG] could not append:", err);
  }
}

const RATE_MAP = new Map();
function isRateLimited(key, windowMs = 30_000, max = 6) {
  const now = Date.now();
  const arr = RATE_MAP.get(key) || [];
  const recent = arr.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    RATE_MAP.set(key, recent);
    return true;
  }
  recent.push(now);
  RATE_MAP.set(key, recent);
  return false;
}

function makeCode(length = 24) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function findProduct(name) {
  return database.products.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

async function requireStaff(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "❌ This command can only be used in the server.", ephemeral: true });
    return false;
  }

  const member = interaction.member;
  // interaction.member.roles can be an array of IDs or RoleManager
  if (Array.isArray(member?.roles)) {
    if (member.roles.includes(STAFF_ROLE_ID)) return true;
  } else if (member?.roles?.cache) {
    if (member.roles.cache.has(STAFF_ROLE_ID)) return true;
  }

  await interaction.reply({ content: "❌ You need the Jayce staff role to use this command.", ephemeral: true });
  return false;
}

// ==============================
// DISCORD CLIENT & COMMANDS
// ==============================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName("tos").setDescription("View the Jayce Terms of Service"),
  new SlashCommandBuilder().setName("rules").setDescription("View the server rules"),
  new SlashCommandBuilder().setName("shop").setDescription("View available Jayce products"),

  new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("View a product's details and purchase instructions")
    .addStringOption((opt) => opt.setName("product").setDescription("Choose a product").setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder().setName("support").setDescription("Get help with a purchase or product"),

  new SlashCommandBuilder()
    .setName("addproduct")
    .setDescription("Add a product to the shop")
    .addStringOption((o) => o.setName("name").setDescription("Product name").setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName("price").setDescription("Price, for example $5").setRequired(true).setMaxLength(50))
    .addStringOption((o) => o.setName("description").setDescription("Product description").setRequired(true).setMaxLength(1000))
    .addStringOption((o) => o.setName("instructions").setDescription("How customers should purchase it").setRequired(false).setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName("removeproduct")
    .setDescription("Remove a product from the shop")
    .addStringOption((o) => o.setName("name").setDescription("Exact product name").setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement")
    .addStringOption((o) => o.setName("message").setDescription("Announcement text").setRequired(true).setMaxLength(2000))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to post in; defaults to this channel").setRequired(false)),

  new SlashCommandBuilder().setName("posttos").setDescription("Post the Terms of Service in a channel").addChannelOption((o) => o.setName("channel").setDescription("Channel to post in; defaults to this channel").setRequired(false)),
  new SlashCommandBuilder().setName("postrules").setDescription("Post the server rules in a channel").addChannelOption((o) => o.setName("channel").setDescription("Channel to post in; defaults to this channel").setRequired(false)),
  new SlashCommandBuilder().setName("staffhelp").setDescription("View staff command help"),

  // new admin commands for TOS/rules storage & logs
  new SlashCommandBuilder().setName("show-tos").setDescription("Show the saved Terms of Service"),
  new SlashCommandBuilder().setName("edit-tos").setDescription("Edit the Terms of Service (staff only)").addStringOption((o) => o.setName("text").setDescription("New TOS text").setRequired(true).setMaxLength(4000)),
  new SlashCommandBuilder().setName("show-rules").setDescription("Show the saved server rules"),
  new SlashCommandBuilder().setName("edit-rules").setDescription("Edit the server rules (staff only)").addStringOption((o) => o.setName("text").setDescription("New rules text").setRequired(true).setMaxLength(4000)),
  new SlashCommandBuilder().setName("export-logs").setDescription("Export recent logs (staff only)"),

  // account commands requested: register, getkey, resethwid, mobilemain
  new SlashCommandBuilder().setName("register").setDescription("Register an account")
    .addStringOption((o) => o.setName("username").setDescription("Account username").setRequired(true))
    .addStringOption((o) => o.setName("password").setDescription("Account password").setRequired(true)),

  new SlashCommandBuilder().setName("getkey").setDescription("Generate and receive a key for your account")
    .addStringOption((o) => o.setName("username").setDescription("Account username").setRequired(true))
    .addStringOption((o) => o.setName("password").setDescription("Account password").setRequired(true)),

  new SlashCommandBuilder().setName("resethwid").setDescription("Reset the account HWID")
    .addStringOption((o) => o.setName("username").setDescription("Account username").setRequired(true))
    .addStringOption((o) => o.setName("password").setDescription("Account password").setRequired(true)),

  new SlashCommandBuilder().setName("mobilemain").setDescription("Enable mobile main (requires key)")
    .addStringOption((o) => o.setName("username").setDescription("Account username").setRequired(true))
    .addStringOption((o) => o.setName("password").setDescription("Account password").setRequired(true))
    .addStringOption((o) => o.setName("key").setDescription("Key provided by /getkey").setRequired(true)),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("💗 Jayce slash commands registered.");
  } catch (error) {
    console.error("Could not register slash commands:", error);
  }
}

// ==============================
// AUTOCOMPLETE
// ==============================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAutocomplete()) return;
  try {
    const focused = interaction.options.getFocused().toLowerCase();
    if (interaction.commandName === "purchase" || interaction.commandName === "removeproduct") {
      const choices = database.products
        .filter((product) => product.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((product) => ({ name: product.name.slice(0, 100), value: product.name.slice(0, 100) }));
      await interaction.respond(choices);
    }
  } catch (err) {
    console.error("Autocomplete error:", err);
    if (!interaction.responded) {
      try { await interaction.respond([]); } catch {}
    }
  }
});

// ==============================
// COMMAND HANDLERS
// ==============================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    // public commands
    if (commandName === "tos") {
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce — Terms of Service", database.tos.text || "No TOS set.")] });
      return;
    }

    if (commandName === "rules") {
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce Server Rules", database.rules.text || "No rules set.")] });
      return;
    }

    if (commandName === "shop") {
      if (database.products.length === 0) {
        await interaction.reply({ embeds: [makeEmbed("💗 Jayce Shop", "The shop is currently empty. Check back later!")] });
        return;
      }
      const description = database.products.map((product, index) => `**${index + 1}. ${product.name}** — ${product.price}\n${product.description}`).join("\n\n");
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce Shop", description.slice(0, 4000))] });
      return;
    }

    if (commandName === "purchase") {
      const name = interaction.options.getString("product", true);
      const product = findProduct(name);
      if (!product) {
        await interaction.reply({ content: "❌ That product was not found. Use `/shop` to see products.", ephemeral: true });
        return;
      }
      const embed = makeEmbed(`💗 ${product.name}", ` +
        [`**Price:** ${product.price}`, `**Description:** ${product.description}`, `**Purchase instructions:** ${product.instructions || "Contact staff for purchase instructions."}`, "", "Please review `/tos` before purchasing."].join("\n"));
      // above line had a quote mismatch fix: we'll instead build properly
    }

    // note: the purchase embed above was restructured; we'll just handle purchase properly below
  } catch (err) {
    console.error(`Error in /${commandName}:`, err);
    const reply = { content: "❌ Something went wrong. Please try again later.", ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    } catch (replyErr) { console.error("Could not send error reply:", replyErr); }
  }
});

// The above early handler had to be replaced to handle many commands — register a second listener that handles everything to keep code clearer.
client.removeAllListeners("interactionCreate");
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    // QUICK RATE-LIMIT
    if (isRateLimited(`u:${interaction.user.id}:${commandName}`, 20_000, 8)) {
      await interaction.reply({ content: "⏳ You're doing that too often. Please wait a moment.", ephemeral: true });
      return;
    }

    // PUBLIC: TOS / RULES / SHOP / PURCHASE / SUPPORT
    if (commandName === "tos" || commandName === "show-tos") {
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce — Terms of Service", database.tos.text || "No TOS set.")], ephemeral: commandName === "show-tos" });
      return;
    }

    if (commandName === "rules" || commandName === "show-rules") {
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce Server Rules", database.rules.text || "No rules set.")], ephemeral: commandName === "show-rules" });
      return;
    }

    if (commandName === "shop") {
      if (database.products.length === 0) {
        await interaction.reply({ embeds: [makeEmbed("💗 Jayce Shop", "The shop is currently empty. Check back later!")] });
        return;
      }
      const description = database.products.map((product, index) => `**${index + 1}. ${product.name}** — ${product.price}\n${product.description}`).join("\n\n");
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce Shop", description.slice(0, 4000))] });
      return;
    }

    if (commandName === "purchase") {
      const name = interaction.options.getString("product", true);
      const product = findProduct(name);
      if (!product) {
        await interaction.reply({ content: "❌ That product was not found. Use `/shop` to see products.", ephemeral: true });
        return;
      }
      const embed = makeEmbed(`💗 ${product.name}`, [`**Price:** ${product.price}`, `**Description:** ${product.description}`, `**Purchase instructions:** ${product.instructions || "Contact staff for purchase instructions."}`, "", "Please review `/tos` before purchasing."].join("\n"));
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "support") {
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce Support", "Need help with a purchase or product?\n\n1. Explain your issue clearly.\n2. Include your order receipt or proof of purchase if relevant.\n3. Do not share passwords, bot tokens, or other sensitive information.")], ephemeral: true });
      return;
    }

    // STAFF-only commands list
    const staffCommands = ["addproduct", "removeproduct", "announce", "posttos", "postrules", "staffhelp", "edit-tos", "edit-rules", "export-logs"];
    if (staffCommands.includes(commandName)) {
      if (!(await requireStaff(interaction))) return;
    }

    // STAFF: addproduct
    if (commandName === "addproduct") {
      const name = interaction.options.getString("name", true).trim();
      const price = interaction.options.getString("price", true).trim();
      const description = interaction.options.getString("description", true).trim();
      const instructions = interaction.options.getString("instructions")?.trim() || "";
      if (findProduct(name)) {
        await interaction.reply({ content: "❌ A product with that name already exists.", ephemeral: true });
        return;
      }
      database.products.push({ name, price, description, instructions, addedAt: new Date().toISOString() });
      saveDatabase();
      appendLog("addproduct", { by: interaction.user.id, name, price });
      await interaction.reply({ embeds: [makeEmbed("💗 Product Added", `**${name}** has been added to the shop.\n**Price:** ${price}`)], ephemeral: true });
      return;
    }

    // STAFF: removeproduct
    if (commandName === "removeproduct") {
      const name = interaction.options.getString("name", true);
      const index = database.products.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
      if (index === -1) {
        await interaction.reply({ content: "❌ Product not found.", ephemeral: true });
        return;
      }
      const removed = database.products.splice(index, 1)[0];
      saveDatabase();
      appendLog("removeproduct", { by: interaction.user.id, name: removed.name });
      await interaction.reply({ embeds: [makeEmbed("💗 Product Removed", `**${removed.name}** has been removed from the shop.`)], ephemeral: true });
      return;
    }

    // STAFF: announce
    if (commandName === "announce") {
      const message = interaction.options.getString("message", true);
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      if (!channel?.isTextBased?.() || !channel.send) {
        await interaction.reply({ content: "❌ Please choose a text channel.", ephemeral: true });
        return;
      }
      await channel.send({ embeds: [makeEmbed("💗 Jayce Announcement", message)], allowedMentions: { parse: [] } });
      appendLog("announce", { by: interaction.user.id, channel: channel.id });
      await interaction.reply({ content: `✅ Announcement posted in ${channel}.`, ephemeral: true });
      return;
    }

    // STAFF: posttos/postrules
    if (commandName === "posttos" || commandName === "postrules") {
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      if (!channel?.isTextBased?.() || !channel.send) {
        await interaction.reply({ content: "❌ Please choose a text channel.", ephemeral: true });
        return;
      }
      if (commandName === "posttos") await channel.send({ embeds: [makeEmbed("💗 Jayce — Terms of Service", database.tos.text || "No TOS set.")] });
      else await channel.send({ embeds: [makeEmbed("💗 Jayce Server Rules", database.rules.text || "No rules set.")] });
      appendLog(commandName, { by: interaction.user.id, channel: channel.id });
      await interaction.reply({ content: `✅ Posted in ${channel}.`, ephemeral: true });
      return;
    }

    // STAFF: edit-tos / edit-rules
    if (commandName === "edit-tos" || commandName === "edit-rules") {
      const text = interaction.options.getString("text", true).trim();
      if (commandName === "edit-tos") database.tos.text = text;
      else database.rules.text = text;
      saveDatabase();
      appendLog(commandName, { by: interaction.user.id });
      await interaction.reply({ content: `✅ ${commandName === "edit-tos" ? "TOS" : "Rules"} updated.`, ephemeral: true });
      return;
    }

    // STAFF: staffhelp
    if (commandName === "staffhelp") {
      await interaction.reply({ embeds: [makeEmbed("💗 Jayce Staff Commands", ["`/addproduct` — Add a product to the shop.", "`/removeproduct` — Remove a product from the shop.", "`/announce` — Post an announcement.", "`/posttos` — Post the Terms of Service.", "`/postrules` — Post the server rules.", "`/edit-tos` — Edit saved Terms of Service.", "`/edit-rules` — Edit saved rules.", "`/export-logs` — Export recent logs.", "", `**Required role:** <@&${STAFF_ROLE_ID}>`].join("\n"))], ephemeral: true });
      return;
    }

    // STAFF: export-logs
    if (commandName === "export-logs") {
      const last = database.logs.slice(-1000).map((l) => `[${l.timestamp}] ${l.action} ${JSON.stringify(l, null, 0)}`).join("\n");
      const buffer = Buffer.from(last, "utf8");
      const attachment = new AttachmentBuilder(buffer, { name: "logs.txt" });
      appendLog("export-logs", { by: interaction.user.id, count: database.logs.length });
      await interaction.reply({ content: `✅ Exported ${database.logs.length} logs (last 1000).`, files: [attachment], ephemeral: true });
      return;
    }

    // ---------- ACCOUNT COMMANDS ----------
    if (commandName === "register") {
      const username = interaction.options.getString("username", true).trim();
      const password = interaction.options.getString("password", true).trim();
      if (!username || !password) {
        await interaction.reply({ content: "❌ Username and password are required.", ephemeral: true });
        return;
      }
      if (database.accounts[username]) {
        await interaction.reply({ content: "❌ That username is already registered.", ephemeral: true });
        return;
      }
      database.accounts[username] = { password, ownerId: interaction.user.id, createdAt: new Date().toISOString(), key: null, hwid: null, mobileMain: null };
      saveDatabase();
      appendLog("register", { by: interaction.user.id, username });
      await interaction.reply({ content: `✅ Registered username **${username}**. Keep your password safe.`, ephemeral: true });
      return;
    }

    if (commandName === "getkey") {
      const username = interaction.options.getString("username", true).trim();
      const password = interaction.options.getString("password", true).trim();
      const acct = database.accounts[username];
      if (!acct || acct.password !== password) {
        await interaction.reply({ content: "❌ Invalid username or password.", ephemeral: true });
        return;
      }
      // generate key
      const key = makeCode(28);
      acct.key = key;
      acct.keyGeneratedAt = new Date().toISOString();
      saveDatabase();
      appendLog("getkey", { by: interaction.user.id, username });
      // DM the user
      try {
        const dm = await interaction.user.send({ embeds: [makeEmbed("Your access key", `Username: **${username}**\nKey: \`${key}\`\nKeep this safe. Do not share with others.`)] });
        await interaction.reply({ content: "✅ Key generated and sent to your DMs.", ephemeral: true });
      } catch (err) {
        // could not DM, fallback to ephemeral reply (still include key)
        await interaction.reply({ content: `⚠️ Could not DM you — here is your key: \`${key}\` (keep it safe)`, ephemeral: true });
      }
      return;
    }

    if (commandName === "resethwid") {
      const username = interaction.options.getString("username", true).trim();
      const password = interaction.options.getString("password", true).trim();
      const acct = database.accounts[username];
      if (!acct || acct.password !== password) {
        await interaction.reply({ content: "❌ Invalid username or password.", ephemeral: true });
        return;
      }
      acct.hwid = null;
      acct.hwidResetAt = new Date().toISOString();
      saveDatabase();
      appendLog("resethwid", { by: interaction.user.id, username });
      await interaction.reply({ content: `✅ HWID for **${username}** has been reset.`, ephemeral: true });
      return;
    }

    if (commandName === "mobilemain") {
      const username = interaction.options.getString("username", true).trim();
      const password = interaction.options.getString("password", true).trim();
      const key = interaction.options.getString("key", true).trim();
      const acct = database.accounts[username];
      if (!acct || acct.password !== password) {
        await interaction.reply({ content: "❌ Invalid username or password.", ephemeral: true });
        return;
      }
      if (!acct.key || acct.key !== key) {
        await interaction.reply({ content: "❌ Invalid key. Request a key with /getkey first.", ephemeral: true });
        return;
      }
      acct.mobileMain = { enabled: true, enabledAt: new Date().toISOString() };
      saveDatabase();
      appendLog("mobilemain", { by: interaction.user.id, username });
      await interaction.reply({ content: `✅ Mobile main enabled for **${username}**.`, ephemeral: true });
      return;
    }

    // unknown command
    await interaction.reply({ content: "Unknown command.", ephemeral: true });
  } catch (error) {
    console.error(`Error handling /${commandName}:`, error);
    const reply = { content: "❌ Something went wrong. Please try again later.", ephemeral: true };
    try { if (interaction.replied || interaction.deferred) await interaction.followUp(reply); else await interaction.reply(reply); } catch (e) { console.error("Reply failed:", e); }
  }
});

// ==============================
// START BOT
// ==============================
client.once("ready", async () => {
  console.log(`💗 Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.login(TOKEN).catch((error) => {
  console.error("Discord login failed. Check DISCORD_TOKEN in Render.", error);
  process.exit(1);
});
