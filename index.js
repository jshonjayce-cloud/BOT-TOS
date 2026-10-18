
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

// ==============================
// JAYCE BOT CONFIGURATION
// ==============================
const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || "1561499976872370339";
const GUILD_ID = process.env.GUILD_ID || "1552438137299664977";
const STAFF_ROLE_ID = "1552637829815865414";

const PORT = process.env.PORT || 10000;
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

app.get("/", (_req, res) => {
  res.status(200).send("💗 Jayce bot is online!");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "online" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`💗 Keep-alive server running on port ${PORT}`);
});

// ==============================
// DATABASE
// ==============================
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDatabase() {
  try {
    if (fs.existsSync(DATABASE_PATH)) {
      const data = JSON.parse(fs.readFileSync(DATABASE_PATH, "utf8"));
      return {
        products: Array.isArray(data.products) ? data.products : [],
      };
    }
  } catch (error) {
    console.error("Could not read database:", error);
  }

  return { products: [] };
}

const database = loadDatabase();

function saveDatabase() {
  fs.writeFileSync(
    DATABASE_PATH,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

// ==============================
// DISCORD CLIENT
// ==============================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ==============================
// STAFF ROLE CHECK
// ONLY THE SPECIFIED ROLE IS ALLOWED
// NO ADMINISTRATOR BYPASS
// ==============================
function isStaff(interaction) {
  if (!interaction.inGuild()) return false;

  const roles = interaction.member?.roles;

  // Discord API interaction member: roles is an array of role IDs.
  if (Array.isArray(roles)) {
    return roles.includes(STAFF_ROLE_ID);
  }

  // GuildMember role manager fallback.
  if (roles?.cache) {
    return roles.cache.has(STAFF_ROLE_ID);
  }

  return false;
}

async function requireStaff(interaction) {
  if (isStaff(interaction)) return true;

  await interaction.reply({
    content: "❌ You need the Jayce staff role to use this command.",
    ephemeral: true,
  });

  return false;
}

// ==============================
// EMBED HELPERS
// ==============================
const PINK = 0xff9ed2;

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(PINK)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "jayce ♡ soft & secure" })
    .setTimestamp();
}

function findProduct(name) {
  return database.products.find(
    (product) => product.name.toLowerCase() === name.toLowerCase()
  );
}

// ==============================
// TERMS OF SERVICE
// ==============================
function createTosEmbed() {
  return new EmbedBuilder()
    .setColor(PINK)
    .setTitle("💗 Jayce — Terms of Service")
    .setDescription(
      [
        "**1. Purchases and Payments**\nReview the product description, price, compatibility information, and any purchase conditions before paying. Keep your receipt or proof of purchase. Refunds are handled according to the posted product policy and applicable law; this server does not override your legal rights.",
        "**2. Script Licenses and Sharing**\nA purchase grants only the license described for that product. Unless expressly authorized, do not leak, redistribute, resell, share access keys, or bypass licensing and access controls.",
        "**3. Support, Updates, and Compatibility**\nSupport and updates depend on the product listing and the support offered for it. Report issues respectfully and include useful details. Updates, third-party changes, or platform changes may affect compatibility.",
        "**4. Community Rules and Enforcement**\nTreat members respectfully. Scams, harassment, fraud, unauthorized distribution, and attempts to compromise systems are not allowed. Violations may lead to moderation or suspension of access, subject to applicable law.",
      ].join("\n\n")
    )
    .setFooter({ text: "jayce ♡ soft & secure" })
    .setTimestamp();
}

// ==============================
// SERVER RULES
// ==============================
function createRulesEmbed() {
  return makeEmbed(
    "💗 Jayce Server Rules",
    [
      "**1. Be respectful.** No harassment, threats, or targeted abuse.",
      "**2. No scams.** Do not impersonate staff or mislead buyers.",
      "**3. Keep channels appropriate.** Use the correct channels for questions and support.",
      "**4. No unauthorized sharing.** Do not leak paid products, keys, or private content.",
      "**5. Follow Discord's rules.** Follow Discord's Terms of Service and Community Guidelines.",
      "**6. Listen to staff.** Contact staff politely if you believe a moderation action was mistaken.",
    ].join("\n\n")
  );
}

