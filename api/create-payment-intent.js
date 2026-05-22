const Stripe = require("stripe");

// Catalogue côté serveur (anti-tampering) — prix doivent matcher index.html
const CATALOGUE = {
  "Bouquet 10 fleurs": 3500,
  "Bouquet 20 fleurs": 7000,
  "Bouquet 30 fleurs (Populaire)": 10500,
};

// Bouquet personnalisé "Bouquet personnalisé N roses" → N * 3.50€
function priceForCustom(name) {
  const match = name.match(/^Bouquet personnalisé (\d+) roses$/);
  if (!match) return null;
  const roses = parseInt(match[1], 10);
  if (!roses || roses < 5 || roses > 100) return null;
  return roses * 350;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
    return res.status(503).json({ error: "Stripe non configuré" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "JSON invalide" }); }
  }

  const { items, name, email, phone, address } = body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Panier vide" });
  }
  if (!name || !email || !phone || !address) {
    return res.status(400).json({ error: "Informations manquantes" });
  }

  // Re-validate prices server-side
  let subtotalCents = 0;
  const lines = [];
  for (const item of items) {
    const priceCents = CATALOGUE[item.name] ?? priceForCustom(item.name);
    if (!priceCents) {
      return res.status(400).json({ error: `Produit inconnu: ${item.name}` });
    }
    subtotalCents += priceCents;
    lines.push({ name: item.name, priceCents });
  }
  const shippingCents = 500; // 5€ Île-de-France
  const totalCents = subtotalCents + shippingCents;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const intent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: "eur",
    automatic_payment_methods: { enabled: true },
    receipt_email: email,
    description: `Bouquet Gourmand — ${items.length} article${items.length > 1 ? "s" : ""}`,
    shipping: {
      name,
      phone,
      address: { line1: address, country: "FR" },
    },
    metadata: {
      app: "bouquet-gourmand",
      email,
      phone,
      items: JSON.stringify(lines).slice(0, 480),
      subtotal_cents: String(subtotalCents),
      shipping_cents: String(shippingCents),
    },
  });

  return res.status(200).json({
    clientSecret: intent.client_secret,
    totalCents,
    subtotalCents,
    shippingCents,
  });
};
