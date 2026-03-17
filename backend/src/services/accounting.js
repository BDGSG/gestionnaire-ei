/**
 * Service Comptable — Livre-journal + Export FEC
 *
 * Génère les écritures comptables en partie double pour chaque opération.
 * Conforme au FEC (Fichier des Ecritures Comptables) art. A.47 A-1 du LPF.
 */

const { supabase } = require('./supabase');
const dayjs = require('dayjs');

// Mapping expense_type → compte comptable charge
const EXPENSE_ACCOUNTS = {
  carburant:            { account: '606100', label: 'Carburant' },
  entretien_vehicule:   { account: '615000', label: 'Entretien vehicule' },
  assurance:            { account: '616000', label: 'Primes assurance' },
  telephone:            { account: '626000', label: 'Telecoms' },
  internet:             { account: '626000', label: 'Telecoms' },
  logiciel:             { account: '626000', label: 'Logiciels/Telecoms' },
  achat_marchandise:    { account: '607000', label: 'Achats marchandises' },
  frais_port:           { account: '624100', label: 'Frais port' },
  comptabilite:         { account: '622600', label: 'Honoraires comptables' },
  formation:            { account: '618500', label: 'Formation' },
  cotisations_sociales: { account: '646000', label: 'Cotisations URSSAF' },
  impots_taxes:         { account: '635100', label: 'Impots et taxes' },
  fournitures:          { account: '606300', label: 'Fournitures' },
  deplacement:          { account: '625100', label: 'Deplacements' },
  peage:                { account: '625600', label: 'Peages' },
  parking:              { account: '625700', label: 'Parking' },
  autre:                { account: '618500', label: 'Divers' },
};

// Mapping activité → compte produit
const REVENUE_ACCOUNTS = {
  vtc:                  { account: '706000', label: 'Prestations VTC' },
  ecommerce:            { account: '707000', label: 'Ventes marchandises' },
  services_numeriques:  { account: '706000', label: 'Prestations services num.' },
  general:              { account: '706000', label: 'Prestations de services' },
};

/**
 * Générer les écritures journal pour une dépense (facture reçue)
 */
