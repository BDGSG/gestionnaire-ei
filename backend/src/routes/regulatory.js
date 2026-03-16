const { Router } = require('express');
const { supabase } = require('../services/supabase');
const { checkRegulatoryUpdates } = require('../services/regulatory');
const router = Router();

// GET /api/regulatory - List all regulatory alerts
router.get('/', async (req, res) => {
  let query = supabase
    .from('ei_regulatory_watch')
    .select('*')
    .order('created_at', { ascending: false });

  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.category) query = query.eq('category', req.query.category);
  if (req.query.severity) query = query.eq('severity', req.query.severity);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/regulatory/check - Trigger a regulatory check now
router.post('/check', async (req, res) => {
  try {
    const result = await checkRegulatoryUpdates();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/regulatory/:id - Update alert status
router.put('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('ei_regulatory_watch')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/regulatory/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('ei_regulatory_watch').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