// ==============================
// SLASH COMMAND DEFINITIONS
// ==============================
const commands = [
  new SlashCommandBuilder()
    .setName("tos")
    .setDescription("View the Jayce Terms of Service"),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("View the server rules"),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available Jayce products"),

  new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("View a product's details and purchase instructions")
    .addStringOption((option) =>
      option
        .setName("product")
        .setDescription("Choose a product")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get help with a purchase or product"),

  new SlashCommandBuilder()
    .setName("addproduct")
    .setDescription("Add a product to the shop")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Product name")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("price")
        .setDescription("Price, for example $5")
        .setRequired(true)
        .setMaxLength(50)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Product description")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("instructions")
        .setDescription("How customers should purchase it")
        .setRequired(false)
        .setMaxLength(1000)
    ),

  new SlashCommandBuilder()
    .setName("removeproduct")
    .setDescription("Remove a product from the shop")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Exact product name")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Announcement text")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post in; defaults to this channel")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("posttos")
    .setDescription("Post the Terms of Service in a channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post in; defaults to this channel")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("postrules")
    .setDescription("Post the server rules in a channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel to post in; defaults to this channel")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("staffhelp")
    .setDescription("View staff command help"),
].map((command) => command.toJSON());

// ==============================
// REGISTER GUILD COMMANDS
// ==============================
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("💗 Jayce slash commands registered.");
  } catch (error) {
    console.error(
      "Could not register slash commands. Check the bot invite, IDs, and permissions:",
      error
    );
  }
}

