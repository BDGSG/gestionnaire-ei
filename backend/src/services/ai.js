/**
 * AI Service - Uses OpenRouter API (OpenAI-compatible)
 * Supports Claude, GPT-4, Gemini, etc. via unified endpoint
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CONFIDENCE_THRESHOLD = 0.7;

// Models
const FAST_MODEL = 'anthropic/claude-haiku-4-5-20251001'; // Fast + cheap for classification
const SMART_MODEL = 'anthropic/claude-sonnet-4-6';        // Smart for regulatory analysis

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
}

async function callOpenRouter(model, messages, { maxTokens = 600, system } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key configured (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)');

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [],
  };

  if (system) {
    body.messages.push({ role: 'system', content: system });
  }
  body.messages.push(...messages);

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://gestionnaire-ei.coolify.inkora.art',
      'X-Title': 'Gestionnaire EI - DIAMBRA BROU',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

/**
 * Classify a document via AI vision
 */
async function classifyDocument(base64Content, mimeType, filename) {
  const systemPrompt = `Tu es un assistant specialise dans la classification de documents comptables et administratifs pour une Entreprise Individuelle francaise (VTC, e-commerce, services numeriques).

Analyse le document et retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) avec ces champs:
{
  "category": "facture_emise|facture_recue|devis|releve_bancaire|fiscal|social_urssaf|assurance|contrat|administratif|vehicule|ecommerce|autre",
  "title": "Titre court descriptif du document",
  "date": "YYYY-MM-DD ou null si non trouvee",
  "amount": nombre ou null,
  "vendor": "Nom de l'emetteur/fournisseur ou null",
  "reference": "Numero de reference/facture ou null",
  "description": "Description en 1 phrase du contenu du document",
  "confidence": 0.0 a 1.0,
  "doubt_reason": "Si confidence < 0.7, explique brievement pourquoi tu doutes. Sinon null",
  "suggested_categories": ["categorie1", "categorie2"]
}

Regles de classification:
- Factures Uber/Bolt → "facture_recue"
- Factures que l'EI emet a ses clients → "facture_emise"
- Releves de compte bancaire → "releve_bancaire"
- Avis d'imposition, declarations TVA, CFE → "fiscal"
- Attestations URSSAF, cotisations sociales → "social_urssaf"
- RC Pro, assurance auto, mutuelle → "assurance"
- Carte grise, controle technique, PV → "vehicule"
- Commandes clients e-commerce → "ecommerce"
- Kbis, SIRET, attestations INSEE → "administratif"
- Contrats clients, baux, CGV → "contrat"
- Devis emis ou recus → "devis"

Sois honnete sur ta confiance. Si le document est flou ou ambigu, mets une confiance basse.`;

  const messages = [{ role: 'user', content: [] }];

  if (mimeType.startsWith('image/')) {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Content}` }
    });
  } else if (mimeType === 'application/pdf') {
    // OpenRouter/Claude supports PDF via base64 in some models
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:application/pdf;base64,${base64Content}` }
    });
  } else {
    messages[0].content.push({
      type: 'text',
      text: `Document: ${filename}\n\nContenu extrait:\n${base64Content}`
    });
  }

  messages[0].content.push({
    type: 'text',
    text: 'Analyse ce document et retourne le JSON de classification.'
  });

  try {
    const text = await callOpenRouter(FAST_MODEL, messages, { maxTokens: 600, system: systemPrompt });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.needs_review = (result.confidence || 0) < CONFIDENCE_THRESHOLD;
      return result;
    }
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, doubt_reason: 'Impossible d\'analyser' };
  } catch (err) {
    console.error('[AI] Classification error:', err.message);
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, error: err.message, doubt_reason: err.message };
  }
}

/**
 * OCR: extract text from image
 */
async function ocrImage(base64Content, mimeType) {
  try {
    const messages = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Content}` } },
        { type: 'text', text: 'Extrais tout le texte visible de cette image. Retourne uniquement le texte brut.' }
      ]
    }];
    return await callOpenRouter(FAST_MODEL, messages, { maxTokens: 2000 });
  } catch (err) {
    console.error('[AI] OCR error:', err.message);
    return '';
  }
}

module.exports = { classifyDocument, ocrImage, callOpenRouter, CONFIDENCE_THRESHOLD, FAST_MODEL, SMART_MODEL };
