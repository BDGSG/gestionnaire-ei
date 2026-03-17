const TelegramBot = require('node-telegram-bot-api');
const { supabase } = require('./supabase');
const { classifyDocument, chatWithAI, CONFIDENCE_THRESHOLD } = require('./ai');
const { generateInvoicePdf } = require('./pdf');
const dayjs = require('dayjs');

// Lazy import to avoid circular dependency
function getRegulatory() { return require('./regulatory'); }

let bot;
const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID);

// Expose bot for external notifications (web uploads)
function getBot() { return bot; }
function getOwnerId() { return OWNER_ID; }

// Safe send: try Markdown first, fallback to plain text if parsing fails
async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts });
  } catch (err) {
    if (err.message && err.message.includes("can't parse entities")) {
      // Strip markdown and retry as plain text
      const plain = text.replace(/[*_`\[\]]/g, '');
      return await bot.sendMessage(chatId, plain, { ...opts, parse_mode: undefined });
    }
    throw err;
  }
}

function initBot() {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: { params: { timeout: 30 } }
  });

  // Log polling errors but don't crash
  bot.on('polling_error', (err) => {
    if (err.code === 'ETELEGRAM' && err.message.includes('409')) {
      console.warn('[Telegram] 409 Conflict - another instance may be running. Retrying...');
    } else {
      console.error('[Telegram] Polling error:', err.message);
    }
  });

  // Vérifier que c'est le propriétaire
  function isOwner(msg) {
    return msg.from.id === OWNER_ID;
  }

  // ============================================
  // /start - Accueil
  // ============================================
  bot.onText(/\/start/, (msg) => {
    if (!isOwner(msg)) return bot.sendMessage(msg.chat.id, '⛔ Accès non autorisé.');
    bot.sendMessage(msg.chat.id,
      `🏢 *Gestionnaire EI - DIAMBRA BROU*\n\n` +
      `Commandes disponibles :\n\n` +
      `📄 /facture - Créer une facture\n` +
      `📋 /devis - Créer un devis\n` +
      `👥 /clients - Gérer les clients\n` +
      `💰 /ca - Voir le chiffre d'affaires\n` +
      `📊 /tva - Résumé TVA du mois\n` +
      `📅 /echeances - Prochaines échéances fiscales\n` +
      `📂 /docs - Rechercher un document\n` +
      `💳 /recette - Enregistrer une recette\n` +
      `💸 /depense - Enregistrer une dépense\n` +
      `⚖️ /veille - Veille réglementaire (nouvelles lois)\n` +
      `🌐 /web - Lien vers le dashboard\n\n` +
      `📎 *Envoyez une photo ou un PDF* pour le classer automatiquement`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // /web - Lien dashboard
  // ============================================
  bot.onText(/\/web/, (msg) => {
    if (!isOwner(msg)) return;
    const url = process.env.APP_URL || 'http://localhost:5173';
    bot.sendMessage(msg.chat.id, `🌐 Dashboard : ${url}`);
  });

  // ============================================
  // /ca - Chiffre d'affaires
  // ============================================
  bot.onText(/\/ca/, async (msg) => {
    if (!isOwner(msg)) return;
    const now = dayjs();
    const startMonth = now.startOf('month').format('YYYY-MM-DD');
    const startYear = now.startOf('year').format('YYYY-MM-DD');
    const endDate = now.format('YYYY-MM-DD');

    const { data: monthData } = await supabase
      .from('ei_transactions')
      .select('amount_ttc, activity')
      .eq('type', 'recette')
      .gte('date', startMonth)
      .lte('date', endDate);

    const { data: yearData } = await supabase
      .from('ei_transactions')
      .select('amount_ttc, activity')
      .eq('type', 'recette')
      .gte('date', startYear)
      .lte('date', endDate);

    const monthTotal = (monthData || []).reduce((s, t) => s + Number(t.amount_ttc), 0);
    const yearTotal = (yearData || []).reduce((s, t) => s + Number(t.amount_ttc), 0);

    // Par activité
    const byActivity = {};
    (yearData || []).forEach(t => {
      const key = t.activity || 'autre';
      byActivity[key] = (byActivity[key] || 0) + Number(t.amount_ttc);
    });

    const activityLabels = { vtc: '🚗 VTC', ecommerce: '🛒 E-commerce', services_numeriques: '💻 Services numériques', general: '📦 Général' };
    const activityLines = Object.entries(byActivity)
      .map(([k, v]) => `  ${activityLabels[k] || k}: ${v.toFixed(2)} €`)
      .join('\n');

    bot.sendMessage(msg.chat.id,
      `📊 *Chiffre d'affaires*\n\n` +
      `📅 Ce mois (${now.format('MMMM YYYY')}):\n  *${monthTotal.toFixed(2)} € TTC*\n\n` +
      `📅 Cette année (${now.year()}):\n  *${yearTotal.toFixed(2)} € TTC*\n\n` +
      `Par activité (annuel):\n${activityLines || '  Aucune recette'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // /tva - Résumé TVA
  // ============================================
  bot.onText(/\/tva/, async (msg) => {
    if (!isOwner(msg)) return;
    const now = dayjs();
    const month = now.month() + 1;
    const year = now.year();

    const { data: collected } = await supabase
      .from('ei_transactions')
      .select('amount_tva')
      .eq('type', 'recette')
      .gte('date', now.startOf('month').format('YYYY-MM-DD'))
      .lte('date', now.endOf('month').format('YYYY-MM-DD'));

    const { data: deductible } = await supabase
      .from('ei_transactions')
      .select('amount_tva')
      .eq('type', 'depense')
      .gte('date', now.startOf('month').format('YYYY-MM-DD'))
      .lte('date', now.endOf('month').format('YYYY-MM-DD'));

    const tvaCollected = (collected || []).reduce((s, t) => s + Number(t.amount_tva || 0), 0);
    const tvaDeductible = (deductible || []).reduce((s, t) => s + Number(t.amount_tva || 0), 0);
    const tvaDue = tvaCollected - tvaDeductible;

    bot.sendMessage(msg.chat.id,
      `🧾 *TVA - ${now.format('MMMM YYYY')}*\n\n` +
      `TVA collectée (ventes): ${tvaCollected.toFixed(2)} €\n` +
      `TVA déductible (achats): ${tvaDeductible.toFixed(2)} €\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `*TVA à reverser: ${tvaDue.toFixed(2)} €*\n\n` +
      `⚠️ Déclaration CA3 avant le 20 du mois suivant`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // /echeances - Prochaines échéances
  // ============================================
  bot.onText(/\/echeances/, async (msg) => {
    if (!isOwner(msg)) return;
    const today = dayjs().format('YYYY-MM-DD');

    const { data: deadlines } = await supabase
      .from('ei_fiscal_deadlines')
      .select('*')
      .gte('deadline_date', today)
      .eq('status', 'pending')
      .order('deadline_date')
      .limit(10);

    if (!deadlines || deadlines.length === 0) {
      return bot.sendMessage(msg.chat.id, '✅ Aucune échéance à venir !');
    }

    const lines = deadlines.map(d => {
      const date = dayjs(d.deadline_date);
      const diff = date.diff(dayjs(), 'day');
      const urgency = diff <= 7 ? '🔴' : diff <= 14 ? '🟡' : '🟢';
      return `${urgency} *${date.format('DD/MM/YYYY')}* (J-${diff})\n   ${d.title}\n   _${d.description || ''}_`;
    }).join('\n\n');

    bot.sendMessage(msg.chat.id,
      `📅 *Prochaines échéances fiscales*\n\n${lines}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // /clients - Lister les clients
  // ============================================
  bot.onText(/\/clients/, async (msg) => {
    if (!isOwner(msg)) return;

    const { data: clients } = await supabase
      .from('ei_clients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!clients || clients.length === 0) {
      return bot.sendMessage(msg.chat.id, '👥 Aucun client enregistré.\n\nUtilisez /addclient pour en ajouter.');
    }

    const lines = clients.map((c, i) => {
      const name = c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
      const typeIcon = c.type === 'entreprise' ? '🏢' : c.type === 'plateforme' ? '📱' : '👤';
      return `${i + 1}. ${typeIcon} *${name}*${c.activity ? ' (' + c.activity + ')' : ''}`;
    }).join('\n');

    bot.sendMessage(msg.chat.id, `👥 *Clients (${clients.length})*\n\n${lines}`, { parse_mode: 'Markdown' });
  });

  // ============================================
  // /recette - Enregistrer une recette rapide
  // ============================================
  bot.onText(/\/recette/, (msg) => {
    if (!isOwner(msg)) return;
    bot.sendMessage(msg.chat.id,
      `💰 *Enregistrer une recette*\n\nFormat:\n` +
      `\`/r montant_ttc description activité\`\n\n` +
      `Exemples:\n` +
      `\`/r 150.50 Course VTC client Dupont vtc\`\n` +
      `\`/r 45.00 Vente produit XXX ecommerce\`\n` +
      `\`/r 500 Création site web services_numeriques\`\n\n` +
      `Activités: vtc, ecommerce, services\\_numeriques`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/\/r (\d+\.?\d*) (.+) (vtc|ecommerce|services_numeriques)/, async (msg, match) => {
    if (!isOwner(msg)) return;
    const amountTtc = parseFloat(match[1]);
    const description = match[2].trim();
    const activity = match[3];
    const tvaRate = 20;
    const amountHt = amountTtc / (1 + tvaRate / 100);
    const amountTva = amountTtc - amountHt;

    const { error } = await supabase.from('ei_transactions').insert({
      type: 'recette',
      activity,
      date: dayjs().format('YYYY-MM-DD'),
      description,
      amount_ht: amountHt.toFixed(2),
      amount_tva: amountTva.toFixed(2),
      amount_ttc: amountTtc.toFixed(2),
      tva_rate: tvaRate,
      payment_method: 'virement'
    });

    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Erreur: ${error.message}`);
    }

    bot.sendMessage(msg.chat.id,
      `✅ *Recette enregistrée*\n\n` +
      `💰 ${amountTtc.toFixed(2)} € TTC\n` +
      `📝 ${description}\n` +
      `🏷️ ${activity}\n` +
      `🧾 TVA: ${amountTva.toFixed(2)} €`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // /depense - Enregistrer une dépense
  // ============================================
  bot.onText(/\/d (\d+\.?\d*) (.+) (\w+)/, async (msg, match) => {
    if (!isOwner(msg)) return;
    const amountTtc = parseFloat(match[1]);
    const description = match[2].trim();
    const category = match[3];
    const tvaRate = 20;
    const amountHt = amountTtc / (1 + tvaRate / 100);
    const amountTva = amountTtc - amountHt;

    const { error } = await supabase.from('ei_transactions').insert({
      type: 'depense',
      activity: 'general',
      date: dayjs().format('YYYY-MM-DD'),
      description,
      amount_ht: amountHt.toFixed(2),
      amount_tva: amountTva.toFixed(2),
      amount_ttc: amountTtc.toFixed(2),
      tva_rate: tvaRate,
      expense_category: category,
      payment_method: 'carte'
    });

    if (error) {
      return bot.sendMessage(msg.chat.id, `❌ Erreur: ${error.message}`);
    }

    bot.sendMessage(msg.chat.id,
      `✅ *Dépense enregistrée*\n\n` +
      `💸 ${amountTtc.toFixed(2)} € TTC\n` +
      `📝 ${description}\n` +
      `🏷️ ${category}\n` +
      `🧾 TVA déductible: ${amountTva.toFixed(2)} €`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================
  // /facture - Création rapide de facture
  // ============================================
  bot.onText(/\/facture/, async (msg) => {
    if (!isOwner(msg)) return;

    const { data: clients } = await supabase
      .from('ei_clients')
      .select('id, company_name, first_name, last_name, type')
      .order('company_name');

    const keyboard = (clients || []).map(c => [{
      text: c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      callback_data: `invoice_client_${c.id}`
    }]);
    keyboard.push([{ text: '➕ Nouveau client', callback_data: 'invoice_new_client' }]);

    bot.sendMessage(msg.chat.id, '📄 *Créer une facture*\n\nChoisissez le client:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  // ============================================
  // Callback: sélection client pour facture
  // ============================================
  const invoiceState = {};

  // Note: callback_query handler is unified below after document handling

  // ============================================
  // ============================================
  // Réception messages texte: lignes facture OU chat IA
  // ============================================
  bot.on('message', async (msg) => {
    if (!isOwner(msg)) return;
    if (!msg.text) return; // ignore non-text (photos/docs handled elsewhere)
    if (msg.text.startsWith('/')) return; // commandes gérées par onText
    const chatId = msg.chat.id;

    // Mode saisie de lignes de facture
    if (invoiceState[chatId] && invoiceState[chatId].step === 'items') {
      const parts = msg.text.split('|').map(s => s.trim());
      if (parts.length >= 3) {
        invoiceState[chatId].items.push({
          description: parts[0],
          quantity: parseFloat(parts[1]) || 1,
          unit_price_ht: parseFloat(parts[2]) || 0,
          tva_rate: 20
        });
        const item = invoiceState[chatId].items[invoiceState[chatId].items.length - 1];
        const totalHt = item.quantity * item.unit_price_ht;
        bot.sendMessage(chatId,
          `✅ Ligne ajoutée: ${item.description} (${totalHt.toFixed(2)} € HT)\n` +
          `Total lignes: ${invoiceState[chatId].items.length}\n\n` +
          `Ajoutez une autre ligne ou tapez /valider`
        );
        return;
      }
    }

    // Chat conversationnel IA
    try {
      console.log(`[Telegram] Chat message: "${msg.text.substring(0, 50)}..."`);

      // Récupérer du contexte pour enrichir la réponse
      const context = {};
      try {
        const { data: recentDocs } = await supabase.from('ei_documents')
          .select('title, category, extracted_date, extracted_amount')
          .order('created_at', { ascending: false }).limit(5);
        if (recentDocs && recentDocs.length > 0) {
          context.documents = recentDocs.map(d => `${d.title} (${d.category}, ${d.extracted_date || '?'}, ${d.extracted_amount ? d.extracted_amount + '€' : '?'})`).join('; ');
        }

        const { data: deadlines } = await supabase.from('ei_fiscal_deadlines')
          .select('title, deadline_date, status')
          .gte('deadline_date', dayjs().format('YYYY-MM-DD'))
          .order('deadline_date', { ascending: true }).limit(3);
        if (deadlines && deadlines.length > 0) {
          context.deadlines = deadlines.map(d => `${d.title} (${d.deadline_date}, ${d.status})`).join('; ');
        }

        const { data: invoiceStats } = await supabase.from('ei_invoices')
          .select('status, total_ttc');
        if (invoiceStats && invoiceStats.length > 0) {
          const total = invoiceStats.reduce((s, i) => s + parseFloat(i.total_ttc || 0), 0);
          const paid = invoiceStats.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.total_ttc || 0), 0);
          context.stats = `${invoiceStats.length} factures, CA total: ${total.toFixed(2)}€, payé: ${paid.toFixed(2)}€`;
        }
      } catch (ctxErr) {
        console.error('[Telegram] Context fetch error:', ctxErr.message);
      }

      const response = await chatWithAI(msg.text, context);

      if (response) {
        await safeSend(chatId, response);
      } else {
        await safeSend(chatId, "Désolé, je n'ai pas pu traiter ta demande. Réessaie ou utilise /aide pour voir les commandes.");
      }
    } catch (err) {
      console.error('[Telegram] Chat error:', err.message);
      bot.sendMessage(chatId, `Je n'ai pas pu répondre. Erreur: ${err.message.substring(0, 100)}`).catch(() => {});
    }
  });

  // ============================================
  // /valider - Finaliser la facture
  // ============================================
  bot.onText(/\/valider/, async (msg) => {
    if (!isOwner(msg)) return;
    const chatId = msg.chat.id;
    const state = invoiceState[chatId];

    if (!state || !state.items || state.items.length === 0) {
      return bot.sendMessage(chatId, '❌ Aucune facture en cours ou aucune ligne ajoutée.');
    }

    bot.sendMessage(chatId, '⏳ Génération de la facture en cours...');

    try {
      // Récupérer infos entreprise
      const { data: companyArr } = await supabase.from('ei_company').select('*').limit(1);
      const company = companyArr[0];

      // Récupérer client
      const { data: clientArr } = await supabase.from('ei_clients').select('*').eq('id', state.clientId);
      const client = clientArr[0];

      // Numéro de facture
      const invoiceNumber = `${company.invoice_prefix}-${dayjs().format('YYYY')}-${String(company.next_invoice_number).padStart(4, '0')}`;

      // Calculs
      const totalHt = state.items.reduce((s, i) => s + i.quantity * i.unit_price_ht, 0);
      const totalTva = state.items.reduce((s, i) => s + i.quantity * i.unit_price_ht * i.tva_rate / 100, 0);
      const totalTtc = totalHt + totalTva;

      // Créer la facture en BDD
      const { data: invoice, error: invErr } = await supabase.from('ei_invoices').insert({
        invoice_number: invoiceNumber,
        client_id: state.clientId,
        status: 'draft',
        activity: state.activity,
        issue_date: dayjs().format('YYYY-MM-DD'),
        due_date: dayjs().add(company.default_payment_delay_days || 30, 'day').format('YYYY-MM-DD'),
        total_ht: totalHt.toFixed(2),
        total_tva: totalTva.toFixed(2),
        total_ttc: totalTtc.toFixed(2),
        tva_rate: 20
      }).select().single();

      if (invErr) throw invErr;

      // Insérer les lignes
      const itemsToInsert = state.items.map((item, i) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price_ht: item.unit_price_ht,
        tva_rate: item.tva_rate,
        sort_order: i
      }));
      await supabase.from('ei_invoice_items').insert(itemsToInsert);

      // Incrémenter le compteur
      await supabase.from('ei_company').update({
        next_invoice_number: company.next_invoice_number + 1
      }).eq('id', company.id);

      // Générer le PDF
      const pdfBuffer = await generateInvoicePdf(invoice, company, client, state.items.map(item => ({
        ...item,
        total_ht: item.quantity * item.unit_price_ht,
        total_tva: item.quantity * item.unit_price_ht * item.tva_rate / 100,
        total_ttc: item.quantity * item.unit_price_ht * (1 + item.tva_rate / 100),
        unit: 'unité'
      })));

      // Upload vers Supabase Storage
      const storagePath = `factures/${dayjs().year()}/${invoiceNumber}.pdf`;
      await supabase.storage.from('ei-documents').upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf'
      });

      // Mettre à jour le chemin PDF
      await supabase.from('ei_invoices').update({ pdf_storage_path: storagePath }).eq('id', invoice.id);

      // Envoyer le PDF via Telegram
      bot.sendDocument(chatId, pdfBuffer, {
        caption: `📄 *Facture ${invoiceNumber}*\n\n` +
          `Client: ${client.company_name || client.first_name + ' ' + client.last_name}\n` +
          `Total TTC: ${totalTtc.toFixed(2)} €\n` +
          `Statut: Brouillon`,
      }, {
        filename: `${invoiceNumber}.pdf`,
        contentType: 'application/pdf'
      });

      // Nettoyage
      delete invoiceState[chatId];

    } catch (err) {
      console.error('[Telegram] Invoice error:', err);
      bot.sendMessage(chatId, `❌ Erreur: ${err.message}`);
    }
  });

  // ============================================
  // Réception de documents (photos/PDF)
  // ============================================
  bot.on('photo', async (msg) => {
    console.log('[Telegram] Received photo from:', msg.from.id);
    if (!isOwner(msg)) return;
    await handleDocument(msg, 'photo');
  });

  bot.on('document', async (msg) => {
    console.log('[Telegram] Received document from:', msg.from.id, 'file:', msg.document?.file_name);
    if (!isOwner(msg)) return;
    if (msg.document) {
      await handleDocument(msg, 'document');
    }
  });

  const categoryLabels = {
    facture_emise: '📄 Facture émise',
    facture_recue: '📥 Facture reçue',
    devis: '📋 Devis',
    releve_bancaire: '🏦 Relevé bancaire',
    fiscal: '🏛️ Document fiscal',
    social_urssaf: '🏥 URSSAF/Social',
    assurance: '🛡️ Assurance',
    contrat: '📝 Contrat',
    administratif: '📁 Administratif',
    vehicule: '🚗 Véhicule',
    ecommerce: '🛒 E-commerce',
    autre: '📎 Autre'
  };

  async function handleDocument(msg, type) {
    const chatId = msg.chat.id;
    console.log(`[Telegram] handleDocument: type=${type}, chat=${chatId}`);
    await bot.sendMessage(chatId, '🔍 Analyse du document en cours...');

    try {
      let fileId, fileUniqueId, fileName, mimeType;

      if (type === 'photo') {
        const photo = msg.photo[msg.photo.length - 1];
        fileId = photo.file_id;
        fileUniqueId = photo.file_unique_id; // Stable across re-sends
        fileName = `photo_${Date.now()}.jpg`;
        mimeType = 'image/jpeg';
      } else {
        fileId = msg.document.file_id;
        fileUniqueId = msg.document.file_unique_id;
        fileName = msg.document.file_name || `doc_${Date.now()}`;
        mimeType = msg.document.mime_type || 'application/octet-stream';
      }

      // --- Anti-doublon Layer 0: Telegram file_unique_id (le plus fiable) ---
      // file_unique_id est stable même si la photo est recompressée par Telegram
      if (fileUniqueId) {
        const { data: uidDups } = await supabase
          .from('ei_documents')
          .select('id, title, category, extracted_date, created_at')
          .eq('telegram_file_unique_id', fileUniqueId)
          .limit(1);

        if (uidDups && uidDups.length > 0) {
          const dup = uidDups[0];
          const dupDate = dup.extracted_date || dayjs(dup.created_at).format('YYYY-MM-DD');
          await safeSend(chatId,
            `⚠️ *Doublon détecté !*\n\n` +
            `Ce document existe déjà :\n` +
            `📝 ${dup.title}\n` +
            `📂 ${categoryLabels[dup.category] || dup.category}\n` +
            `📅 ${dupDate}\n\n` +
            `Le document n'a pas été ajouté une 2ème fois.`
          );
          return;
        }
      }

      // Télécharger le fichier
      console.log(`[Telegram] Downloading file: ${fileName} (${mimeType}), uniqueId: ${fileUniqueId}`);
      const fileLink = await bot.getFileLink(fileId);
      const response = await fetch(fileLink);
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString('base64');
      console.log(`[Telegram] Downloaded ${buffer.length} bytes`);

      // --- Anti-doublon Layer 1: hash SHA-256 exact ---
      const crypto = require('crypto');
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

      const { data: hashDups } = await supabase
        .from('ei_documents')
        .select('id, title, category, extracted_date, created_at')
        .eq('file_hash', fileHash)
        .limit(1);

      if (hashDups && hashDups.length > 0) {
        const dup = hashDups[0];
        const dupDate = dup.extracted_date || dayjs(dup.created_at).format('YYYY-MM-DD');
        await safeSend(chatId,
          `⚠️ *Doublon détecté !*\n\n` +
          `Ce document existe déjà (hash identique) :\n` +
          `📝 ${dup.title}\n` +
          `📂 ${categoryLabels[dup.category] || dup.category}\n` +
          `📅 ${dupDate}\n\n` +
          `Le document n'a pas été ajouté une 2ème fois.`
        );
        return;
      }

      console.log(`[Telegram] No duplicate found (hash: ${fileHash.substring(0, 12)}..., uid: ${fileUniqueId}), classifying...`);

      // Classifier via IA (supporte images ET PDF natifs)
      let classification;
      if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
        classification = await classifyDocument(base64, mimeType, fileName);
      } else {
        classification = await classifyDocument(
          `Fichier: ${fileName}, Type: ${mimeType}, Taille: ${buffer.length} bytes`,
          'text/plain',
          fileName
        );
      }
      console.log(`[Telegram] Classification result:`, JSON.stringify({ category: classification.category, confidence: classification.confidence, error: classification.error }));

      // Check 3: post-classification - même date + même montant + même émetteur = doublon sémantique
      if (classification.date && classification.amount && classification.vendor) {
        let metaQuery = supabase
          .from('ei_documents')
          .select('id, title, category, extracted_date, created_at')
          .eq('extracted_date', classification.date)
          .eq('extracted_amount', classification.amount);

        // vendor matching flexible (ilike)
        metaQuery = metaQuery.ilike('extracted_vendor', `%${classification.vendor.substring(0, 15)}%`);

        const { data: metaDups } = await metaQuery.limit(1);

        if (metaDups && metaDups.length > 0) {
          const dup = metaDups[0];
          await safeSend(chatId,
            `⚠️ *Doublon probable détecté !*\n\n` +
            `Un document similaire existe déjà :\n` +
            `📝 ${dup.title}\n` +
            `📂 ${categoryLabels[dup.category] || dup.category}\n` +
            `📅 ${dup.extracted_date}\n` +
            `💰 ${classification.amount} EUR\n\n` +
            `Le document n'a pas été ajouté. Si c'est un document différent, renvoie-le et tape /forcer.`
          );
          return;
        }
      }

      // Sauvegarder dans Supabase Storage
      const year = classification.date ? new Date(classification.date).getFullYear() : new Date().getFullYear();
      const storagePath = `${classification.category}/${year}/${Date.now()}_${fileName}`;

      console.log(`[Telegram] Uploading to storage: ${storagePath} (${buffer.length} bytes)`);
      const { error: uploadErr } = await supabase.storage
        .from('ei-documents')
        .upload(storagePath, buffer, { contentType: mimeType });

      if (uploadErr) {
        console.error('[Telegram] Storage upload error:', JSON.stringify(uploadErr));
        throw new Error(`Storage upload: ${uploadErr.message || JSON.stringify(uploadErr)}`);
      }
      console.log('[Telegram] Storage upload OK');

      // Sauvegarder les métadonnées
      const insertData = {
        category: classification.category || 'autre',
        title: classification.title || fileName,
        description: classification.description || null,
        extracted_date: classification.date || null,
        extracted_amount: classification.amount || null,
        extracted_vendor: classification.vendor || null,
        extracted_reference: classification.reference || null,
        original_filename: fileName,
        file_type: mimeType.split('/')[1] || 'unknown',
        file_size: buffer.length,
        storage_path: storagePath,
        year: year,
        month: classification.date ? new Date(classification.date).getMonth() + 1 : new Date().getMonth() + 1,
        source: 'telegram',
        telegram_file_id: fileId,
        telegram_file_unique_id: fileUniqueId || null,
        ai_classification_confidence: classification.confidence || 0,
        ocr_text: classification.ocr_text || null,
        file_hash: fileHash
      };
      console.log('[Telegram] Inserting document:', JSON.stringify({ category: insertData.category, title: insertData.title, date: insertData.extracted_date }));

      const { data: doc, error: dbErr } = await supabase.from('ei_documents').insert(insertData).select().single();

      if (dbErr) {
        console.error('[Telegram] DB insert error:', JSON.stringify(dbErr));
        throw new Error(`DB insert: ${dbErr.message || JSON.stringify(dbErr)}`);
      }
      console.log(`[Telegram] Document saved: ${doc.id}`);

      // Escape markdown special chars in AI-generated strings
      const esc = (s) => s ? String(s).replace(/([*_`\[\]])/g, '\\$1') : '';

      const expenseLabels = {
        carburant: '⛽ Carburant', entretien_vehicule: '🔧 Entretien véhicule', assurance: '🛡️ Assurance',
        telephone: '📱 Téléphone', internet: '🌐 Internet', logiciel: '💻 Logiciel',
        achat_marchandise: '📦 Achat marchandise', frais_port: '📬 Frais port', comptabilite: '🧮 Comptabilité',
        formation: '🎓 Formation', cotisations_sociales: '🏥 Cotisations', impots_taxes: '🏛️ Impôts/Taxes',
        fournitures: '🖊️ Fournitures', deplacement: '🚗 Déplacement', peage: '🛣️ Péage', parking: '🅿️ Parking'
      };

      // Si confiance haute → confirmation simple
      if (!classification.needs_review) {
        await safeSend(chatId,
          `✅ *Document classifié et archivé*\n\n` +
          `📂 ${categoryLabels[classification.category] || classification.category}\n` +
          `📝 ${esc(classification.title)}\n` +
          `${classification.expense_type ? '🏷️ Type: ' + (expenseLabels[classification.expense_type] || classification.expense_type) + '\n' : ''}` +
          `${classification.date ? '📅 Date: ' + classification.date + '\n' : ''}` +
          `${classification.amount ? '💰 Montant: ' + classification.amount + ' €\n' : ''}` +
          `${classification.vendor ? '🏢 Émetteur: ' + esc(classification.vendor) + '\n' : ''}` +
          `${classification.reference ? '🔢 Réf: ' + esc(classification.reference) + '\n' : ''}` +
          `📊 Confiance: ${Math.round((classification.confidence || 0) * 100)}%`
        );
      } else {
        // Confiance basse → demande de confirmation avec boutons
        const suggestions = classification.suggested_categories || [];
        const allCats = [...new Set([classification.category, ...suggestions])].filter(Boolean);

        const keyboard = allCats.map(cat => [{
          text: `${categoryLabels[cat] || cat}`,
          callback_data: `doc_reclass_${doc.id}_${cat}`
        }]);

        // Ajouter les catégories les plus courantes si pas déjà dedans
        const commonCats = ['facture_recue', 'facture_emise', 'fiscal', 'administratif', 'autre'];
        const extraCats = commonCats.filter(c => !allCats.includes(c));
        for (let i = 0; i < extraCats.length && keyboard.length < 6; i++) {
          keyboard.push([{
            text: categoryLabels[extraCats[i]] || extraCats[i],
            callback_data: `doc_reclass_${doc.id}_${extraCats[i]}`
          }]);
        }

        keyboard.push([{ text: '✅ Garder: ' + (categoryLabels[classification.category] || classification.category), callback_data: `doc_confirm_${doc.id}` }]);

        await safeSend(chatId,
          `⚠️ *Document classifié avec doute*\n\n` +
          `📂 Suggestion: ${categoryLabels[classification.category] || classification.category}\n` +
          `📝 ${esc(classification.title)}\n` +
          `${classification.date ? '📅 Date: ' + classification.date : ''}\n` +
          `${classification.amount ? '💰 Montant: ' + classification.amount + ' €' : ''}\n` +
          `${classification.vendor ? '🏢 Émetteur: ' + esc(classification.vendor) : ''}\n` +
          `📊 Confiance: ${Math.round((classification.confidence || 0) * 100)}%\n` +
          `${classification.doubt_reason ? '\n❓ ' + esc(classification.doubt_reason) : ''}\n\n` +
          `👇 *Choisis la bonne catégorie:*`,
          { reply_markup: { inline_keyboard: keyboard } }
        );
      }

    } catch (err) {
      console.error('[Telegram] Document error:', err);
      bot.sendMessage(chatId, `❌ Erreur lors du traitement: ${String(err.message).substring(0, 200)}`).catch(() => {});
    }
  }

  // ============================================
  // Callbacks: reclassification de document
  // ============================================
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Reclassifier un document
    if (data.startsWith('doc_reclass_')) {
      const parts = data.replace('doc_reclass_', '').split('_');
      const docId = parts[0];
      const newCategory = parts.slice(1).join('_');

      const { error } = await supabase.from('ei_documents')
        .update({ category: newCategory, ai_classification_confidence: 1.0 })
        .eq('id', docId);

      bot.answerCallbackQuery(query.id, { text: 'Catégorie mise à jour !' });

      if (!error) {
        bot.editMessageText(
          `✅ *Document reclassifié*\n\n📂 ${categoryLabels[newCategory] || newCategory}\n\n_Classification corrigée manuellement_`,
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
        );
      }
      return;
    }

    // Confirmer la classification IA
    if (data.startsWith('doc_confirm_')) {
      const docId = data.replace('doc_confirm_', '');

      await supabase.from('ei_documents')
        .update({ ai_classification_confidence: 1.0 })
        .eq('id', docId);

      bot.answerCallbackQuery(query.id, { text: 'Classification confirmée !' });
      bot.editMessageText(
        query.message.text.replace('⚠️ *Document classifié avec doute*', '✅ *Document confirmé et archivé*').replace('👇 *Choisis la bonne catégorie:*', '_Classification confirmée_'),
        { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
      );
      return;
    }

    // Sélection client pour facture
    if (data.startsWith('invoice_client_')) {
      const clientId = data.replace('invoice_client_', '');
      invoiceState[chatId] = { clientId, step: 'activity' };
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, '🏷️ Activité de la facture ?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚗 VTC', callback_data: 'invoice_act_vtc' }],
            [{ text: '🛒 E-commerce', callback_data: 'invoice_act_ecommerce' }],
            [{ text: '💻 Services numériques', callback_data: 'invoice_act_services_numeriques' }],
          ]
        }
      });
      return;
    }

    if (data.startsWith('invoice_act_')) {
      const activity = data.replace('invoice_act_', '');
      if (invoiceState[chatId]) {
        invoiceState[chatId].activity = activity;
        invoiceState[chatId].step = 'items';
        invoiceState[chatId].items = [];
      }
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId,
        `📝 *Ajoutez les lignes de facture*\n\nFormat:\n\`description | quantité | prix_unitaire_ht\`\n\nExemple:\n\`Course VTC Paris-Orly | 1 | 65.00\`\n\nEnvoyez chaque ligne séparément.\nTapez /valider quand terminé.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
  });

  // ============================================
  // /docs - Rechercher des documents
  // ============================================
  bot.onText(/\/docs (.+)/, async (msg, match) => {
    if (!isOwner(msg)) return;
    const query = match[1].trim();

    const { data: docs } = await supabase
      .from('ei_documents')
      .select('*')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,extracted_vendor.ilike.%${query}%,category.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!docs || docs.length === 0) {
      return bot.sendMessage(msg.chat.id, `🔍 Aucun document trouvé pour "${query}"`);
    }

    const lines = docs.map((d, i) =>
      `${i + 1}. *${d.title}*\n   📂 ${d.category} | 📅 ${d.extracted_date || d.year} | ${d.extracted_amount ? d.extracted_amount + ' €' : ''}`
    ).join('\n\n');

    bot.sendMessage(msg.chat.id, `🔍 *Résultats pour "${query}"*\n\n${lines}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/docs$/, (msg) => {
    if (!isOwner(msg)) return;
    bot.sendMessage(msg.chat.id, '🔍 Usage: `/docs mot-clé`\nExemple: `/docs uber` ou `/docs assurance`', { parse_mode: 'Markdown' });
  });

  // ============================================
  // /veille - Veille réglementaire
  // ============================================
  bot.onText(/\/veille/, async (msg) => {
    if (!isOwner(msg)) return;
    bot.sendMessage(msg.chat.id, '⚖️ _Analyse des nouvelles réglementations en cours..._', { parse_mode: 'Markdown' });

    try {
      const result = await getRegulatory().checkRegulatoryUpdates();

      if (result.error) {
        return bot.sendMessage(msg.chat.id, `❌ Erreur: ${result.error}`);
      }

      if (result.newCount === 0 && result.total === 0) {
        return bot.sendMessage(msg.chat.id, '✅ *Veille réglementaire*\n\nAucune nouvelle alerte détectée. Tout est à jour !', { parse_mode: 'Markdown' });
      }

      // Show summary of existing alerts
      const { data: pending } = await supabase
        .from('ei_regulatory_watch')
        .select('*')
        .in('status', ['new', 'read'])
        .order('severity')
        .limit(10);

      if (!pending || pending.length === 0) {
        return bot.sendMessage(msg.chat.id, `✅ *Veille réglementaire*\n\n${result.newCount} nouvelle(s) alerte(s) analysée(s). Aucune action requise.`, { parse_mode: 'Markdown' });
      }

      const sevIcons = { critical: '🔴', warning: '🟡', info: '🟢' };
      const lines = pending.map(a =>
        `${sevIcons[a.severity] || '🟢'} *${a.title}*\n   ${a.action_required || a.description?.substring(0, 80) || ''}`
      ).join('\n\n');

      bot.sendMessage(msg.chat.id,
        `⚖️ *Veille réglementaire*\n\n` +
        `${result.newCount > 0 ? `🆕 ${result.newCount} nouvelle(s) alerte(s)\n\n` : ''}` +
        `📋 *Alertes en cours (${pending.length}):*\n\n${lines}\n\n` +
        `🌐 Détails complets sur le dashboard`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      bot.sendMessage(msg.chat.id, `❌ Erreur veille: ${err.message}`);
    }
  });

  console.log('[Telegram] Bot ready, owner ID:', OWNER_ID);
}

module.exports = { initBot, getBot, getOwnerId };
