/**
 * Anti-doublon 6 couches
 *
 * 1. telegram_file_unique_id (avant download)
 * 2. SHA-256 hash exact (après download)
 * 3. Hash perceptuel dHash (résiste compression/recadrage)
 * 4. Empreinte OCR (même texte = même document)
 * 5. Numéro de référence unique (facture/ticket déjà classé)
 * 6. Date + Montant + Émetteur (doublon sémantique)
 */

const crypto = require('crypto');
const { supabase } = require('./supabase');

// Sharp is optional — if it fails to load, pHash is disabled
let sharp = null;
try {
  sharp = require('sharp');
  console.log('[Dedup] sharp loaded — perceptual hash enabled');
} catch (err) {
  console.warn('[Dedup] sharp not available — perceptual hash disabled:', err.message);
}

// ============================================================
// Layer 3: Perceptual Hash (dHash) via sharp
// Résiste à la compression, resize, léger recadrage
// ============================================================
async function computePerceptualHash(buffer, mimeType) {
  if (!mimeType.startsWith('image/')) return null;

  try {
    if (!sharp) return null;
    // Resize to 9x8 grayscale, compare adjacent pixels
    const { data } = await sharp(buffer)
      .greyscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x];
        const right = data[y * 9 + x + 1];
        hash += left < right ? '1' : '0';
      }
    }
    // Convert 64-bit binary to hex
    const hex = BigInt('0b' + hash).toString(16).padStart(16, '0');
    return hex;
  } catch (err) {
    console.error('[Dedup] Perceptual hash error:', err.message);
    return null;
  }
}

// Hamming distance between two hex hashes
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  const b1 = BigInt('0x' + hash1);
  const b2 = BigInt('0x' + hash2);
  let xor = b1 ^ b2;
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

// ============================================================
// Layer 4: OCR Text Fingerprint
// Normalise le texte et hash — même contenu = même document
// ============================================================
function computeOcrHash(ocrText) {
  if (!ocrText || ocrText.length < 20) return null;

  // Normaliser: lowercase, supprimer espaces/accents/ponctuation, garder chiffres+lettres
  const normalized = ocrText
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '') // keep only alphanumeric
    .substring(0, 500); // cap length for consistency

  if (normalized.length < 15) return null;

  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
}

// ============================================================
// Check all layers
// Returns { isDuplicate, layer, existingDoc } or { isDuplicate: false }
// ============================================================
async function checkDuplicate({ fileUniqueId, fileHash, buffer, mimeType, ocrText, classification }) {
  const categoryLabels = {
    facture_emise: 'Facture emise', facture_recue: 'Facture recue', devis: 'Devis',
    releve_bancaire: 'Releve bancaire', fiscal: 'Document fiscal', social_urssaf: 'URSSAF',
    assurance: 'Assurance', contrat: 'Contrat', administratif: 'Administratif',
    vehicule: 'Vehicule', ecommerce: 'E-commerce', autre: 'Autre'
  };

  const formatDup = (doc, layer) => ({
    isDuplicate: true,
    layer,
    existingDoc: doc,
    message: `Ce document existe deja (${layer}):\n` +
      `${doc.title || 'Sans titre'}\n` +
      `${categoryLabels[doc.category] || doc.category}\n` +
      `${doc.extracted_date || ''}`
  });

  // Layer 1: telegram_file_unique_id
  if (fileUniqueId) {
    const { data } = await supabase
      .from('ei_documents')
      .select('id, title, category, extracted_date')
      .eq('telegram_file_unique_id', fileUniqueId)
      .limit(1);
    if (data && data.length > 0) return formatDup(data[0], 'Telegram ID');
  }

  // Layer 2: SHA-256 exact
  if (fileHash) {
    const { data } = await supabase
      .from('ei_documents')
      .select('id, title, category, extracted_date')
      .eq('file_hash', fileHash)
      .limit(1);
    if (data && data.length > 0) return formatDup(data[0], 'Hash identique');
  }

  // Layer 3: Perceptual hash (images only)
  let pHash = null;
  if (buffer && mimeType && mimeType.startsWith('image/')) {
    pHash = await computePerceptualHash(buffer, mimeType);
    if (pHash) {
      // Get all perceptual hashes and compare (small table, fast enough)
      const { data } = await supabase
        .from('ei_documents')
        .select('id, title, category, extracted_date, perceptual_hash')
        .not('perceptual_hash', 'is', null);
      if (data) {
        for (const doc of data) {
          const dist = hammingDistance(pHash, doc.perceptual_hash);
          if (dist <= 8) { // 8/64 bits = ~87% similar — very likely same image
            console.log(`[Dedup] pHash match: distance=${dist} with doc ${doc.id}`);
            return formatDup(doc, `Image similaire (${Math.round((1 - dist/64) * 100)}%)`);
          }
        }
      }
    }
  }

  // Layer 4: OCR text fingerprint (after classification)
  let ocrHash = null;
  if (ocrText) {
    ocrHash = computeOcrHash(ocrText);
    if (ocrHash) {
      const { data } = await supabase
        .from('ei_documents')
        .select('id, title, category, extracted_date')
        .eq('ocr_hash', ocrHash)
        .limit(1);
      if (data && data.length > 0) return formatDup(data[0], 'Meme contenu textuel');
    }
  }

  // Layer 5: Reference number unique
  if (classification && classification.reference) {
    const ref = String(classification.reference).trim();
    if (ref.length >= 3) {
      const { data } = await supabase
        .from('ei_documents')
        .select('id, title, category, extracted_date')
        .eq('extracted_reference', ref)
        .limit(1);
      if (data && data.length > 0) return formatDup(data[0], `Ref "${ref}" deja enregistree`);
    }
  }

  // Layer 6: Date + Amount + Vendor (semantic)
  if (classification && classification.date && (classification.amount_ttc || classification.amount) && classification.vendor) {
    const amount = classification.amount_ttc || classification.amount;
    let query = supabase
      .from('ei_documents')
      .select('id, title, category, extracted_date')
      .eq('extracted_date', classification.date)
      .eq('extracted_amount', amount);

    // Flexible vendor match
    const vendorPrefix = classification.vendor.substring(0, 15);
    query = query.ilike('extracted_vendor', `%${vendorPrefix}%`);

    const { data } = await query.limit(1);
    if (data && data.length > 0) return formatDup(data[0], 'Date + Montant + Emetteur identiques');
  }

  return { isDuplicate: false, pHash, ocrHash };
}

module.exports = { checkDuplicate, computePerceptualHash, computeOcrHash, hammingDistance };
