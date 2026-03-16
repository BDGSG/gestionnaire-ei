const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Analyse un document via Claude Vision (image) ou texte (PDF extrait)
 * Retourne: { category, title, date, amount, vendor, reference, description }
 */
async function classifyDocument(base64Content, mimeType, filename) {
  const systemPrompt = `Tu es un assistant spécialisé dans la classification de documents comptables et administratifs pour une Entreprise Individuelle française (VTC, e-commerce, services numériques).

Analyse le document et retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) avec ces champs:
{
  "category": "facture_emise|facture_recue|devis|releve_bancaire|fiscal|social_urssaf|assurance|contrat|administratif|vehicule|ecommerce|autre",
  "title": "Titre court descriptif du document",
  "date": "YYYY-MM-DD ou null si non trouvée",
  "amount": nombre ou null,
  "vendor": "Nom de l'émetteur/fournisseur ou null",
  "reference": "Numéro de référence/facture ou null",
  "description": "Description en 1 phrase",
  "confidence": 0.0 à 1.0
}

Règles de classification:
- Factures Uber/Bolt → "facture_recue" (ce sont des factures que l'entreprise reçoit des plateformes)
- Factures que l'EI émet → "facture_emise"
- Relevés de compte → "releve_bancaire"
- Avis d'imposition, déclarations TVA, CFE → "fiscal"
- Attestations URSSAF, cotisations → "social_urssaf"
- RC Pro, assurance auto → "assurance"
- Carte grise, contrôle technique → "vehicule"
- Commandes clients e-commerce → "ecommerce"
- Kbis, SIRET, courriers officiels → "administratif"`;

  const content = [];

  if (mimeType.startsWith('image/')) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64Content }
    });
  } else {
    // Pour les PDF, on envoie comme texte si extrait, ou image si converti
    content.push({
      type: 'text',
      text: `Document: ${filename}\n\nContenu extrait:\n${base64Content}`
    });
  }

  content.push({
    type: 'text',
    text: 'Analyse ce document et retourne le JSON de classification.'
  });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content }]
    });

    const text = response.content[0].text.trim();
    // Extraire le JSON même s'il y a du texte autour
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { category: 'autre', title: filename, confidence: 0 };
  } catch (err) {
    console.error('[AI] Classification error:', err.message);
    return { category: 'autre', title: filename, confidence: 0, error: err.message };
  }
}

/**
 * Extrait le texte d'une image via Claude Vision (OCR)
 */
async function ocrImage(base64Content, mimeType) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64Content }
          },
          { type: 'text', text: 'Extrais tout le texte visible de cette image. Retourne uniquement le texte brut.' }
        ]
      }]
    });
    return response.content[0].text;
  } catch (err) {
    console.error('[AI] OCR error:', err.message);
    return '';
  }
}

module.exports = { classifyDocument, ocrImage };