// ==============================
// AUTOCOMPLETE
// ==============================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAutocomplete()) return;

  try {
    const focused = interaction.options.getFocused().toLowerCase();

    if (interaction.commandName === "purchase") {
      const choices = database.products
        .filter((product) => product.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((product) => ({
          name: product.name.slice(0, 100),
          value: product.name.slice(0, 100),
        }));

      await interaction.respond(choices);
      return;
    }

    if (interaction.commandName === "removeproduct") {
      const choices = database.products
        .filter((product) => product.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((product) => ({
          name: product.name.slice(0, 100),
          value: product.name.slice(0, 100),
        }));

      await interaction.respond(choices);
    }
  } catch (error) {
    console.error("Autocomplete error:", error);
    if (!interaction.responded) {
      try {
        await interaction.respond([]);
      } catch {}
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
    // ------------------------------
    // PUBLIC: /tos
    // ------------------------------
    if (commandName === "tos") {
      await interaction.reply({ embeds: [createTosEmbed()] });
      return;
    }

    // ------------------------------
    // PUBLIC: /rules
    // ------------------------------
    if (commandName === "rules") {
      await interaction.reply({ embeds: [createRulesEmbed()] });
      return;
    }

    // ------------------------------
    // PUBLIC: /shop
    // ------------------------------
    if (commandName === "shop") {
      if (database.products.length === 0) {
        await interaction.reply({
          embeds: [
            makeEmbed(
              "💗 Jayce Shop",
              "The shop is currently empty. Check back later!"
            ),
          ],
        });
        return;
      }

      const description = database.products
        .map(
          (product, index) =>
            `**${index + 1}. ${product.name}** — ${product.price}\n${product.description}`
        )
        .join("\n\n");

      await interaction.reply({
        embeds: [makeEmbed("💗 Jayce Shop", description.slice(0, 4000))],
      });
      return;
    }

    // ------------------------------
    // PUBLIC: /purchase
    // ------------------------------
    if (commandName === "purchase") {
      const name = interaction.options.getString("product", true);
      const product = findProduct(name);

      if (!product) {
        await interaction.reply({
          content: "❌ That product was not found. Use `/shop` to see products.",
          ephemeral: true,
        });
        return;
      }

      const embed = makeEmbed(
        `💗 ${product.name}`,
        [
          `**Price:** ${product.price}`,
          `**Description:** ${product.description}`,
          `**Purchase instructions:** ${product.instructions || "Contact staff for purchase instructions."}`,
          "",
          "Please review `/tos` before purchasing.",
        ].join("\n")
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ------------------------------
    // PUBLIC: /support
    // ------------------------------
    if (commandName === "support") {
      await interaction.reply({
        embeds: [
          makeEmbed(
            "💗 Jayce Support",
            "Need help with a purchase or product?\n\n1. Explain your issue clearly.\n2. Include your order receipt or proof of purchase if relevant.\n3. Do not share passwords, bot tokens, or other sensitive account details.\n4. Contact the server's support team in the appropriate support channel.\n\nPlease be respectful while staff investigate."
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // All commands below require the exact staff role.
    const staffCommands = [
      "addproduct",
      "removeproduct",
      "announce",
      "posttos",
      "postrules",
      "staffhelp",
    ];

    if (staffCommands.includes(commandName)) {
      if (!(await requireStaff(interaction))) return;
    }

    // ------------------------------
    // STAFF: /addproduct
    // ------------------------------
    if (commandName === "addproduct") {
      const name = interaction.options.getString("name", true).trim();
      const price = interaction.options.getString("price", true).trim();
      const description = interaction.options
        .getString("description", true)
        .trim();
      const instructions =
        interaction.options.getString("instructions")?.trim() || "";

      if (findProduct(name)) {
        await interaction.reply({
          content: "❌ A product with that name already exists.",
          ephemeral: true,
        });
        return;
      }

      database.products.push({
        name,
        price,
        description,
        instructions,
        addedAt: new Date().toISOString(),
      });

      saveDatabase();

      await interaction.reply({
        embeds: [
          makeEmbed(
            "💗 Product Added",
            `**${name}** has been added to the shop.\n**Price:** ${price}`
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // ------------------------------
    // STAFF: /removeproduct
    // ------------------------------
    if (commandName === "removeproduct") {
      const name = interaction.options.getString("name", true);
      const index = database.products.findIndex(
        (product) => product.name.toLowerCase() === name.toLowerCase()
      );

      if (index === -1) {
        await interaction.reply({
          content: "❌ Product not found.",
          ephemeral: true,
        });
        return;
      }

      const removed = database.products.splice(index, 1)[0];
      saveDatabase();

      await interaction.reply({
        embeds: [
          makeEmbed(
            "💗 Product Removed",
            `**${removed.name}** has been removed from the shop.`
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // ------------------------------
    // STAFF: /announce
    // ------------------------------
    if (commandName === "announce") {
      const message = interaction.options.getString("message", true);
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.isTextBased() || !channel.send) {
        await interaction.reply({
          content: "❌ Please choose a text channel.",
          ephemeral: true,
        });
        return;
      }

      await channel.send({
        embeds: [
          makeEmbed("💗 Jayce Announcement", message),
        ],
        allowedMentions: { parse: [] },
      });

      await interaction.reply({
        content: `✅ Announcement posted in ${channel}.`,
        ephemeral: true,
      });
      return;
    }

    // ------------------------------
    // STAFF: /posttos
    // ------------------------------
    if (commandName === "posttos") {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.isTextBased() || !channel.send) {
        await interaction.reply({
          content: "❌ Please choose a text channel.",
          ephemeral: true,
        });
        return;
      }

      await channel.send({ embeds: [createTosEmbed()] });

      await interaction.reply({
        content: `✅ Terms of Service posted in ${channel}.`,
        ephemeral: true,
      });
      return;
    }

    // ------------------------------
    // STAFF: /postrules
    // ------------------------------
    if (commandName === "postrules") {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (!channel?.isTextBased() || !channel.send) {
        await interaction.reply({
          content: "❌ Please choose a text channel.",
          ephemeral: true,
        });
        return;
      }

      await channel.send({ embeds: [createRulesEmbed()] });

      await interaction.reply({
        content: `✅ Rules posted in ${channel}.`,
        ephemeral: true,
      });
      return;
    }

    // ------------------------------
    // STAFF: /staffhelp
    // ------------------------------
    if (commandName === "staffhelp") {
      await interaction.reply({
        embeds: [
          makeEmbed(
            "💗 Jayce Staff Commands",
            [
              "`/addproduct` — Add a product to the shop.",
              "`/removeproduct` — Remove a product from the shop.",
              "`/announce` — Post an announcement.",
              "`/posttos` — Post the Terms of Service.",
              "`/postrules` — Post the server rules.",
              "`/staffhelp` — Show this help menu.",
              "",
              `**Required role:** <@&${STAFF_ROLE_ID}>`,
            ].join("\n")
          ),
        ],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error(`Error in /${commandName}:`, error);

    const reply = {
      content: "❌ Something went wrong. Please try again later.",
      ephemeral: true,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error("Could not send error reply:", replyError);
    }
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
                     
