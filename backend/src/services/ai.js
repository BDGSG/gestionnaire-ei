/**
 * AI Service - 2-pass pipeline: Pixtral OCR → Claude Sonnet classification
 * Uses OpenRouter API (OpenAI-compatible)
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CONFIDENCE_THRESHOLD = 0.7;

// Models
const OCR_MODEL = 'mistralai/pixtral-large-2411';       // Pass 1: raw OCR extraction
const CLASSIFY_MODEL = 'anthropic/claude-sonnet-4';      // Pass 2: precise classification + image
const CHAT_MODEL = 'anthropic/claude-haiku-4.5';         // Chat conversationnel
const SMART_MODEL = 'anthropic/claude-sonnet-4.5';       // Regulatory analysis

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

  const MAX_RETRIES = 3;
  const RETRY_STATUSES = [500, 502, 503, 529];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

    if (res.ok) {
      const data = await res.json();
      return data.choices[0].message.content;
    }

    const errText = await res.text();

    if (!RETRY_STATUSES.includes(res.status)) {
      throw new Error(`OpenRouter ${res.status}: ${errText.substring(0, 300)}`);
    }

    console.warn(`[AI] OpenRouter ${res.status} attempt ${attempt}/${MAX_RETRIES} (${model}): ${errText.substring(0, 100)}`);

    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    } else {
      throw new Error(`OpenRouter ${res.status} after ${MAX_RETRIES} retries: ${errText.substring(0, 300)}`);
    }
  }
}

// ============================================================
// PASS 1: OCR brut via Pixtral — transcription fidèle
// ============================================================
async function ocrDocument(base64Content, mimeType, filename) {
  console.log(`[AI] Pass 1 OCR: ${OCR_MODEL} for ${filename}`);

  const messages = [{ role: 'user', content: [] }];

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Content}` }
    });
  }

  messages[0].content.push({
    type: 'text',
    text: `Transcris integralement tout le texte visible dans ce document, ligne par ligne, en respectant exactement l'orthographe, les chiffres, les dates et les montants tels qu'ecrits. Ne reformule pas, ne corrige pas, ne complete pas. Copie caractere par caractere ce qui est imprime ou ecrit.`
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

// ============================================================
// PASS 2: Classification via Claude Sonnet — texte OCR + image
// ============================================================
const CLASSIFICATION_SYSTEM = `Tu es un expert comptable specialise dans l'analyse de documents pour une Entreprise Individuelle francaise.
Activites: VTC (Uber, Bolt) et e-commerce.

Tu recois le texte OCR brut + l'image originale d'un document. Extrais UNIQUEMENT les informations explicitement presentes.

Retourne UNIQUEMENT un JSON valide (PAS de markdown, PAS de backticks, PAS de texte avant/apres):
{
  "category": "facture_emise|facture_recue|devis|releve_bancaire|fiscal|social_urssaf|assurance|contrat|administratif|vehicule|ecommerce|autre",
  "title": "Titre court et precis",
  "date": "YYYY-MM-DD ou null",
  "amount_ht": nombre ou null,
  "amount_tva": nombre ou null,
  "amount_ttc": nombre ou null,
  "vendor": "Nom exact de l'emetteur tel qu'ecrit sur le document, ou null",
  "vendor_siret": "SIRET si visible, ou null",
  "reference": "Numero de facture/ticket/reference exact, ou null",
  "description": "Description en 1 phrase",
  "expense_type": "carburant|entretien_vehicule|assurance|telephone|internet|logiciel|achat_marchandise|frais_port|comptabilite|formation|cotisations_sociales|impots_taxes|fournitures|deplacement|peage|parking|autre|null",
  "payment_method": "especes|cb|virement|cheque|prelevement|plateforme|autre|inconnu",
  "is_cash_advance": true/false,
  "confidence": 0.0 a 1.0,
  "field_confidence": {
    "date": 0.0-1.0,
    "amount_ttc": 0.0-1.0,
    "vendor": 0.0-1.0,
    "reference": 0.0-1.0,
    "category": 0.0-1.0,
    "payment_method": 0.0-1.0
  },
  "doubt_reason": "raison si confidence < 0.7, sinon null",
  "suggested_categories": [],
  "questions": ["question 1 si doute", "question 2 si doute"]
}

REGLES ABSOLUES:
- Si un champ n'est pas clairement visible/lisible dans le document, mets null. JAMAIS inventer.
- La date doit etre celle ECRITE sur le document (pas aujourd'hui).
- Le montant doit etre le TOTAL TTC final tel qu'ecrit.
- Le vendor est le NOM EXACT du commerce/entreprise emetteur, tel qu'imprime.
- field_confidence: ta confiance pour chaque champ individuel (0.0 = pas vu, 1.0 = certain)

DETECTION DU MODE DE PAIEMENT:
- Cherche les mentions: "ESPECES", "CB", "CARTE", "VISA", "MASTERCARD", "VIREMENT", "CHEQUE", "PRELEVEMENT", "TPE"
- Si "ESPECES" ou "CASH" visible sur le ticket -> payment_method: "especes"
- Si "CB", "CARTE BANCAIRE", "VISA", "MC", numero carte masque (****) -> payment_method: "cb"
- Si aucune mention de paiement visible -> payment_method: "inconnu"

AVANCE DE FRAIS (is_cash_advance):
- Un ticket paye en ESPECES pour une depense professionnelle (carburant, peage, parking, fournitures...) est tres probablement une avance de frais personnels -> is_cash_advance: true
- Un ticket paye par CB avec un numero de carte -> probablement pas avance (carte pro ou perso) -> is_cash_advance: false sauf si doute
- Si le mode de paiement est "inconnu" et que c'est une petite depense pro (< 100 EUR), mettre is_cash_advance en doute (ajouter la question dans "questions")

QUESTIONS (champ "questions"):
- Si tu as le moindre doute sur un champ, formule une question claire en francais pour demander confirmation
- Exemples: "Ce ticket de 45.30 EUR a ete paye en especes. Est-ce une avance de frais personnels ?", "Le mode de paiement n'est pas visible. Paye par CB pro, CB perso ou especes ?", "Cette depense de 12 EUR chez Bricorama est-elle professionnelle ?"
- Si aucun doute, "questions": []

Classification:
- Tickets station-service/carburant -> "facture_recue", expense: "carburant"
- Factures/releves Uber/Bolt -> "facture_recue"
- Peages -> "facture_recue", expense: "peage"
- Parking -> "facture_recue", expense: "parking"
- Factures emises par l'EI -> "facture_emise"
- Releves bancaires -> "releve_bancaire"
- Avis imposition, TVA, CFE -> "fiscal"
- URSSAF, cotisations -> "social_urssaf"
- RC Pro, assurance auto -> "assurance"
- Carte grise, CT, PV -> "vehicule"
- Commandes e-commerce -> "ecommerce"
- Kbis, SIRET, INSEE -> "administratif"
- Contrats, baux -> "contrat"
- Devis -> "devis"`;

async function classifyWithSonnet(ocrText, base64Content, mimeType, filename) {
  console.log(`[AI] Pass 2 Classification: ${CLASSIFY_MODEL} for ${filename} (${ocrText.length} chars OCR)`);

  const userContent = [];

  // Envoyer l'image originale pour vérification croisée
  if (base64Content && (mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Content}` }
    });
  }

  userContent.push({
    type: 'text',
    text: `Document: "${filename}"

Texte OCR extrait (transcription brute):
---
${ocrText}
---

Analyse ce document en comparant le texte OCR et l'image. Extrais uniquement les informations explicitement presentes. Pour chaque champ, indique ta confiance. Si tu n'es pas sur a 100%, mets null. Retourne le JSON strict.`
  });

  try {
    const text = await callOpenRouter(CLASSIFY_MODEL, [
      { role: 'user', content: userContent }
    ], { maxTokens: 1200, system: CLASSIFICATION_SYSTEM });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      result.ocr_text = ocrText;
      // Use amount_ttc as main amount for backward compat
      result.amount = result.amount_ttc || result.amount || null;
      result.needs_review = (result.confidence || 0) < CONFIDENCE_THRESHOLD;

      // Cross-check amounts
      result.amount_mismatch = false;
      if (result.amount_ht != null && result.amount_tva != null && result.amount_ttc != null) {
        const expectedTtc = parseFloat(result.amount_ht) + parseFloat(result.amount_tva);
        const actualTtc = parseFloat(result.amount_ttc);
        if (Math.abs(expectedTtc - actualTtc) > 0.02) {
          console.warn(`[AI] Amount mismatch: HT(${result.amount_ht}) + TVA(${result.amount_tva}) = ${expectedTtc.toFixed(2)} != TTC(${result.amount_ttc})`);
          result.amount_mismatch = true;
          result.needs_review = true;
          result.doubt_reason = (result.doubt_reason || '') + ` Incohérence montants: HT(${result.amount_ht}) + TVA(${result.amount_tva}) ≠ TTC(${result.amount_ttc})`;
        }
      }

      return result;
    }
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, doubt_reason: 'JSON non parseable', ocr_text: ocrText };
  } catch (err) {
    console.error('[AI] Classification error:', err.message);
    return { category: 'autre', title: filename, confidence: 0, needs_review: true, error: err.message, doubt_reason: err.message, ocr_text: ocrText };
  }
}

// ============================================================
// MAIN PIPELINE: OCR (Pixtral) → Classification (Sonnet + image)
// ============================================================
async function classifyDocument(base64Content, mimeType, filename) {
  // Pass 1: OCR brut avec Pixtral
  let ocrText = '';
  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    ocrText = await ocrDocument(base64Content, mimeType, filename);
  } else {
    ocrText = base64Content;
  }

  if (!ocrText || ocrText.length < 10) {
    console.warn('[AI] OCR returned empty/short text, sending image directly to Sonnet');
    // Fallback: Sonnet with image only, empty OCR
    return classifyWithSonnet('(OCR failed - classifie depuis l\'image uniquement)', base64Content, mimeType, filename);
  }

  // Pass 2: Classification Sonnet avec texte OCR + image originale
  return classifyWithSonnet(ocrText, base64Content, mimeType, filename);
}

// ============================================================
// Chat conversationnel
// ============================================================
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

module.exports = { classifyDocument, ocrDocument, classifyWithSonnet, callOpenRouter, chatWithAI, CONFIDENCE_THRESHOLD, OCR_MODEL, CLASSIFY_MODEL, SMART_MODEL };
