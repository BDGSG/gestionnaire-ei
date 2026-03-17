/**
 * AI Service - Uses OpenRouter API (OpenAI-compatible)
 * 2-step pipeline: Pixtral OCR → Claude classification
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CONFIDENCE_THRESHOLD = 0.7;

// Models
const OCR_MODEL = 'mistralai/pixtral-large-2411';       // Best OCR for documents/tickets
const CLASSIFY_MODEL = 'anthropic/claude-haiku-4.5';    // Fast classification on extracted text
const SMART_MODEL = 'anthropic/claude-sonnet-4.5';      // Smart for regulatory analysis

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
    throw new Error(`OpenRouter ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

/**
 * Step 1: OCR via Pixtral - extract ALL text from document
 */
async function ocrDocument(base64Content, mimeType, filename) {
  console.log(`[AI] OCR starting with ${OCR_MODEL} for ${filename}`);

  const messages = [{ role: 'user', content: [] }];

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Content}` }
    });
  }

  messages[0].content.push({
    type: 'text',
    text: `Extrais TOUT le texte visible de ce document, caractere par caractere. Inclus:
- Tous les montants, dates, numeros de reference
- Noms, adresses, numeros de telephone/SIRET/TVA
- Libelles de chaque ligne, quantites, prix unitaires, totaux
- En-tetes, pieds de page, mentions legales
- Numeros de ticket, de facture, de commande

Retourne le texte brut extrait, ligne par ligne, tel quel. Ne resume pas, ne reformule pas. Copie exactement ce qui est ecrit.`
  });

  try {
    const text = await callOpenRouter(OCR_MODEL, messages, { maxTokens: 3000 });
    console.log(`[AI] OCR extracted ${text.length} chars`);
    return text;
  } catch (err) {
    console.error('[AI] OCR error:', err.message);
    return '';
  }
}

/**
 * Step 2: Classify based on OCR text via Claude
 */
async function classifyFromText(ocrText, filename) {
  console.log(`[AI] Classifying from ${ocrText.length} chars of OCR text`);

  const systemPrompt = `Tu es un assistant specialise dans la classification de documents comptables pour une EI francaise (VTC, e-commerce, services numeriques).

Tu recois le texte OCR brut extrait d'un document. Analyse-le attentivement et retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks):
{
  "category": "facture_emise|facture_recue|devis|releve_bancaire|fiscal|social_urssaf|assurance|contrat|administratif|vehicule|ecommerce|autre",
  "title": "Titre court et precis du document",
  "date": "YYYY-MM-DD ou null",
  "amount": nombre (montant TTC principal) ou null,
  "vendor": "Nom exact de l'emetteur/fournisseur tel qu'ecrit sur le document",
  "reference": "Numero de reference/facture/ticket exact ou null",
  "description": "Description precise en 1 phrase",
  "confidence": 0.0 a 1.0,
  "doubt_reason": "Raison du doute si confidence < 0.7, sinon null",
  "suggested_categories": ["categorie1", "categorie2"],
  "expense_type": "carburant|entretien_vehicule|assurance|telephone|internet|logiciel|achat_marchandise|frais_port|comptabilite|formation|cotisations_sociales|impots_taxes|fournitures|deplacement|peage|parking|autre|null"
}

Regles de classification:
- Tickets de caisse/station-service/carburant → "facture_recue", expense_type: "carburant"
- Factures Uber/Bolt (commissions, relevés) → "facture_recue"
- Peages autoroute → "facture_recue", expense_type: "peage"
- Parking → "facture_recue", expense_type: "parking"
- Factures que l'EI emet a ses clients → "facture_emise"
- Releves de compte bancaire → "releve_bancaire"
- Avis d'imposition, declarations TVA, CFE → "fiscal"
- Attestations URSSAF, cotisations sociales → "social_urssaf"
- RC Pro, assurance auto, mutuelle → "assurance"
- Carte grise, controle technique, PV, amendes → "vehicule"
- Commandes clients e-commerce → "ecommerce"
- Kbis, SIRET, attestations INSEE → "administratif"
- Contrats, baux, CGV → "contrat"
- Devis emis ou recus → "devis"

