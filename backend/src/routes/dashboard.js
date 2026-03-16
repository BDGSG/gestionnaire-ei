const { Router } = require('express');
const { supabase } = require('../services/supabase');
const dayjs = require('dayjs');
const router = Router();

// GET /api/dashboard - Données pour le dashboard principal
router.get('/', async (req, res) => {
  try {
    const now = dayjs();
    const startMonth = now.startOf('month').format('YYYY-MM-DD');
    const endMonth = now.endOf('month').format('YYYY-MM-DD');
    const startYear = now.startOf('year').format('YYYY-MM-DD');
    const endYear = now.endOf('year').format('YYYY-MM-DD');

    // Transactions du mois
    const { data: monthTx } = await supabase
      .from('transactions')
      .select('type, amount_ttc, amount_tva, activity')
      .gte('date', startMonth)
      .lte('date', endMonth);

    // Transactions de l'année
    const { data: yearTx } = await supabase
      .from('transactions')
      .select('type, amount_ttc, amount_tva, amount_ht, activity, date')
      .gte('date', startYear)
      .lte('date', endYear);

    // Factures impayées
    const { data: unpaidInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_ttc, due_date, clients(company_name, first_name, last_name)')
      .in('status', ['sent', 'overdue'])
      .order('due_date');

    // Prochaines échéances
    const { data: deadlines } = await supabase
      .from('fiscal_deadlines')
      .select('*')
      .gte('deadline_date', now.format('YYYY-MM-DD'))
      .eq('status', 'pending')
      .order('deadline_date')
      .limit(5);

    // Documents récents
    const { data: recentDocs } = await supabase
      .from('documents')
      .select('id, title, category, extracted_date, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    // Calculs
    const monthRecettes = (monthTx || []).filter(t => t.type === 'recette');
    const monthDepenses = (monthTx || []).filter(t => t.type === 'depense');
    const yearRecettes = (yearTx || []).filter(t => t.type === 'recette');
    const yearDepenses = (yearTx || []).filter(t => t.type === 'depense');

    const caMonth = monthRecettes.reduce((s, t) => s + Number(t.amount_ttc), 0);
    const depMonth = monthDepenses.reduce((s, t) => s + Number(t.amount_ttc), 0);
    const caYear = yearRecettes.reduce((s, t) => s + Number(t.amount_ttc), 0);
    const depYear = yearDepenses.reduce((s, t) => s + Number(t.amount_ttc), 0);

    const tvaCollectedMonth = monthRecettes.reduce((s, t) => s + Number(t.amount_tva || 0), 0);
    const tvaDeductMonth = monthDepenses.reduce((s, t) => s + Number(t.amount_tva || 0), 0);

    // CA par activité (année)
    const caByActivity = {};
    yearRecettes.forEach(t => {
      const key = t.activity || 'autre';
      caByActivity[key] = (caByActivity[key] || 0) + Number(t.amount_ttc);
    });

    // CA par mois (année)
    const caByMonth = Array(12).fill(0);
    yearRecettes.forEach(t => {
      const m = new Date(t.date).getMonth();
      caByMonth[m] += Number(t.amount_ttc);
    });

    // Seuil TVA
    const caHtYear = yearRecettes.reduce((s, t) => s + Number(t.amount_ht || 0), 0);
    const seuilTvaServices = 37500;
    const seuilTvaVente = 85000;

    res.json({
      month: {
        ca: caMonth,
        depenses: depMonth,
        benefice: caMonth - depMonth,
        tvaCollected: tvaCollectedMonth,
        tvaDeductible: tvaDeductMonth,
        tvaDue: tvaCollectedMonth - tvaDeductMonth
      },
      year: {
        ca: caYear,
        caHt: caHtYear,
        depenses: depYear,
        benefice: caYear - depYear,
        caByActivity,
        caByMonth
      },
      unpaidInvoices: unpaidInvoices || [],
      deadlines: deadlines || [],
      recentDocs: recentDocs || [],
      seuilsTva: {
        services: { seuil: seuilTvaServices, current: caHtYear, percentage: Math.round(caHtYear / seuilTvaServices * 100) },
        vente: { seuil: seuilTvaVente, current: caHtYear, percentage: Math.round(caHtYear / seuilTvaVente * 100) }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
