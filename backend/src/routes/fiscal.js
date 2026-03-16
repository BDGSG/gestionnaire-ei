const { Router } = require('express');
const { supabase } = require('../services/supabase');
const router = Router();

// GET /api/fiscal/deadlines
router.get('/deadlines', async (req, res) => {
  let query = supabase
    .from('fiscal_deadlines')
    .select('*')
    .order('deadline_date');

  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.category) query = query.eq('category', req.query.category);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/fiscal/deadlines/:id
router.put('/deadlines/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('fiscal_deadlines')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/fiscal/deadlines
router.post('/deadlines', async (req, res) => {
  const { data, error } = await supabase
    .from('fiscal_deadlines')
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/fiscal/tva-summary
router.get('/tva-summary', async (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  const { data: recettes } = await supabase
    .from('transactions')
    .select('amount_tva, date')
    .eq('type', 'recette')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);

  const { data: depenses } = await supabase
    .from('transactions')
    .select('amount_tva, date')
    .eq('type', 'depense')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);

  // Par mois
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    collected: 0,
    deductible: 0,
    due: 0
  }));

  (recettes || []).forEach(t => {
    const m = new Date(t.date).getMonth();
    months[m].collected += Number(t.amount_tva || 0);
  });

  (depenses || []).forEach(t => {
    const m = new Date(t.date).getMonth();
    months[m].deductible += Number(t.amount_tva || 0);
  });

  months.forEach(m => {
    m.due = m.collected - m.deductible;
  });

  const totalCollected = months.reduce((s, m) => s + m.collected, 0);
  const totalDeductible = months.reduce((s, m) => s + m.deductible, 0);

  res.json({
    year: parseInt(year),
    months,
    total: {
      collected: totalCollected,
      deductible: totalDeductible,
      due: totalCollected - totalDeductible
    }
  });
});

module.exports = router;
