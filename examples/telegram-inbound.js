// telegram-inbound — minimal example for @kanelr/ott-gateway
//
// Setup:
//   npm install
//   npm run build
//   node examples/telegram-inbound.js

const { dispatchInbound } = require("@kanelr/ott-gateway");

// In your Telegram webhook handler:
async function onTelegramUpdate(update) {
  const result = await dispatchInbound({
    source: "telegram",
    payload: update,
    caller: { service: "my-bot", scope: "public" }
  });
  if (!result.ok) console.warn("Denied:", result.reason);
  return result;
}
