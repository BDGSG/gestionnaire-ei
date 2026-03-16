const { Router } = require('express');
const { supabase } = require('../services/supabase');
const dayjs = require('dayjs');
const router = Router();

// GET /api/quotes
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, clients(company_name, first_name, last_name)')
    .order('issue_date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/quotes/:id
router.get('/:id', async (req, res) => {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*, clients(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });

  const { data: items } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', req.params.id)
    .order('sort_order');

  res.json({ ...quote, items: items || [] });
});

// POST /api/quotes
router.post('/', async (req, res) => {
  try {
    const { items, ...quoteData } = req.body;

    const { data: companyArr } = await supabase.from('company_info').select('*').limit(1);
    const company = companyArr[0];

    const quoteNumber = `${company.quote_prefix}-${dayjs().format('YYYY')}-${String(company.next_quote_number).padStart(4, '0')}`;

    const totalHt = (items || []).reduce((s, i) => s + (i.quantity || 1) * i.unit_price_ht, 0);
    const tvaRate = quoteData.tva_rate || 20;
    const totalTva = totalHt * tvaRate / 100;
    const totalTtc = totalHt + totalTva;

    const { data: quote, error } = await supabase.from('quotes').insert({
      ...quoteData,
      quote_number: quoteNumber,
      total_ht: totalHt.toFixed(2),
      total_tva: totalTva.toFixed(2),
      total_ttc: totalTtc.toFixed(2),
      tva_rate: tvaRate,
      validity_date: quoteData.validity_date || dayjs().add(30, 'day').format('YYYY-MM-DD')
    }).select().single();

    if (error) throw error;

    if (items && items.length > 0) {
      await supabase.from('quote_items').insert(
        items.map((item, i) => ({
          quote_id: quote.id,
          description: item.description,
          quantity: item.quantity || 1,
          unit: item.unit || 'unité',
          unit_price_ht: item.unit_price_ht,
          tva_rate: item.tva_rate || tvaRate,
          sort_order: i
        }))
      );
    }

    await supabase.from('company_info').update({
      next_quote_number: company.next_quote_number + 1
    }).eq('id', company.id);

    res.status(201).json(quote);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/quotes/:id/convert - Convertir devis en facture
router.post('/:id/convert', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotes').select('*').eq('id', req.params.id).single();
    const { data: items } = await supabase.from('quote_items').select('*').eq('quote_id', req.params.id);
    const { data: companyArr } = await supabase.from('company_info').select('*').limit(1);
    const company = companyArr[0];

    const invoiceNumber = `${company.invoice_prefix}-${dayjs().format('YYYY')}-${String(company.next_invoice_number).padStart(4, '0')}`;

    const { data: invoice, error } = await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      client_id: quote.client_id,
      status: 'draft',
      activity: quote.activity,
      issue_date: dayjs().format('YYYY-MM-DD'),
      due_date: dayjs().add(company.default_payment_delay_days || 30, 'day').format('YYYY-MM-DD'),
      total_ht: quote.total_ht,
      total_tva: quote.total_tva,
      total_ttc: quote.total_ttc,
      tva_rate: quote.tva_rate,
      notes: `Converti depuis devis ${quote.quote_number}`
    }).select().single();

    if (error) throw error;

    // Copier les lignes
    if (items) {
      await supabase.from('invoice_items').insert(
        items.map(item => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price_ht: item.unit_price_ht,
          tva_rate: item.tva_rate,
          sort_order: item.sort_order
        }))
      );
    }

    // Marquer le devis comme facturé
    await supabase.from('quotes').update({
      status: 'invoiced',
      converted_invoice_id: invoice.id
    }).eq('id', req.params.id);

    await supabase.from('company_info').update({
      next_invoice_number: company.next_invoice_number + 1
    }).eq('id', company.id);

    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
