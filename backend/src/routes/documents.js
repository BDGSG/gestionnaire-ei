const { Router } = require('express');
const { supabase } = require('../services/supabase');
const { classifyDocument } = require('../services/ai');
const multer = require('multer');
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/documents
router.get('/', async (req, res) => {
  let query = supabase
    .from('documents')
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
    .from('documents')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res) => {
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path, original_filename, file_type')
    .eq('id', req.params.id)
    .single();

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const { data, error } = await supabase.storage
    .from('documents')
    .download(doc.storage_path);

  if (error) return res.status(500).json({ error: error.message });

  const buffer = Buffer.from(await data.arrayBuffer());
  res.setHeader('Content-Type', `application/${doc.file_type}`);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}"`);
  res.send(buffer);
});

// POST /api/documents/upload - Upload + classification IA
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { buffer, mimetype, originalname, size } = req.file;
    const base64 = buffer.toString('base64');

    // Classification IA
    let classification;
    if (mimetype.startsWith('image/')) {
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
      .from('documents')
      .upload(storagePath, buffer, { contentType: mimetype });

    if (uploadErr) throw uploadErr;

    // BDD
    const { data: doc, error: dbErr } = await supabase.from('documents').insert({
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
      ai_classification_confidence: classification.confidence || 0
    }).select().single();

    if (dbErr) throw dbErr;

    res.status(201).json({ document: doc, classification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/documents/:id
router.put('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('documents')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  // Supprimer le fichier du storage aussi
  const { data: doc } = await supabase.from('documents').select('storage_path').eq('id', req.params.id).single();
  if (doc) {
    await supabase.storage.from('documents').remove([doc.storage_path]);
  }
  const { error } = await supabase.from('documents').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/documents/stats/summary
router.get('/stats/summary', async (req, res) => {
  const { data, error } = await supabase.from('documents').select('category, year');
  if (error) return res.status(500).json({ error: error.message });

  const byCategory = {};
  const byYear = {};
  (data || []).forEach(d => {
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
    byYear[d.year] = (byYear[d.year] || 0) + 1;
  });

  res.json({ total: data.length, byCategory, byYear });
});

module.exports = router;
