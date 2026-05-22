const Stripe = require("stripe");

// Vercel handles raw body when we read req.rawBody, but Node serverless needs explicit raw body
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe non configuré" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // Read raw body for signature verification
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const rawBody = Buffer.concat(chunks);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Signature invalide: ${err.message}` });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      console.log(`[bouquet] payment succeeded ${intent.id} for ${intent.metadata?.email} — ${intent.amount / 100}€`);
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      console.warn(`[bouquet] payment failed ${intent.id} for ${intent.metadata?.email}`);
      break;
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
