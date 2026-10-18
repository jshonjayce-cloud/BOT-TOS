
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

// =============== CONFIG ===============

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const STAFF_ROLE_ID = "1552637829815865414";
const BRAND = "Jayce Main";
const COLOR = 0xFF9ED2;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing TOKEN, CLIENT_ID, or GUILD_ID.");
  process.exit(1);
}

// =============== DISCORD CLIENT ===============

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// =============== KEEP-ALIVE WEB SERVER ===============

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("💗 Jayce Main bot is online!");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "online",
    bot: client.isReady(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`💗 Keep-alive server running on port ${PORT}`);
});

// =============== PRODUCT DATABASE ===============

const DATA_DIR = process.env.DATA_DIR || __dirname;
const PRODUCT_FILE = path.join(DATA_DIR, "products.json");

function loadProducts() {
  try {
    if (fs.existsSync(PRODUCT_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(PRODUCT_FILE, "utf8")
      );

      if (Array.isArray(data)) return data;
    }
  } catch (error) {
    console.error("Database error:", error.message);
  }

  return [
    {
      name: "Main Script",
      price: "Contact staff",
      description: "Contact staff for features and availability.",
    },
    {
      name: "Mobile Script",
      price: "Contact staff",
      description: "Contact staff for mobile compatibility details.",
    },
  ];
}

let products = loadProducts();

function saveProducts() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    fs.writeFileSync(
      PRODUCT_FILE,
      JSON.stringify(products, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error("Save error:", error.message);
    return false;
  }
}

// =============== EMBEDS ===============

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "Jayce Main • Script Shop ♡",
    })
    .setTimestamp();
}

function isStaff(interaction) {
  const hasRole =
    interaction.member?.roles?.cache?.has(STAFF_ROLE_ID);

  const isAdmin =
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    );

  return Boolean(hasRole || isAdmin);
}

// =============== TERMS OF SERVICE ===============

const TOS = `
**♡ JAYCE MAIN — TERMS OF SERVICE ♡**

**1. Digital Products**
Read product descriptions before purchasing. Ask staff about compatibility before paying.

**2. Payments**
Use only officially listed payment methods. Staff must verify payment before an order is complete.

**3. Refunds**
Contact staff if a product is missing, broken, or materially different from its description. Requests are reviewed under the advertised sale terms and applicable law. Nothing here removes legal consumer rights.

**4. Delivery**
Delivery times may vary. Wait for staff confirmation before considering an order complete.

**5. Product Sharing**
Unless the listing says otherwise, purchases are for the buyer's personal use. Do not leak, resell, or redistribute paid files without permission from the rights holder.

**6. Support and Updates**
Support and updates depend on the product listing. Future compatibility is not guaranteed unless explicitly promised.

**7. Account Security**
Never share passwords, session cookies, or recovery codes.

**8. Fraud and Abuse**
Fake payment receipts, scams, harassment, and fraudulent activity may result in moderation or an order investigation.

**9. Lawful Use**
Follow applicable laws and platform rules. Malware, credential theft, unauthorized access, and damage to systems are not permitted.

**10. Changes**
Material changes to these terms should be announced. Review the current terms before purchasing.

These terms do not override applicable law.
`;

// =============== SERVER RULES ===============

const RULES = `
**♡ JAYCE MAIN — SERVER RULES ♡**

**1.** Respect members and staff.
**2.** No scams or fake payment receipts.
**3.** No spam or unsolicited advertising.
**4.** No harassment, threats, or doxxing.
**5.** Do not leak or redistribute paid products without permission.
**6.** Use the correct purchase and support channels.
**7.** No impersonating staff or customers.
**8.** No malicious files, credential theft, or harmful links.
**9.** Follow Discord's Terms of Service and Community Guidelines.
**10.** Keep disputes civil and follow reasonable staff instructions.

**Punishments:** Warnings, timeouts, kicks, or bans depending on severity.
`;

// =============== SLASH COMMANDS ===============

const commandData = [
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available scripts"),

  new SlashCommandBuilder()
    .setName("tos")
    .setDescription("Read the Terms of Service"),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Read the server rules"),

  new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("Get purchase instructions")
    .addStringOption(option =>
      option
        .setName("product")
        .setDescription("Select a product")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get customer support instructions"),

  new SlashCommandBuilder()
    .setName("addproduct")
    .setDescription("Add a product")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("Product name")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("price")
        .setDescription("Product price")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("description")
        .setDescription("Product description")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removeproduct")
    .setDescription("Remove a product")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("Product to remove")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement")
    .addStringOption(option =>
      option.setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Announcement channel")
    ),

  new SlashCommandBuilder()
    .setName("posttos")
    .setDescription("Post the TOS")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to post in")
    ),

  new SlashCommandBuilder()
    .setName("postrules")
    .setDescription("Post the server rules")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to post in")
    ),

  new SlashCommandBuilder()
    .setName("staffhelp")
    .setDescription("View staff commands"),
].map(command => command.toJSON());

// =============== REGISTER COMMANDS ===============

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commandData }
  );

  console.log("All slash commands registered.");
}

// =============== BOT INTERACTIONS ===============

