const { PDFDocument, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, PDFRef, StandardFonts, rgb } = require('pdf-lib');
const { generateFacturXml, FACTURX_PROFILE } = require('./facturx');

/**
 * Generate a Factur-X compliant PDF (PDF/A-3 with embedded CII XML)
 */
async function generateInvoicePdf(invoice, company, client, items) {
  const pdfDoc = await PDFDocument.create();

  // Embed fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Create page
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 45;
  let y = height - margin;

  const blue = rgb(0.10, 0.34, 0.86);
  const gray = rgb(0.33, 0.33, 0.33);
  const lightGray = rgb(0.55, 0.55, 0.55);
  const black = rgb(0, 0, 0);

  // --- HEADER: Company info (left) ---
  const sellerName = `EI ${company.business_name}`;
  y = drawText(page, sellerName, margin, y, fontBold, 14, blue);
  y = drawText(page, company.owner_name, margin, y, fontRegular, 8, lightGray);
  y = drawText(page, company.address_line1, margin, y, fontRegular, 8, lightGray);
  if (company.address_line2) y = drawText(page, company.address_line2, margin, y, fontRegular, 8, lightGray);
  y = drawText(page, `${company.postal_code} ${company.city}`, margin, y, fontRegular, 8, lightGray);
  y = drawText(page, `SIRET: ${company.siret} | APE: ${company.code_ape}`, margin, y, fontRegular, 8, lightGray);
  if (company.tva_number) y = drawText(page, `TVA Intracom.: ${company.tva_number}`, margin, y, fontRegular, 8, lightGray);
  y = drawText(page, `Tel: ${company.phone} | ${company.email}`, margin, y, fontRegular, 8, lightGray);

  // --- HEADER: Invoice title (right) ---
  const rightX = width - margin;
  let ry = height - margin;
  page.drawText('FACTURE', { x: rightX - fontBold.widthOfTextAtSize('FACTURE', 22), y: ry, font: fontBold, size: 22, color: blue });
  ry -= 20;
  const invNum = `N ${invoice.invoice_number}`;
  page.drawText(invNum, { x: rightX - fontRegular.widthOfTextAtSize(invNum, 11), y: ry, font: fontRegular, size: 11, color: gray });
  ry -= 16;
  const dateStr = `Date: ${fmtDate(invoice.issue_date)}`;
  page.drawText(dateStr, { x: rightX - fontRegular.widthOfTextAtSize(dateStr, 9), y: ry, font: fontRegular, size: 9, color: gray });
  ry -= 12;
  const dueStr = `Echeance: ${fmtDate(invoice.due_date)}`;
  page.drawText(dueStr, { x: rightX - fontRegular.widthOfTextAtSize(dueStr, 9), y: ry, font: fontRegular, size: 9, color: gray });

  // Nature of operation (new 2026)
  ry -= 12;
  const natOp = `Nature: ${invoice.operation_type === 'MIXED' ? 'Mixte' : invoice.operation_type === 'GOODS' ? 'Livraison de biens' : 'Prestation de services'}`;
  page.drawText(natOp, { x: rightX - fontRegular.widthOfTextAtSize(natOp, 8), y: ry, font: fontRegular, size: 8, color: lightGray });

  // --- CLIENT BOX ---
  y -= 25;
  const clientName = client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const boxX = 310;
  const boxW = width - margin - boxX;
  page.drawRectangle({ x: boxX, y: y - 70, width: boxW, height: 70, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
  let cy = y - 5;
  cy = drawText(page, clientName, boxX + 8, cy, fontBold, 10, black);
  if (client.address_line1) cy = drawText(page, client.address_line1, boxX + 8, cy, fontRegular, 8, lightGray);
  if (client.postal_code || client.city) cy = drawText(page, `${client.postal_code || ''} ${client.city || ''}`, boxX + 8, cy, fontRegular, 8, lightGray);
  if (client.siren) cy = drawText(page, `SIREN: ${client.siren}`, boxX + 8, cy, fontRegular, 8, lightGray);
  if (client.tva_number) cy = drawText(page, `TVA: ${client.tva_number}`, boxX + 8, cy, fontRegular, 8, lightGray);

  // Delivery address (new 2026)
  if (invoice.delivery_address) {
    cy = drawText(page, `Livraison: ${invoice.delivery_address}`, boxX + 8, cy, fontRegular, 7, lightGray);
  }

  // --- TABLE HEADER ---
  y -= 90;
  const cols = [margin, margin + 200, margin + 240, margin + 280, margin + 340, margin + 390, margin + 450];
  const headers = ['Description', 'Qte', 'Unite', 'PU HT', 'TVA', 'Total HT', 'Total TTC'];

  // Header background
  page.drawRectangle({ x: margin, y: y - 2, width: width - 2 * margin, height: 16, color: rgb(0.94, 0.94, 0.94) });
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i] + 3, y: y + 2, font: fontBold, size: 8, color: gray });
  });
  y -= 16;

  // --- TABLE ROWS ---
  (items || []).forEach(item => {
    const lineHt = Number(item.quantity || 1) * Number(item.unit_price_ht || 0);
    const lineTtc = lineHt * (1 + Number(item.tva_rate || 20) / 100);

    // Truncate description if too long
    const desc = String(item.description || '').substring(0, 45);
    page.drawText(desc, { x: cols[0] + 3, y: y, font: fontRegular, size: 8, color: black });
    page.drawText(fmtNum(item.quantity), { x: cols[1] + 3, y: y, font: fontRegular, size: 8, color: black });
    page.drawText(item.unit || 'unite', { x: cols[2] + 3, y: y, font: fontRegular, size: 8, color: black });
    page.drawText(fmtCur(item.unit_price_ht), { x: cols[3] + 3, y: y, font: fontRegular, size: 8, color: black });
    page.drawText(`${item.tva_rate || 20}%`, { x: cols[4] + 3, y: y, font: fontRegular, size: 8, color: black });
    page.drawText(fmtCur(lineHt), { x: cols[5] + 3, y: y, font: fontRegular, size: 8, color: black });
    page.drawText(fmtCur(lineTtc), { x: cols[6] + 3, y: y, font: fontRegular, size: 8, color: black });

    // Line separator
    y -= 14;
    page.drawLine({ start: { x: margin, y: y + 10 }, end: { x: width - margin, y: y + 10 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.88) });
  });

  // --- TOTALS ---
  y -= 10;
  const totX = 380;
  page.drawText('Total HT:', { x: totX, y: y, font: fontBold, size: 10, color: gray });
  page.drawText(fmtCur(invoice.total_ht), { x: totX + 100, y: y, font: fontBold, size: 10, color: black });
  y -= 15;
  page.drawText(`TVA (${invoice.tva_rate}%):`, { x: totX, y: y, font: fontRegular, size: 9, color: gray });
  page.drawText(fmtCur(invoice.total_tva), { x: totX + 100, y: y, font: fontRegular, size: 9, color: black });
  y -= 18;
  page.drawLine({ start: { x: totX, y: y + 14 }, end: { x: width - margin, y: y + 14 }, thickness: 1.5, color: gray });
  page.drawText('Total TTC:', { x: totX, y: y, font: fontBold, size: 12, color: black });
  page.drawText(fmtCur(invoice.total_ttc), { x: totX + 100, y: y, font: fontBold, size: 12, color: blue });

  // --- PAYMENT CONDITIONS ---
  y -= 30;
  y = drawText(page, 'Conditions de paiement', margin, y, fontBold, 9, gray);
  y = drawText(page, `Paiement a ${company.default_payment_delay_days || 30} jours.`, margin, y, fontRegular, 7, lightGray);
  y = drawText(page, `Penalites de retard: ${company.default_late_penalty_rate || 3}% par an. Indemnite forfaitaire de recouvrement: 40,00 EUR.`, margin, y, fontRegular, 7, lightGray);
  if (company.bank_iban) {
    y -= 5;
    y = drawText(page, `IBAN: ${company.bank_iban}${company.bank_bic ? ' | BIC: ' + company.bank_bic : ''}`, margin, y, fontRegular, 7, lightGray);
  }
  if (invoice.notes) {
    y -= 3;
    y = drawText(page, invoice.notes, margin, y, fontRegular, 7, lightGray);
  }

  // --- FOOTER ---
  const footerText = `EI ${company.business_name} - SIRET ${company.siret} - APE ${company.code_ape}${company.tva_number ? ' - TVA ' + company.tva_number : ''} | ${company.address_line1}, ${company.postal_code} ${company.city}`;
  page.drawText(footerText, { x: margin, y: 30, font: fontRegular, size: 6, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Facture electronique conforme Factur-X BASIC (EN 16931)', { x: margin, y: 20, font: fontRegular, size: 6, color: rgb(0.6, 0.6, 0.6) });

  // --- FACTUR-X: Generate and embed XML ---
  const xmlContent = generateFacturXml(invoice, company, client, items);
  const xmlBytes = Buffer.from(xmlContent, 'utf-8');

  // Embed XML as associated file (PDF/A-3 compliant attachment)
  await embedFacturXAttachment(pdfDoc, xmlBytes);

  // Set PDF metadata
  pdfDoc.setTitle(`Facture ${invoice.invoice_number}`);
  pdfDoc.setAuthor(`EI ${company.business_name}`);
  pdfDoc.setSubject(`Facture ${invoice.invoice_number} - ${clientName}`);
  pdfDoc.setCreator('Gestionnaire EI - Factur-X BASIC');
  pdfDoc.setProducer('pdf-lib + Factur-X CII');
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Embed the Factur-X XML as a PDF/A-3 compliant file attachment
 */
async function embedFacturXAttachment(pdfDoc, xmlBytes) {
  const context = pdfDoc.context;

  // Create the file stream
  const fileStream = context.stream(xmlBytes, {
    Type: 'EmbeddedFile',
    Subtype: 'text/xml',
    Params: context.obj({
      Size: xmlBytes.length,
      CreationDate: PDFString.of(new Date().toISOString()),
      ModDate: PDFString.of(new Date().toISOString()),
    }),
  });
  const fileStreamRef = context.register(fileStream);

  // Create filespec
  const fileSpec = context.obj({
    Type: 'Filespec',
    F: PDFString.of('factur-x.xml'),
    UF: PDFHexString.fromText('factur-x.xml'),
    Desc: PDFString.of('Factur-X XML invoice data (CII)'),
    AFRelationship: PDFName.of('Data'),
    EF: context.obj({
      F: fileStreamRef,
      UF: fileStreamRef,
    }),
  });
  const fileSpecRef = context.register(fileSpec);

  // Add to catalog
  const catalog = pdfDoc.catalog;

  // Names -> EmbeddedFiles
  const efNameTree = context.obj({
    Names: [PDFHexString.fromText('factur-x.xml'), fileSpecRef],
  });
  const efNameTreeRef = context.register(efNameTree);

  const names = context.obj({ EmbeddedFiles: efNameTreeRef });
  const namesRef = context.register(names);
  catalog.set(PDFName.of('Names'), namesRef);

  // AF (Associated Files) array
  const afArray = context.obj([fileSpecRef]);
  const afArrayRef = context.register(afArray);
  catalog.set(PDFName.of('AF'), afArrayRef);
}

/**
 * Generate quote PDF (same layout, different title)
 */
async function generateQuotePdf(quote, company, client, items) {
  return generateInvoicePdf(
    { ...quote, invoice_number: quote.quote_number },
    company, client, items
  );
}

// Helpers
function drawText(page, text, x, y, font, size, color) {
  if (!text) return y;
  page.drawText(String(text), { x, y, font, size, color });
  return y - size - 3;
}

function fmtDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCur(amount) {
  if (amount == null) return '0,00';
  return Number(amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n) {
  if (n == null) return '1';
  return Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(2);
}

module.exports = { generateInvoicePdf, generateQuotePdf };
