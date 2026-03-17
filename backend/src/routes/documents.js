const { Router } = require('express');
const { supabase } = require('../services/supabase');
const { classifyDocument, CONFIDENCE_THRESHOLD } = require('../services/ai');
const { getBot, getOwnerId } = require('../services/telegram');
const multer = require('multer');
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const CATEGORY_LABELS = {
  facture_emise: 'Facture emise', facture_recue: 'Facture recue', devis: 'Devis',
  releve_bancaire: 'Releve bancaire', fiscal: 'Document fiscal', social_urssaf: 'URSSAF/Social',
  assurance: 'Assurance', contrat: 'Contrat', administratif: 'Administratif',
  vehicule: 'Vehicule', ecommerce: 'E-commerce', autre: 'Autre'
};

// GET /api/documents
router.get('/', async (req, res) => {
  let query = supabase
    .from('ei_documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (req.query.category) query = query.eq('category', req.query.category);
  if (req.query.year) query = query.eq('year', parseInt(req.query.year));
  if (req.query.search) {
    query = query.or(`title.ilike.%${req.query.search}%,description.ilike.%${req.query.search}%,extracted_vendor.ilike.%${req.query.search}%`);
  }
  if (req.query.limit) query = query.limit(parseInt(req.query.limit));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('ei_documents')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res) => {
  const { data: doc } = await supabase
    .from('ei_documents')
    .select('storage_path, original_filename, file_type')
    .eq('id', req.params.id)
    .single();

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const { data, error } = await supabase.storage
    .from('ei-documents')
    .download(doc.storage_path);

  if (error) return res.status(500).json({ error: error.message });

  const buffer = Buffer.from(await data.arrayBuffer());
  res.setHeader('Content-Type', `application/${doc.file_type}`);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}"`);
  res.send(buffer);
});

// POST /api/documents/upload - Upload + classification IA + notification Telegram
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { buffer, mimetype, originalname, size } = req.file;

    // Anti-doublon par hash
    const crypto = require('crypto');
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const { data: duplicates } = await supabase
      .from('ei_documents')
      .select('id, title, category, extracted_date')
      .eq('file_hash', fileHash)
      .limit(1);

    if (duplicates && duplicates.length > 0) {
      return res.status(409).json({
        error: 'duplicate',
        message: 'Ce document existe déjà',
        existing: duplicates[0]
      });
    }

    const base64 = buffer.toString('base64');

    // Classification IA (supporte images ET PDF natifs)
    let classification;
    if (mimetype.startsWith('image/') || mimetype === 'application/pdf') {
      classification = await classifyDocument(base64, mimetype, originalname);
    } else {
      classification = await classifyDocument(
        `Fichier: ${originalname}, Type: ${mimetype}, Taille: ${size} bytes`,
        'text/plain',
        originalname
      );
    }

    // Stockage
    const year = classification.date ? new Date(classification.date).getFullYear() : new Date().getFullYear();
    const storagePath = `${classification.category}/${year}/${Date.now()}_${originalname}`;

    const { error: uploadErr } = await supabase.storage
      .from('ei-documents')
      .upload(storagePath, buffer, { contentType: mimetype });

    if (uploadErr) throw uploadErr;

    // BDD
    const { data: doc, error: dbErr } = await supabase.from('ei_documents').insert({
      category: req.body.category || classification.category || 'autre',
      title: req.body.title || classification.title || originalname,
      description: classification.description,
      extracted_date: classification.date,
      extracted_amount: classification.amount,
      extracted_vendor: classification.vendor,
      extracted_reference: classification.reference,
      original_filename: originalname,
      file_type: mimetype.split('/')[1],
      file_size: size,
      storage_path: storagePath,
      year,
      month: classification.date ? new Date(classification.date).getMonth() + 1 : new Date().getMonth() + 1,
      source: 'web',
      ai_classification_confidence: classification.confidence || 0,
      file_hash: fileHash
    }).select().single();

    if (dbErr) throw dbErr;

    // Notification Telegram si confiance basse
    if (classification.needs_review) {
      notifyTelegramLowConfidence(doc, classification);
    }

    res.status(201).json({ document: doc, classification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/documents/:id/reclassify - Changer manuellement la catégorie
router.post('/:id/reclassify', async (req, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'category is required' });

  const { data, error } = await supabase
    .from('ei_documents')
    .update({ category, ai_classification_confidence: 1.0 })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/documents/:id
router.put('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('ei_documents')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  const { data: doc } = await supabase.from('ei_documents').select('storage_path').eq('id', req.params.id).single();
  if (doc) {
    await supabase.storage.from('ei-documents').remove([doc.storage_path]);
  }
  const { error } = await supabase.from('ei_documents').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/documents/stats/summary
router.get('/stats/summary', async (req, res) => {
  const { data, error } = await supabase.from('ei_documents').select('category, year');
  if (error) return res.status(500).json({ error: error.message });

  const byCategory = {};
  const byYear = {};
  (data || []).forEach(d => {
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
    byYear[d.year] = (byYear[d.year] || 0) + 1;
  });

  res.json({ total: data.length, byCategory, byYear });
});

/**
 * Envoie une notification Telegram quand un document uploadé via le web a une confiance basse
 */
function notifyTelegramLowConfidence(doc, classification) {
  try {
    const bot = getBot();
    const ownerId = getOwnerId();
    if (!bot || !ownerId) return;

    const catLabels = {
      facture_emise: '📄 Facture émise', facture_recue: '📥 Facture reçue', devis: '📋 Devis',
      releve_bancaire: '🏦 Relevé bancaire', fiscal: '🏛️ Document fiscal', social_urssaf: '🏥 URSSAF/Social',
      assurance: '🛡️ Assurance', contrat: '📝 Contrat', administratif: '📁 Administratif',
      vehicule: '🚗 Véhicule', ecommerce: '🛒 E-commerce', autre: '📎 Autre'
    };

    const suggestions = classification.suggested_categories || [];
    const allCats = [...new Set([classification.category, ...suggestions])].filter(Boolean);

    const keyboard = allCats.map(cat => [{
      text: catLabels[cat] || cat,
      callback_data: `doc_reclass_${doc.id}_${cat}`
    }]);

    const commonCats = ['facture_recue', 'facture_emise', 'fiscal', 'administratif', 'autre'];
    const extraCats = commonCats.filter(c => !allCats.includes(c));
    for (let i = 0; i < extraCats.length && keyboard.length < 6; i++) {
      keyboard.push([{
        text: catLabels[extraCats[i]] || extraCats[i],
        callback_data: `doc_reclass_${doc.id}_${extraCats[i]}`
      }]);
    }

    keyboard.push([{
      text: '✅ Garder: ' + (catLabels[classification.category] || classification.category),
      callback_data: `doc_confirm_${doc.id}`
    }]);

    bot.sendMessage(ownerId,
      `⚠️ *Document uploadé via le web - Doute IA*\n\n` +
      `📝 ${classification.title || doc.original_filename}\n` +
      `📂 Suggestion: ${catLabels[classification.category] || classification.category}\n` +
      `📊 Confiance: ${Math.round((classification.confidence || 0) * 100)}%\n` +
      `${classification.doubt_reason ? '❓ _' + classification.doubt_reason + '_' : ''}\n\n` +
      `👇 *Choisis la bonne catégorie:*`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
  } catch (err) {
    console.error('[Documents] Telegram notification error:', err.message);
  }
}

module.exports = router;
