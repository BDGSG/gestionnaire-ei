const { Router } = require('express');
const { supabase } = require('../services/supabase');
const router = Router();

// GET /api/transactions
router.get('/', async (req, res) => {
  let query = supabase
    .from('transactions')
    .select('*, clients(company_name, first_name, last_name)')
    .order('date', { ascending: false });

  if (req.query.type) query = query.eq('type', req.query.type);
  if (req.query.activity) query = query.eq('activity', req.query.activity);
  if (req.query.year) {
    query = query.gte('date', `${req.query.year}-01-01`).lte('date', `${req.query.year}-12-31`);
  }
  if (req.query.month && req.query.year) {
    const m = String(req.query.month).padStart(2, '0');
    query = query.gte('date', `${req.query.year}-${m}-01`).lte('date', `${req.query.year}-${m}-31`);
  }
  if (req.query.limit) query = query.limit(parseInt(req.query.limit));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/transactions
router.post('/', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('transactions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/transactions/livre-recettes - Livre des recettes (export)
router.get('/livre-recettes', async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const { data, error } = await supabase
    .from('transactions')
    .select('*, clients(company_name, first_name, last_name)')
    .eq('type', 'recette')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
