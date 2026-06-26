const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const message = process.argv.slice(2).join(" ").trim();

if (!webhookUrl) {
  console.error("Missing DISCORD_WEBHOOK_URL");
  process.exit(1);
}

if (!message) {
  console.error(
    'Missing message. Example: npm run publish -- "Updated user search UI"',
  );
  process.exit(1);
}

function makeDescription(text) {
  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `• ${part}`)
    .join("\n");
}

const description = makeDescription(message);

const payload = {
  content: `🚀 **New Update Released**`,
  embeds: [
    {
      description: description || `• ${message}`,
      color: 5793266,
      footer: {
        text: "updates",
      },
      timestamp: new Date().toISOString(),
    },
  ],
};

fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
})
  .then((res) => {
    if (!res.ok) {
      throw new Error(`Discord webhook failed: ${res.status}`);
    }

    console.log("Sick embed sent to Discord.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
