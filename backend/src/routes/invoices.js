const { Router } = require('express');
const { supabase } = require('../services/supabase');
const { generateInvoicePdf } = require('../services/pdf');
const dayjs = require('dayjs');
const router = Router();

// GET /api/invoices
router.get('/', async (req, res) => {
  const query = supabase
    .from('invoices')
    .select('*, clients(company_name, first_name, last_name)')
    .order('issue_date', { ascending: false });

  if (req.query.status) query.eq('status', req.query.status);
  if (req.query.activity) query.eq('activity', req.query.activity);
  if (req.query.year) {
    query.gte('issue_date', `${req.query.year}-01-01`);
    query.lte('issue_date', `${req.query.year}-12-31`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, clients(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });

  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', req.params.id)
    .order('sort_order');

  res.json({ ...invoice, items: items || [] });
});

// POST /api/invoices
router.post('/', async (req, res) => {
  try {
    const { items, ...invoiceData } = req.body;

    // Récupérer le prochain numéro
    const { data: companyArr } = await supabase.from('company_info').select('*').limit(1);
    const company = companyArr[0];

    const invoiceNumber = `${company.invoice_prefix}-${dayjs().format('YYYY')}-${String(company.next_invoice_number).padStart(4, '0')}`;

    // Calculs
    const totalHt = (items || []).reduce((s, i) => s + (i.quantity || 1) * i.unit_price_ht, 0);
    const tvaRate = invoiceData.tva_rate || 20;
    const totalTva = totalHt * tvaRate / 100;
    const totalTtc = totalHt + totalTva;

    const { data: invoice, error } = await supabase.from('invoices').insert({
      ...invoiceData,
      invoice_number: invoiceNumber,
      total_ht: totalHt.toFixed(2),
      total_tva: totalTva.toFixed(2),
      total_ttc: totalTtc.toFixed(2),
      tva_rate: tvaRate,
      due_date: invoiceData.due_date || dayjs().add(company.default_payment_delay_days || 30, 'day').format('YYYY-MM-DD')
    }).select().single();

    if (error) throw error;

    // Insérer les lignes
    if (items && items.length > 0) {
      await supabase.from('invoice_items').insert(
        items.map((item, i) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity || 1,
          unit: item.unit || 'unité',
          unit_price_ht: item.unit_price_ht,
          tva_rate: item.tva_rate || tvaRate,
          sort_order: i
        }))
      );
    }

    // Incrémenter compteur
    await supabase.from('company_info').update({
      next_invoice_number: company.next_invoice_number + 1
    }).eq('id', company.id);

    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/invoices/:id
router.put('/:id', async (req, res) => {
  const { items, ...invoiceData } = req.body;

  // Recalculer si items fournis
  if (items) {
    const totalHt = items.reduce((s, i) => s + (i.quantity || 1) * i.unit_price_ht, 0);
    const tvaRate = invoiceData.tva_rate || 20;
    invoiceData.total_ht = totalHt.toFixed(2);
    invoiceData.total_tva = (totalHt * tvaRate / 100).toFixed(2);
    invoiceData.total_ttc = (totalHt * (1 + tvaRate / 100)).toFixed(2);

    // Remplacer les lignes
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    await supabase.from('invoice_items').insert(
      items.map((item, i) => ({
        invoice_id: req.params.id,
        description: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'unité',
        unit_price_ht: item.unit_price_ht,
        tva_rate: item.tva_rate || invoiceData.tva_rate || 20,
        sort_order: i
      }))
    );
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(invoiceData)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/invoices/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices').select('*, clients(*)').eq('id', req.params.id).single();
    const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', req.params.id).order('sort_order');
    const { data: companyArr } = await supabase.from('company_info').select('*').limit(1);

    const pdfBuffer = await generateInvoicePdf(invoice, companyArr[0], invoice.clients, items);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/:id/mark-paid
router.post('/:id/mark-paid', async (req, res) => {
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      payment_date: req.body.payment_date || dayjs().format('YYYY-MM-DD'),
      payment_method: req.body.payment_method || 'virement'
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Créer la transaction recette associée
  await supabase.from('transactions').insert({
    type: 'recette',
    activity: data.activity,
    date: data.payment_date || dayjs().format('YYYY-MM-DD'),
    description: `Facture ${data.invoice_number}`,
    amount_ht: data.total_ht,
    amount_tva: data.total_tva,
    amount_ttc: data.total_ttc,
    tva_rate: data.tva_rate,
    payment_method: data.payment_method,
    invoice_id: data.id,
    client_id: data.client_id
  });

  res.json(data);
});

module.exports = router;
