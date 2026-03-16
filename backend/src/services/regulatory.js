const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabase');
const { getBot, getOwnerId } = require('./telegram');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Regulatory watch: uses AI to check for new French regulations
 * affecting EI (facturation, TVA, social, fiscal)
 * Called periodically (e.g. weekly via cron or Telegram command)
 */
async function checkRegulatoryUpdates() {
  const currentDate = new Date().toISOString().split('T')[0];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `Tu es un veilleur juridique et fiscal specialise dans les obligations des Entreprises Individuelles (EI) en France.

Date d'aujourd'hui: ${currentDate}

L'entreprise est une EI avec 3 activites:
1. Chauffeur VTC (activite principale, APE 4932Z)
2. E-commerce (vente a distance produits bien-etre)
3. Services numeriques (creation sites, design)

L'EI est au regime reel (pas micro), assujettie TVA, pas de salaries.

Retourne UNIQUEMENT un JSON valide (sans markdown) avec un tableau d'alertes reglementaires:
{
  "alerts": [
    {
      "title": "Titre court de l'alerte",
      "description": "Description detaillee de la nouvelle regle/loi",
      "category": "facturation|tva|social|fiscal|juridique|autre",
      "severity": "info|warning|critical",
      "effective_date": "YYYY-MM-DD ou null",
      "action_required": "Ce que l'EI doit faire concretement",
      "source": "Source de l'info (loi, decret, BOFiP, etc.)"
    }
  ]
}

Concentre-toi sur:
- Facturation electronique (Factur-X, PDP, PPF) - echeances et obligations
- TVA (seuils, declarations, reforme)
- Cotisations sociales URSSAF (changements de taux, nouvelles declarations)
- Fiscalite (IR, CFE, nouvelles deductions/obligations)
- Obligations specifiques VTC (carte pro, assurance, registre)
- E-commerce (RGPD, droit de retractation, nouvelles obligations)

Ne retourne que les changements effectifs ou a venir dans les 12 prochains mois.
Si rien de nouveau, retourne {"alerts": []}.`,
      messages: [{ role: 'user', content: `Quelles sont les nouvelles obligations reglementaires ou changements a venir pour une EI francaise en ${currentDate.substring(0, 4)} ? Inclus les echeances de facturation electronique.` }]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { alerts: [], error: 'No JSON in response' };

    const result = JSON.parse(jsonMatch[0]);
    const alerts = result.alerts || [];

    // Save new alerts to DB (skip duplicates by title)
    let newCount = 0;
    for (const alert of alerts) {
      const { data: existing } = await supabase
        .from('ei_regulatory_watch')
        .select('id')
        .eq('title', alert.title)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('ei_regulatory_watch').insert({
          title: alert.title,
          description: alert.description,
          source_url: alert.source,
          category: alert.category || 'autre',
          severity: alert.severity || 'info',
          effective_date: alert.effective_date,
          action_required: alert.action_required,
          notified: false
        });
        newCount++;
      }
    }

    // Notify via Telegram for new critical/warning alerts
    await notifyNewAlerts();

    return { alerts, newCount, total: alerts.length };
  } catch (err) {
    console.error('[Regulatory] Check error:', err.message);
    return { alerts: [], error: err.message };
  }
}

/**
 * Send Telegram notifications for unnotified alerts
 */
async function notifyNewAlerts() {
  const { data: alerts } = await supabase
    .from('ei_regulatory_watch')
    .select('*')
    .eq('notified', false)
    .in('severity', ['warning', 'critical'])
    .order('created_at');

  if (!alerts || alerts.length === 0) return;

  const bot = getBot();
  const ownerId = getOwnerId();
  if (!bot || !ownerId) return;

  const severityIcons = { critical: '🔴', warning: '🟡', info: '🟢' };
  const catIcons = { facturation: '📄', tva: '🧾', social: '🏥', fiscal: '🏛️', juridique: '⚖️', autre: '📋' };

  for (const alert of alerts) {
    const icon = severityIcons[alert.severity] || '🟢';
    const catIcon = catIcons[alert.category] || '📋';

    await bot.sendMessage(ownerId,
      `${icon} *VEILLE REGLEMENTAIRE*\n\n` +
      `${catIcon} *${alert.title}*\n\n` +
      `${alert.description}\n\n` +
      `${alert.effective_date ? '📅 Date d\'effet: ' + new Date(alert.effective_date).toLocaleDateString('fr-FR') + '\n' : ''}` +
      `${alert.action_required ? '\n✅ *A faire:* ' + alert.action_required : ''}` +
      `${alert.source_url ? '\n\n🔗 Source: ' + alert.source_url : ''}`,
      { parse_mode: 'Markdown' }
    );

    await supabase.from('ei_regulatory_watch')
      .update({ notified: true })
      .eq('id', alert.id);
  }
}

module.exports = { checkRegulatoryUpdates, notifyNewAlerts };