async function writeExpenseEntries(transaction, document) {
  const entries = [];
  const date = transaction.date || dayjs().format('YYYY-MM-DD');
  const year = new Date(date).getFullYear();
  const ref = document?.extracted_reference || `TX-${transaction.id.substring(0, 8)}`;
  const expenseAccount = EXPENSE_ACCOUNTS[transaction.expense_category] || EXPENSE_ACCOUNTS.autre;
  const journalCode = transaction.payment_method === 'especes' ? 'CA' : 'AC';
  const counterAccount = transaction.payment_method === 'especes' ? '530000' : '401000';
  const counterLabel = transaction.payment_method === 'especes' ? 'Caisse' : 'Fournisseurs';

  const amountHt = parseFloat(transaction.amount_ht) || parseFloat(transaction.amount_ttc) || 0;
  const amountTva = parseFloat(transaction.amount_tva) || 0;
  const amountTtc = parseFloat(transaction.amount_ttc) || amountHt + amountTva;

  // Écriture 1: Charge HT au débit
  entries.push({
    entry_date: date,
    piece_date: date,
    piece_ref: ref,
    journal_code: journalCode,
    account_number: expenseAccount.account,
    account_label: expenseAccount.label,
    debit: amountHt,
    credit: 0,
    label: transaction.description || 'Depense',
    piece_type: 'facture_recue',
    linked_transaction_id: transaction.id,
    linked_document_id: document?.id || null,
    activity: transaction.activity || 'general',
    fiscal_year: year,
  });

  // Écriture 2: TVA déductible au débit (si TVA)
  if (amountTva > 0) {
    entries.push({
      entry_date: date,
      piece_date: date,
      piece_ref: ref,
      journal_code: journalCode,
      account_number: '445660',
      account_label: 'TVA deductible',
      debit: amountTva,
      credit: 0,
      label: `TVA deductible - ${transaction.description || 'Depense'}`,
      piece_type: 'facture_recue',
      linked_transaction_id: transaction.id,
      linked_document_id: document?.id || null,
      activity: transaction.activity || 'general',
      fiscal_year: year,
    });
  }

  // Écriture 3: Contrepartie au crédit (fournisseur ou caisse)
  entries.push({
    entry_date: date,
    piece_date: date,
    piece_ref: ref,
    journal_code: journalCode,
    account_number: counterAccount,
    account_label: counterLabel,
    debit: 0,
    credit: amountTtc,
    label: transaction.description || 'Depense',
    piece_type: 'facture_recue',
    linked_transaction_id: transaction.id,
    linked_document_id: document?.id || null,
    activity: transaction.activity || 'general',
    fiscal_year: year,
  });

  // Écriture 4: Si avance de frais, écriture exploitant
  if (document?.is_cash_advance) {
    entries.push({
      entry_date: date,
      piece_date: date,
      piece_ref: ref,
      journal_code: 'OD',
      account_number: '108000',
      account_label: 'Compte exploitant',
      debit: amountTtc,
      credit: 0,
      label: `Avance de frais - ${transaction.description || 'Depense'}`,
      piece_type: 'avance_frais',
      linked_transaction_id: transaction.id,
      linked_document_id: document?.id || null,
      activity: transaction.activity || 'general',
      fiscal_year: year,
    });
    entries.push({
      entry_date: date,
      piece_date: date,
      piece_ref: ref,
      journal_code: 'OD',
      account_number: counterAccount,
      account_label: counterLabel,
      debit: 0,
      credit: amountTtc,
      label: `Avance de frais - remboursement exploitant`,
      piece_type: 'avance_frais',
      linked_transaction_id: transaction.id,
      linked_document_id: document?.id || null,
      activity: transaction.activity || 'general',
      fiscal_year: year,
    });
  }

  const { error } = await supabase.from('ei_journal').insert(entries);
  if (error) {
    console.error('[Accounting] Error writing expense entries:', error.message);
  } else {
    console.log(`[Accounting] ${entries.length} entries written for expense ${ref}`);
  }
  return entries;
}

/**
 * Générer les écritures journal pour une recette (facture émise)
 */
async function writeRevenueEntries(invoice) {
  const entries = [];
  const date = invoice.issue_date || dayjs().format('YYYY-MM-DD');
  const year = new Date(date).getFullYear();
  const ref = invoice.invoice_number;
  const revenueAccount = REVENUE_ACCOUNTS[invoice.activity] || REVENUE_ACCOUNTS.general;

  const amountHt = parseFloat(invoice.total_ht) || 0;
  const amountTva = parseFloat(invoice.total_tva) || 0;
  const amountTtc = parseFloat(invoice.total_ttc) || amountHt + amountTva;

  // Écriture 1: Client au débit
  entries.push({
    entry_date: date, piece_date: date, piece_ref: ref, journal_code: 'VE',
    account_number: '411000', account_label: 'Clients',
    debit: amountTtc, credit: 0,
    label: `Facture ${ref}`,
    piece_type: 'facture_emise', linked_invoice_id: invoice.id,
    activity: invoice.activity || 'general', fiscal_year: year,
  });

  // Écriture 2: Produit au crédit
  entries.push({
    entry_date: date, piece_date: date, piece_ref: ref, journal_code: 'VE',
    account_number: revenueAccount.account, account_label: revenueAccount.label,
    debit: 0, credit: amountHt,
    label: `Facture ${ref}`,
    piece_type: 'facture_emise', linked_invoice_id: invoice.id,
    activity: invoice.activity || 'general', fiscal_year: year,
  });

  // Écriture 3: TVA collectée au crédit
  if (amountTva > 0) {
    entries.push({
      entry_date: date, piece_date: date, piece_ref: ref, journal_code: 'VE',
      account_number: '445710', account_label: 'TVA collectee',
      debit: 0, credit: amountTva,
      label: `TVA collectee - Facture ${ref}`,
      piece_type: 'facture_emise', linked_invoice_id: invoice.id,
      activity: invoice.activity || 'general', fiscal_year: year,
    });
  }

  const { error } = await supabase.from('ei_journal').insert(entries);
  if (error) {
    console.error('[Accounting] Error writing revenue entries:', error.message);
  } else {
    console.log(`[Accounting] ${entries.length} entries written for invoice ${ref}`);
  }
  return entries;
}

