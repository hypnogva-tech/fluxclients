// Fonction Vercel : ajoute un contact dans une liste Brevo.
// action "optin"  -> liste Optin (déclenche l'automatisation Brevo)
// action "booked" -> liste RDV réservé (fait sortir le contact des relances)
//
// Variables d'environnement à définir dans Vercel (Settings > Environment Variables) :
//   BREVO_API_KEY      (obligatoire) votre clé API Brevo
//   BREVO_LIST_OPTIN   (facultatif, 7 par défaut)
//   BREVO_LIST_RDV     (facultatif, 6 par défaut)
//   BREVO_ATTR_PRENOM  (facultatif, FIRSTNAME par défaut ; mettez PRENOM si c'est le nom de l'attribut dans votre compte)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const action = body.action;
  const email = String(body.email || '').trim().toLowerCase();
  const prenom = String(body.prenom || '').trim().slice(0, 80);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail invalide' });
  }

  const lists = {
    optin: Number(process.env.BREVO_LIST_OPTIN || 7),
    booked: Number(process.env.BREVO_LIST_RDV || 6),
  };
  const listId = lists[action];
  if (!listId) {
    return res.status(400).json({ error: 'Action inconnue' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API Brevo manquante' });
  }

  const payload = { email, listIds: [listId], updateEnabled: true };
  const attrName = process.env.BREVO_ATTR_PRENOM || 'FIRSTNAME';
  const withAttrs = prenom ? { ...payload, attributes: { [attrName]: prenom } } : payload;

  try {
    let r = await sendToBrevo(apiKey, withAttrs);
    // Si l'attribut prénom n'existe pas dans le compte, on réessaie sans lui
    if (r.status === 400 && withAttrs.attributes) {
      r = await sendToBrevo(apiKey, payload);
    }
    if (!r.ok) {
      const detail = await r.text();
      console.error('Brevo error', r.status, detail);
      return res.status(502).json({ error: 'Erreur Brevo' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function sendToBrevo(apiKey, data) {
  return fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(data),
  });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