IMPORTANT:
- Lis attentivement le texte OCR pour identifier le TYPE REEL du document
- Un ticket de station-service n'est PAS un ticket de course VTC
- Le montant doit etre le TOTAL TTC final (pas un sous-total)
- Le vendor doit etre le NOM REEL du commerce/entreprise
- Sois honnete sur ta confiance`;

  try {
    const text = await callOpenRouter(CLASSIFY_MODEL, [
      { role: 'user', content: `Voici le texte OCR extrait du document "${filename}":\n\n---\n${ocrText}\n---\n\nClassifie ce document.` }
    ], { maxTokens: 800, system: systemPrompt });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.needs_review = (result.confidence || 0) < CONFIDENCE_THRESHOLD;
      result.ocr_text = ocrText;
      return result;
    }
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, doubt_reason: 'Impossible d\'analyser', ocr_text: ocrText };
  } catch (err) {
    console.error('[AI] Classification error:', err.message);
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, error: err.message, doubt_reason: err.message, ocr_text: ocrText };
  }
}

/**
 * Main: OCR + Classify pipeline
 */
async function classifyDocument(base64Content, mimeType, filename) {
  // Step 1: OCR with Pixtral
  let ocrText = '';
  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    ocrText = await ocrDocument(base64Content, mimeType, filename);
  } else {
    ocrText = base64Content; // Already text
  }

  if (!ocrText || ocrText.length < 10) {
    console.warn('[AI] OCR returned empty/short text, falling back to vision classification');
    // Fallback: send image directly to Claude for classification
    return classifyWithVision(base64Content, mimeType, filename);
  }

  // Step 2: Classify from text
  return classifyFromText(ocrText, filename);
}

/**
 * Fallback: direct vision classification (if OCR fails)
 */
async function classifyWithVision(base64Content, mimeType, filename) {
  const messages = [{ role: 'user', content: [] }];
  messages[0].content.push({
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${base64Content}` }
  });
  messages[0].content.push({
    type: 'text',
    text: 'Analyse ce document et retourne le JSON de classification.'
  });

  try {
    const text = await callOpenRouter(OCR_MODEL, messages, { maxTokens: 800, system: 'Retourne un JSON de classification du document avec: category, title, date, amount, vendor, reference, description, confidence, doubt_reason, suggested_categories. Categories: facture_emise, facture_recue, devis, releve_bancaire, fiscal, social_urssaf, assurance, contrat, administratif, vehicule, ecommerce, autre.' });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.needs_review = (result.confidence || 0) < CONFIDENCE_THRESHOLD;
      return result;
    }
  } catch (err) {
    console.error('[AI] Vision fallback error:', err.message);
  }
  return { category: 'autre', title: filename, confidence: 0, needs_review: true, doubt_reason: 'OCR et vision ont echoue' };
}

const CHAT_MODEL = 'anthropic/claude-haiku-4.5';

/**
 * Chat conversationnel - l'assistant de gestion EI
 * Peut répondre aux questions, donner des instructions, résumer la situation
 */
async function chatWithAI(userMessage, context = {}) {
  const systemPrompt = `Tu es l'assistant de gestion de l'Entreprise Individuelle DIAMBRA BROU (SIRET: 82364255800048).
Activités: VTC (Uber/Bolt) et e-commerce.
Régime: EI au réel, assujetti TVA.

Tu aides le gérant via Telegram pour:
- Répondre à ses questions sur la gestion, fiscalité, TVA, obligations
- L'aider à créer des factures, devis, gérer ses clients
- Expliquer les documents classifiés
- Donner des rappels sur les échéances fiscales
- Résumer la situation financière

Contexte actuel:
${context.documents ? `- Documents récents: ${context.documents}` : ''}
${context.deadlines ? `- Prochaines échéances: ${context.deadlines}` : ''}
${context.stats ? `- Stats: ${context.stats}` : ''}

Réponds en français, de manière concise et pratique. Si tu ne sais pas, dis-le.
Utilise un ton professionnel mais amical. Pas d'emojis excessifs.
Si le message concerne une action (créer facture, ajouter client...), explique la commande à utiliser.

Commandes disponibles:
/facture - Créer une nouvelle facture
/devis - Créer un nouveau devis
/clients - Liste des clients
/newclient - Ajouter un client
/docs - Derniers documents
/chercher [terme] - Rechercher un document
/tva - Résumé TVA
/echeances - Échéances fiscales
/stats - Statistiques
/aide - Aide complète`;

  try {
    const response = await callOpenRouter(CHAT_MODEL, [
      { role: 'user', content: userMessage }
    ], { maxTokens: 1000, system: systemPrompt });

    return response;
  } catch (err) {
    console.error('[AI] Chat error:', err.message);
    return null;
  }
}

module.exports = { classifyDocument, ocrDocument, classifyFromText, callOpenRouter, chatWithAI, CONFIDENCE_THRESHOLD, OCR_MODEL, CLASSIFY_MODEL, SMART_MODEL };
