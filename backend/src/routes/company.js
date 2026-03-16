const { Router } = require('express');
const { supabase } = require('../services/supabase');
const router = Router();

// GET /api/company
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('ei_company')
    .select('*')
    .limit(1)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/company
router.put('/', async (req, res) => {
  const { data: current } = await supabase.from('ei_company').select('id').limit(1).single();
  const { data, error } = await supabase
    .from('ei_company')
    .update(req.body)
    .eq('id', current.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
