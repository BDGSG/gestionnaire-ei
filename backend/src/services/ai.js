const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Analyse un document via Claude Vision (image) ou texte (PDF extrait)
 * Retourne: { category, title, date, amount, vendor, reference, description, confidence, needs_review }
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
  "description": "Description en 1 phrase du contenu du document",
  "confidence": 0.0 à 1.0,
  "doubt_reason": "Si confidence < 0.7, explique brièvement pourquoi tu doutes (ex: 'texte flou', 'document ambigu entre facture et devis'). Sinon null",
  "suggested_categories": ["catégorie1", "catégorie2"] // Les 2 catégories les plus probables si confidence < 0.7, sinon tableau vide
}

Règles de classification:
- Factures Uber/Bolt → "facture_recue" (ce sont des factures que l'entreprise reçoit des plateformes)
- Factures que l'EI émet à ses clients → "facture_emise"
- Relevés de compte bancaire → "releve_bancaire"
- Avis d'imposition, déclarations TVA, CFE, courriers impôts → "fiscal"
- Attestations URSSAF, cotisations sociales → "social_urssaf"
- RC Pro, assurance auto, mutuelle → "assurance"
- Carte grise, contrôle technique, PV → "vehicule"
- Commandes clients e-commerce, bordereaux livraison → "ecommerce"
- Kbis, SIRET, attestations INSEE, courriers officiels → "administratif"
- Contrats clients, baux, CGV signées → "contrat"
- Devis émis ou reçus → "devis"

Sois honnête sur ta confiance. Si le document est flou, partiellement visible, ou ambigu, mets une confiance basse.`;

  const content = [];

  if (mimeType.startsWith('image/')) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64Content }
    });
  } else if (mimeType === 'application/pdf') {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64Content }
    });
  } else {
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
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content }]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.needs_review = (result.confidence || 0) < CONFIDENCE_THRESHOLD;
      return result;
    }
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, doubt_reason: 'Impossible d\'analyser le document' };
  } catch (err) {
    console.error('[AI] Classification error:', err.message);
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, error: err.message, doubt_reason: err.message };
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

module.exports = { classifyDocument, ocrImage, CONFIDENCE_THRESHOLD };
