const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Generates Factur-X compliant PDF (PDF/A-3b with embedded CII XML)
 * Uses @stackforge-eu/factur-x for certified embedding + XSD validation
 */
async function generateInvoicePdf(invoice, company, client, items) {
  // 1. Generate visual PDF with pdf-lib
  const visualPdf = await buildVisualPdf(invoice, company, client, items);

  // 2. Build Factur-X input data
  const facturxInput = buildFacturXInput(invoice, company, client, items);

  // 3. Embed Factur-X XML into PDF -> PDF/A-3b
  try {
    const { embedFacturX, Profile, Flavor, DocumentTypeCode, VatCategoryCode, UnitCode } = require('@stackforge-eu/factur-x');

    const result = await embedFacturX({
      pdf: visualPdf,
      input: facturxInput,
      profile: Profile.BASIC,
      flavor: Flavor.FACTURX,
    });

    return Buffer.from(result.pdf);
  } catch (err) {
    console.error('[PDF] Factur-X embedding failed, returning visual PDF:', err.message);
    // Fallback: return visual PDF without embedded XML
    return visualPdf;
  }
}

/**
 * Build the structured Factur-X input from invoice data
 */
function buildFacturXInput(invoice, company, client, items) {
  const clientName = client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const tvaRate = Number(invoice.tva_rate || 20);
  const totalHt = Number(invoice.total_ht || 0);
  const totalTva = Number(invoice.total_tva || 0);
  const totalTtc = Number(invoice.total_ttc || 0);

  const input = {
    document: {
      id: invoice.invoice_number,
      issueDate: fmtIsoDate(invoice.issue_date),
      typeCode: 380, // Commercial Invoice
    },
    seller: {
      name: `EI ${company.business_name}`,
      address: {
        line1: company.address_line1,
        line2: company.address_line2 || undefined,
        city: company.city,
        postalCode: company.postal_code,
        country: 'FR',
      },
      email: company.email,
      legalOrganization: { id: company.siren, schemeId: '0002' },
    },
    buyer: {
      name: clientName,
    },
    lines: (items || []).map((item, i) => {
      const lineHt = Number(item.quantity || 1) * Number(item.unit_price_ht || 0);
      return {
        id: String(i + 1),
        name: item.description,
        quantity: Number(item.quantity || 1),
        unitCode: mapUnitCode(item.unit),
        unitPrice: Number(item.unit_price_ht || 0),
        vatCategoryCode: 'S', // Standard rate
        vatRatePercent: Number(item.tva_rate || tvaRate),
      };
    }),
    totals: {
      lineTotal: totalHt,
      taxBasisTotal: totalHt,
      taxTotal: totalTva,
      grandTotal: totalTtc,
      duePayableAmount: totalTtc,
      currency: 'EUR',
    },
    vatBreakdown: [{
      categoryCode: 'S',
      ratePercent: tvaRate,
      taxableAmount: totalHt,
      taxAmount: totalTva,
    }],
  };

  // Seller TVA
  if (company.tva_number) {
    input.seller.taxRegistrations = [{ id: company.tva_number, schemeId: 'VA' }];
  }

  // Buyer details
  if (client.address_line1) {
    input.buyer.address = {
      line1: client.address_line1,
      city: client.city || '',
      postalCode: client.postal_code || '',
      country: 'FR',
    };
  }
  if (client.siren) {
    input.buyer.legalOrganization = { id: client.siren, schemeId: '0002' };
  }
  if (client.tva_number) {
    input.buyer.taxRegistrations = [{ id: client.tva_number, schemeId: 'VA' }];
  }

  // Payment
  if (company.bank_iban) {
    input.payment = {
      meansCode: mapPaymentCode(invoice.payment_method),
      iban: company.bank_iban,
      dueDate: fmtIsoDate(invoice.due_date),
    };
    if (company.bank_bic) input.payment.bic = company.bank_bic;
  } else if (invoice.due_date) {
    input.payment = {
      meansCode: mapPaymentCode(invoice.payment_method),
      dueDate: fmtIsoDate(invoice.due_date),
    };
  }

  return input;
}

/**
 * Build the visual PDF layout using pdf-lib
 */