client.on("interactionCreate", async interaction => {
  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "product" || focused.name === "name") {
      const choices = products
        .filter(product =>
          product.name.toLowerCase().includes(
            String(focused.value).toLowerCase()
          )
        )
        .slice(0, 25)
        .map(product => ({
          name: product.name.slice(0, 100),
          value: product.name.slice(0, 100),
        }));

      await interaction.respond(choices).catch(() => {});
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    const command = interaction.commandName;

    // PUBLIC COMMANDS

    if (command === "shop") {
      const description = products.length
        ? products.map((product, index) =>
            `**${index + 1}. ${product.name}**\n` +
            `Price: **${product.price}**\n` +
            `${product.description}`
          ).join("\n\n")
        : "The shop is currently empty.";

      return interaction.reply({
        embeds: [
          embed("˚₊· Jayce Main Shop ♡ ·₊˚", description),
        ],
      });
    }

    if (command === "tos") {
      return interaction.reply({
        embeds: [embed("Terms of Service", TOS)],
      });
    }

    if (command === "rules") {
      return interaction.reply({
        embeds: [embed("Server Rules", RULES)],
      });
    }

    if (command === "purchase") {
      const name = interaction.options.getString("product");

      const product = products.find(
        item => item.name.toLowerCase() === name.toLowerCase()
      );

      if (!product) {
        return interaction.reply({
          content: "Product not found. Use `/shop` to browse.",
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          embed(
            `Purchase: ${product.name}`,
            `**Price:** ${product.price}\n` +
            `**Details:** ${product.description}\n\n` +
            "Contact authorized staff to arrange payment and delivery."
          ),
        ],
        ephemeral: true,
      });
    }

    if (command === "support") {
      return interaction.reply({
        embeds: [
          embed(
            "Customer Support ♡",
            "Contact staff in your designated support channel. " +
            "Include the product name and a brief description of the issue. " +
            "Never share passwords or session cookies."
          ),
        ],
        ephemeral: true,
      });
    }

    // STAFF PERMISSIONS

    const staffCommands = [
      "addproduct",
      "removeproduct",
      "announce",
      "posttos",
      "postrules",
      "staffhelp",
    ];

    if (
      staffCommands.includes(command) &&
      !isStaff(interaction)
    ) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    // ADD PRODUCT

    if (command === "addproduct") {
      const name = interaction.options.getString("name").trim();
      const price = interaction.options.getString("price").trim();
      const description =
        interaction.options.getString("description").trim();

      if (products.some(
        item => item.name.toLowerCase() === name.toLowerCase()
      )) {
        return interaction.reply({
          content: "That product already exists.",
          ephemeral: true,
        });
      }

      products.push({ name, price, description });

      if (!saveProducts()) {
        products.pop();

        return interaction.reply({
          content: "Could not save the product. Check storage settings.",
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `Added **${name}** to the shop.`,
        ephemeral: true,
      });
    }

    // REMOVE PRODUCT

    if (command === "removeproduct") {
      const name = interaction.options.getString("name");

      const index = products.findIndex(
        item => item.name.toLowerCase() === name.toLowerCase()
      );

      if (index === -1) {
        return interaction.reply({
          content: "Product not found.",
          ephemeral: true,
        });
      }

      const removed = products.splice(index, 1)[0];

      if (!saveProducts()) {
        products.splice(index, 0, removed);

        return interaction.reply({
          content: "Could not save the change.",
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `Removed **${removed.name}**.`,
        ephemeral: true,
      });
    }

    // ANNOUNCEMENTS

    if (command === "announce") {
      const message = interaction.options.getString("message");
      const channel =
        interaction.options.getChannel("channel") ||
        interaction.channel;

      if (!channel?.isTextBased() ||
          typeof channel.send !== "function") {
        return interaction.reply({
          content: "Choose a valid text channel.",
          ephemeral: true,
        });
      }

      await channel.send({
        embeds: [
          embed("📢 Jayce Main Announcement", message),
        ],
        allowedMentions: { parse: [] },
      });

      return interaction.reply({
        content: "Announcement posted.",
        ephemeral: true,
      });
    }

    // POST TOS AND RULES

    if (command === "posttos" || command === "postrules") {
      const channel =
        interaction.options.getChannel("channel") ||
        interaction.channel;

      if (!channel?.isTextBased() ||
          typeof channel.send !== "function") {
        return interaction.reply({
          content: "Choose a valid text channel.",
          ephemeral: true,
        });
      }

      const isTos = command === "posttos";

      await channel.send({
        embeds: [
          embed(
            isTos ? "Terms of Service" : "Server Rules",
            isTos ? TOS : RULES
          ),
        ],
        allowedMentions: { parse: [] },
      });

      return interaction.reply({
        content: `Posted ${isTos ? "the TOS" : "the rules"}.`,
        ephemeral: true,
      });
    }

    // STAFF HELP

    if (command === "staffhelp") {
      return interaction.reply({
        embeds: [
          embed(
            "Jayce Main — Staff Commands",
            [
              "`/addproduct` — Add a product",
              "`/removeproduct` — Remove a product",
              "`/announce` — Post an announcement",
              "`/posttos` — Publish the TOS",
              "`/postrules` — Publish the rules",
              "`/staffhelp` — Show this menu",
            ].join("\n")
          ),
        ],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("Interaction error:", error);

    const response = {
      content: "Something went wrong. Check the Render logs.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// =============== CONNECTION MONITORING ===============

client.once("ready", () => {
  console.log(`💗 ${client.user.tag} is online.`);
});

client.on("shardDisconnect", (_event, shardId) => {
  console.warn(`Discord connection lost on shard ${shardId}.`);
});

client.on("shardReconnecting", shardId => {
  console.log(`Reconnecting to Discord shard ${shardId}...`);
});

client.on("shardResume", shardId => {
  console.log(`Discord connection resumed on shard ${shardId}.`);
});

// =============== STARTUP ===============

async function start() {
  await registerCommands();
  await client.login(TOKEN);
}

start().catch(error => {
  console.error("Startup failed:", error);
  server.close();
  process.exit(1);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection:", error);
});