/**
 * Export FEC — Fichier des Ecritures Comptables
 * Format réglementaire : tab-separated, UTF-8, colonnes normées
 * Ref: art. A.47 A-1 du Livre des procédures fiscales
 */
async function exportFEC(year) {
  const { data: entries, error } = await supabase
    .from('ei_journal')
    .select('*')
    .eq('fiscal_year', year)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!entries || entries.length === 0) return null;

  // En-têtes FEC normées (18 colonnes obligatoires)
  const headers = [
    'JournalCode',     // Code journal
    'JournalLib',      // Libellé journal
    'EcritureNum',     // Numéro séquentiel écriture
    'EcritureDate',    // Date écriture (YYYYMMDD)
    'CompteNum',       // Numéro de compte
    'CompteLib',       // Libellé de compte
    'CompAuxNum',      // Numéro compte auxiliaire
    'CompAuxLib',      // Libellé compte auxiliaire
    'PieceRef',        // Référence pièce
    'PieceDate',       // Date pièce (YYYYMMDD)
    'EcritureLib',     // Libellé écriture
    'Debit',           // Montant débit
    'Credit',          // Montant crédit
    'EcrtureLet',      // Lettrage
    'DateLet',         // Date lettrage
    'ValidDate',       // Date validation
    'Montantdevise',   // Montant devise
    'Idevise',         // Identifiant devise
  ];

  const journalLabels = {
    VE: 'Journal des ventes',
    AC: 'Journal des achats',
    BQ: 'Journal de banque',
    CA: 'Journal de caisse',
    OD: 'Operations diverses',
  };

  const formatDate = (d) => d ? dayjs(d).format('YYYYMMDD') : '';
  const formatAmount = (n) => (parseFloat(n) || 0).toFixed(2).replace('.', ',');

  let lineNum = 0;
  const rows = entries.map(e => {
    lineNum++;
    return [
      e.journal_code || 'OD',
      journalLabels[e.journal_code] || 'Operations diverses',
      String(lineNum),
      formatDate(e.entry_date),
      e.account_number || '',
      e.account_label || '',
      '',  // CompAuxNum
      '',  // CompAuxLib
      e.piece_ref || '',
      formatDate(e.piece_date),
      e.label || '',
      formatAmount(e.debit),
      formatAmount(e.credit),
      e.lettrage || '',
      '',  // DateLet
      e.validated ? formatDate(e.created_at) : '',
      '',  // Montantdevise
      'EUR',
    ].join('\t');
  });

  const siren = '823642558';
  const filename = `${siren}FEC${year}0101.txt`;

  return {
    filename,
    content: headers.join('\t') + '\n' + rows.join('\n'),
    count: entries.length,
  };
}

/**
 * Résumé du journal pour une période
 */
async function getJournalSummary(year, month) {
  let query = supabase.from('ei_journal').select('*').eq('fiscal_year', year);
  if (month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    query = query.gte('entry_date', start).lt('entry_date', end);
  }

  const { data, error } = await query.order('entry_date', { ascending: true });
  if (error) return { error: error.message };

  const totalDebit = (data || []).reduce((s, e) => s + parseFloat(e.debit || 0), 0);
  const totalCredit = (data || []).reduce((s, e) => s + parseFloat(e.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return {
    entries: data || [],
    count: (data || []).length,
    totalDebit,
    totalCredit,
    balanced,
  };
}

module.exports = { writeExpenseEntries, writeRevenueEntries, exportFEC, getJournalSummary, EXPENSE_ACCOUNTS, REVENUE_ACCOUNTS };