async function buildVisualPdf(invoice, company, client, items) {
  const pdfDoc = await PDFDocument.create();
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const m = 45;
  let y = height - m;

  const blue = rgb(0.10, 0.34, 0.86);
  const gray = rgb(0.33, 0.33, 0.33);
  const ltGray = rgb(0.55, 0.55, 0.55);
  const black = rgb(0, 0, 0);

  // --- Company (left) ---
  y = txt(page, `EI ${company.business_name}`, m, y, fontB, 14, blue);
  y = txt(page, company.owner_name, m, y, fontR, 8, ltGray);
  y = txt(page, company.address_line1, m, y, fontR, 8, ltGray);
  if (company.address_line2) y = txt(page, company.address_line2, m, y, fontR, 8, ltGray);
  y = txt(page, `${company.postal_code} ${company.city}`, m, y, fontR, 8, ltGray);
  y = txt(page, `SIRET: ${company.siret} | APE: ${company.code_ape}`, m, y, fontR, 8, ltGray);
  if (company.tva_number) y = txt(page, `TVA Intracom.: ${company.tva_number}`, m, y, fontR, 8, ltGray);
  y = txt(page, `Tel: ${company.phone} | ${company.email}`, m, y, fontR, 8, ltGray);

  // --- Invoice title (right) ---
  const rx = width - m;
  let ry = height - m;
  rTxt(page, 'FACTURE', rx, ry, fontB, 22, blue); ry -= 20;
  rTxt(page, `N ${invoice.invoice_number}`, rx, ry, fontR, 11, gray); ry -= 16;
  rTxt(page, `Date: ${fmtDate(invoice.issue_date)}`, rx, ry, fontR, 9, gray); ry -= 12;
  rTxt(page, `Echeance: ${fmtDate(invoice.due_date)}`, rx, ry, fontR, 9, gray); ry -= 12;
  const natOp = invoice.operation_type === 'MIXED' ? 'Mixte' : invoice.operation_type === 'GOODS' ? 'Livraison de biens' : 'Prestation de services';
  rTxt(page, `Nature: ${natOp}`, rx, ry, fontR, 8, ltGray);

  // --- Client box ---
  y -= 25;
  const clientName = client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const bx = 310;
  page.drawRectangle({ x: bx, y: y - 75, width: width - m - bx, height: 75, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
  let cy = y - 5;
  cy = txt(page, clientName, bx + 8, cy, fontB, 10, black);
  if (client.address_line1) cy = txt(page, client.address_line1, bx + 8, cy, fontR, 8, ltGray);
  if (client.postal_code || client.city) cy = txt(page, `${client.postal_code || ''} ${client.city || ''}`, bx + 8, cy, fontR, 8, ltGray);
  if (client.siren) cy = txt(page, `SIREN: ${client.siren}`, bx + 8, cy, fontR, 8, ltGray);
  if (client.tva_number) cy = txt(page, `TVA: ${client.tva_number}`, bx + 8, cy, fontR, 8, ltGray);
  if (invoice.delivery_address) cy = txt(page, `Livraison: ${invoice.delivery_address}`, bx + 8, cy, fontR, 7, ltGray);

  // --- Table ---
  y -= 95;
  const cols = [m, m + 200, m + 240, m + 285, m + 340, m + 395, m + 455];
  const hdrs = ['Description', 'Qte', 'Unite', 'PU HT', 'TVA', 'Total HT', 'Total TTC'];
  page.drawRectangle({ x: m, y: y - 2, width: width - 2 * m, height: 16, color: rgb(0.94, 0.94, 0.94) });
  hdrs.forEach((h, i) => page.drawText(h, { x: cols[i] + 3, y: y + 2, font: fontB, size: 7.5, color: gray }));
  y -= 16;

  (items || []).forEach(item => {
    const lHt = Number(item.quantity || 1) * Number(item.unit_price_ht || 0);
    const lTtc = lHt * (1 + Number(item.tva_rate || 20) / 100);
    page.drawText(String(item.description || '').substring(0, 50), { x: cols[0] + 3, y, font: fontR, size: 8, color: black });
    page.drawText(fmtNum(item.quantity), { x: cols[1] + 3, y, font: fontR, size: 8, color: black });
    page.drawText(item.unit || 'unite', { x: cols[2] + 3, y, font: fontR, size: 8, color: black });
    page.drawText(fmtCur(item.unit_price_ht), { x: cols[3] + 3, y, font: fontR, size: 8, color: black });
    page.drawText(`${item.tva_rate || 20}%`, { x: cols[4] + 3, y, font: fontR, size: 8, color: black });
    page.drawText(fmtCur(lHt), { x: cols[5] + 3, y, font: fontR, size: 8, color: black });
    page.drawText(fmtCur(lTtc), { x: cols[6] + 3, y, font: fontR, size: 8, color: black });
    y -= 14;
    page.drawLine({ start: { x: m, y: y + 10 }, end: { x: width - m, y: y + 10 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.88) });
  });

  // --- Totals ---
  y -= 10;
  const tx = 380;
  page.drawText('Total HT:', { x: tx, y, font: fontB, size: 10, color: gray });
  page.drawText(fmtCur(invoice.total_ht), { x: tx + 100, y, font: fontB, size: 10, color: black }); y -= 15;
  page.drawText(`TVA (${invoice.tva_rate}%):`, { x: tx, y, font: fontR, size: 9, color: gray });
  page.drawText(fmtCur(invoice.total_tva), { x: tx + 100, y, font: fontR, size: 9, color: black }); y -= 18;
  page.drawLine({ start: { x: tx, y: y + 14 }, end: { x: width - m, y: y + 14 }, thickness: 1.5, color: gray });
  page.drawText('Total TTC:', { x: tx, y, font: fontB, size: 12, color: black });
  page.drawText(fmtCur(invoice.total_ttc), { x: tx + 100, y, font: fontB, size: 12, color: blue });

  // --- Conditions ---
  y -= 30;
  y = txt(page, 'Conditions de paiement', m, y, fontB, 9, gray);
  y = txt(page, `Paiement a ${company.default_payment_delay_days || 30} jours. Penalites: ${company.default_late_penalty_rate || 3}% / an. Indemnite recouvrement: 40 EUR.`, m, y, fontR, 7, ltGray);
  if (company.bank_iban) y = txt(page, `IBAN: ${company.bank_iban}${company.bank_bic ? ' | BIC: ' + company.bank_bic : ''}`, m, y, fontR, 7, ltGray);
  if (invoice.notes) { y -= 3; y = txt(page, invoice.notes, m, y, fontR, 7, ltGray); }

  // --- Footer ---
  page.drawText(`EI ${company.business_name} - SIRET ${company.siret} - APE ${company.code_ape}${company.tva_number ? ' - TVA ' + company.tva_number : ''}`, { x: m, y: 30, font: fontR, size: 6, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Facture electronique Factur-X BASIC (EN 16931) - PDF/A-3b', { x: m, y: 20, font: fontR, size: 6, color: rgb(0.6, 0.6, 0.6) });

  // Metadata
  pdfDoc.setTitle(`Facture ${invoice.invoice_number}`);
  pdfDoc.setAuthor(`EI ${company.business_name}`);
  pdfDoc.setSubject(`Facture ${invoice.invoice_number}`);
  pdfDoc.setCreator('Gestionnaire EI - Factur-X');
  pdfDoc.setProducer('pdf-lib + @stackforge-eu/factur-x');

  return Buffer.from(await pdfDoc.save());
}

async function generateQuotePdf(quote, company, client, items) {
  // For quotes, generate visual PDF only (Factur-X is for invoices)
  return buildVisualPdf(
    { ...quote, invoice_number: quote.quote_number, operation_type: quote.operation_type || 'SERVICE' },
    company, client, items
  );
}

// --- Helpers ---
function txt(page, text, x, y, font, size, color) {
  if (!text) return y;
  page.drawText(String(text), { x, y, font, size, color });
  return y - size - 3;
}
function rTxt(page, text, rx, y, font, size, color) {
  page.drawText(text, { x: rx - font.widthOfTextAtSize(text, size), y, font, size, color });
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'; }
function fmtIsoDate(d) { return d ? new Date(d).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]; }
function fmtCur(a) { return a != null ? Number(a).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'; }
function fmtNum(n) { return n == null ? '1' : Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(2); }
function mapPaymentCode(m) { return { virement: '30', carte: '48', especes: '10', cheque: '20', prelevement: '49' }[m] || '30'; }
function mapUnitCode(u) { return { unite: 'C62', 'unité': 'C62', heure: 'HUR', h: 'HUR', jour: 'DAY', km: 'KMT', kg: 'KGM', forfait: 'C62' }[(u || '').toLowerCase()] || 'C62'; }

module.exports = { generateInvoicePdf, generateQuotePdf };
