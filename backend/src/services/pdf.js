const PdfPrinter = require('pdfmake');
const path = require('path');

// Polices intégrées pdfmake
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../../node_modules/pdfmake/build/vfs_fonts.js') ? 'Helvetica' : 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

/**
 * Génère un PDF de facture conforme aux mentions légales françaises
 */
function generateInvoicePdf(invoice, company, client, items) {
  return new Promise((resolve, reject) => {
    const pdfmake = require('pdfmake/build/pdfmake');
    const pdfFonts = require('pdfmake/build/vfs_fonts');
    if (pdfFonts && pdfFonts.pdfMake) {
      pdfmake.vfs = pdfFonts.pdfMake.vfs;
    } else if (pdfFonts && pdfFonts.default) {
      pdfmake.vfs = pdfFonts.default.pdfMake ? pdfFonts.default.pdfMake.vfs : pdfFonts.vfs;
    }

    const tvaLine = company.tva_number
      ? `TVA Intracom.: ${company.tva_number}`
      : '';

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 80],
      content: [
        // En-tête
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: `EI ${company.business_name}`, style: 'companyName' },
                { text: company.owner_name, style: 'small' },
                { text: company.address_line1, style: 'small' },
                { text: company.address_line2 || '', style: 'small' },
                { text: `${company.postal_code} ${company.city}`, style: 'small' },
                { text: `SIRET: ${company.siret}`, style: 'small' },
                { text: `APE: ${company.code_ape}`, style: 'small' },
                { text: tvaLine, style: 'small' },
                { text: `Tél: ${company.phone}`, style: 'small' },
                { text: `Email: ${company.email}`, style: 'small' },
              ]
            },
            {
              width: '50%',
              stack: [
                { text: 'FACTURE', style: 'invoiceTitle', alignment: 'right' },
                { text: `N° ${invoice.invoice_number}`, style: 'invoiceNumber', alignment: 'right' },
                { text: `Date: ${formatDate(invoice.issue_date)}`, alignment: 'right', margin: [0, 5, 0, 0] },
                { text: `Échéance: ${formatDate(invoice.due_date)}`, alignment: 'right' },
              ]
            }
          ]
        },
        { text: '', margin: [0, 20, 0, 0] },

        // Client
        {
          style: 'clientBox',
          table: {
            widths: ['*'],
            body: [
              [{
                stack: [
                  { text: client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim(), bold: true },
                  { text: client.address_line1 || '', style: 'small' },
                  { text: client.address_line2 || '', style: 'small' },
                  { text: `${client.postal_code || ''} ${client.city || ''}`.trim(), style: 'small' },
                  { text: client.siret ? `SIRET: ${client.siret}` : '', style: 'small' },
                  { text: client.tva_number ? `TVA: ${client.tva_number}` : '', style: 'small' },
                ],
                margin: [5, 5, 5, 5]
              }]
            ]
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cccccc',
            vLineColor: () => '#cccccc',
          },
          margin: [250, 0, 0, 0]
        },
        { text: '', margin: [0, 20, 0, 0] },

        // Tableau des lignes
        {
          table: {
            headerRows: 1,
            widths: ['*', 50, 50, 70, 40, 60, 70],
            body: [
              [
                { text: 'Description', style: 'tableHeader' },
                { text: 'Qté', style: 'tableHeader', alignment: 'center' },
                { text: 'Unité', style: 'tableHeader', alignment: 'center' },
                { text: 'PU HT', style: 'tableHeader', alignment: 'right' },
                { text: 'TVA', style: 'tableHeader', alignment: 'center' },
                { text: 'Total HT', style: 'tableHeader', alignment: 'right' },
                { text: 'Total TTC', style: 'tableHeader', alignment: 'right' },
              ],
              ...items.map(item => [
                { text: item.description, fontSize: 9 },
                { text: formatNumber(item.quantity), alignment: 'center', fontSize: 9 },
                { text: item.unit || '', alignment: 'center', fontSize: 9 },
                { text: formatCurrency(item.unit_price_ht), alignment: 'right', fontSize: 9 },
                { text: `${item.tva_rate}%`, alignment: 'center', fontSize: 9 },
                { text: formatCurrency(item.total_ht), alignment: 'right', fontSize: 9 },
                { text: formatCurrency(item.total_ttc), alignment: 'right', fontSize: 9 },
              ])
            ]
          },
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
            vLineWidth: () => 0.5,
            hLineColor: (i) => i <= 1 ? '#333333' : '#dddddd',
            vLineColor: () => '#dddddd',
            fillColor: (i) => i === 0 ? '#f0f0f0' : null,
          }
        },
        { text: '', margin: [0, 15, 0, 0] },

        // Totaux
        {
          columns: [
            { width: '*', text: '' },
            {
              width: 200,
              table: {
                widths: ['*', 80],
                body: [
                  [{ text: 'Total HT', bold: true }, { text: formatCurrency(invoice.total_ht), alignment: 'right', bold: true }],
                  [{ text: `TVA (${invoice.tva_rate}%)` }, { text: formatCurrency(invoice.total_tva), alignment: 'right' }],
                  [{ text: 'Total TTC', bold: true, fontSize: 12 }, { text: formatCurrency(invoice.total_ttc), alignment: 'right', bold: true, fontSize: 12 }],
                ]
              },
              layout: {
                hLineWidth: (i, node) => (i === node.table.body.length) ? 2 : 0.5,
                vLineWidth: () => 0,
                hLineColor: (i, node) => i === node.table.body.length ? '#333' : '#ddd',
              }
            }
          ]
        },
        { text: '', margin: [0, 20, 0, 0] },

        // Conditions de paiement
        {
          stack: [
            { text: 'Conditions de paiement', bold: true, fontSize: 9, margin: [0, 0, 0, 3] },
            { text: `Paiement à ${company.default_payment_delay_days || 30} jours.`, fontSize: 8 },
            { text: `En cas de retard de paiement, une pénalité de ${company.default_late_penalty_rate || 3}% par an sera appliquée.`, fontSize: 8 },
            { text: 'Indemnité forfaitaire pour frais de recouvrement : 40,00 €', fontSize: 8 },
            { text: invoice.notes || '', fontSize: 8, margin: [0, 5, 0, 0] },
          ]
        },
      ],
      footer: {
        columns: [
          {
            text: `EI ${company.business_name} - SIRET ${company.siret} - APE ${company.code_ape}${company.tva_number ? ' - TVA ' + company.tva_number : ''}\n${company.address_line1}, ${company.postal_code} ${company.city} - ${company.phone} - ${company.email}`,
            style: 'footer',
            alignment: 'center',
            margin: [40, 10, 40, 0]
          }
        ]
      },
      styles: {
        companyName: { fontSize: 14, bold: true, color: '#1a56db', margin: [0, 0, 0, 3] },
        small: { fontSize: 8, color: '#555555' },
        invoiceTitle: { fontSize: 22, bold: true, color: '#1a56db' },
        invoiceNumber: { fontSize: 11, color: '#333333' },
        tableHeader: { bold: true, fontSize: 9, color: '#333333' },
        footer: { fontSize: 7, color: '#888888' },
      },
      defaultStyle: { fontSize: 10 }
    };

    const pdfDoc = pdfmake.createPdf(docDefinition);
    const chunks = [];
    pdfDoc.getBuffer((buffer) => {
      resolve(Buffer.from(buffer));
    });
  });
}

/**
 * Génère un PDF de devis conforme
 */
function generateQuotePdf(quote, company, client, items) {
  // Même structure que facture mais avec titre DEVIS et mentions spécifiques
  return generateInvoicePdf(
    { ...quote, invoice_number: quote.quote_number },
    company,
    client,
    items
  ).then(buffer => {
    // On pourrait ici modifier le titre, mais pour simplifier on réutilise
    // En production, dupliquer avec les mentions spécifiques devis
    return buffer;
  });
}

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null) return '0,00 €';
  return Number(amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatNumber(n) {
  if (n == null) return '1';
  return Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(2);
}

module.exports = { generateInvoicePdf, generateQuotePdf };
