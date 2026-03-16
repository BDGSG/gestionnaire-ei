/**
 * Factur-X / ZUGFeRD XML CII (Cross Industry Invoice) Generator
 * Profile: BASIC (sufficient for French EI)
 * Standard: EN 16931 / Factur-X 1.0
 */

const FACTURX_PROFILE = 'urn:factur-x.eu:1p0:basic';
const FACTURX_NS = 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
const RAM_NS = 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100';
const QDT_NS = 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100';
const UDT_NS = 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100';

/**
 * Generate Factur-X XML CII for an invoice
 * @param {Object} invoice - Invoice data
 * @param {Object} company - Seller company data
 * @param {Object} client - Buyer client data
 * @param {Array} items - Invoice line items
 * @returns {string} XML string
 */
function generateFacturXml(invoice, company, client, items) {
  const issueDate = formatXmlDate(invoice.issue_date);
  const dueDate = formatXmlDate(invoice.due_date);
  const totalHt = Number(invoice.total_ht || 0);
  const totalTva = Number(invoice.total_tva || 0);
  const totalTtc = Number(invoice.total_ttc || 0);
  const tvaRate = Number(invoice.tva_rate || 20);

  // Type code: 380 = Commercial Invoice, 381 = Credit Note
  const typeCode = '380';

  // Currency
  const currency = 'EUR';

  // Payment means code: 30 = Credit transfer, 48 = Bank card, 10 = Cash
  const paymentCode = mapPaymentCode(invoice.payment_method);

  const clientName = client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
  const sellerName = `EI ${company.business_name}`;

  // Nature of operation (new 2026 field)
  const operationType = invoice.operation_type || 'SERVICE';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="${FACTURX_NS}" xmlns:ram="${RAM_NS}" xmlns:qdt="${QDT_NS}" xmlns:udt="${UDT_NS}">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${FACTURX_PROFILE}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${escXml(invoice.invoice_number)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>${escXml(invoice.notes || `Facture ${invoice.invoice_number}`)}</ram:Content>
      <ram:SubjectCode>AAK</ram:SubjectCode>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>`;

  // Line items
  items.forEach((item, i) => {
    const lineHt = Number(item.quantity || 1) * Number(item.unit_price_ht || 0);
    const lineTva = lineHt * Number(item.tva_rate || tvaRate) / 100;
    xml += `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escXml(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${Number(item.unit_price_ht).toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${mapUnitCode(item.unit)}">${Number(item.quantity || 1).toFixed(3)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${Number(item.tva_rate || tvaRate).toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${lineHt.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
  });

  // Trade Agreement (seller + buyer)
  xml += `
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escXml(sellerName)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escXml(company.siren)}</ram:ID>
          <ram:TradingBusinessName>${escXml(sellerName)}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(company.postal_code)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(company.address_line1)}</ram:LineOne>${company.address_line2 ? `
          <ram:LineTwo>${escXml(company.address_line2)}</ram:LineTwo>` : ''}
          <ram:CityName>${escXml(company.city)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escXml(company.email)}</ram:URIID>
        </ram:URIUniversalCommunication>${company.tva_number ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escXml(company.tva_number)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        <ram:Name>${escXml(clientName)}</ram:Name>${client.siren ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escXml(client.siren)}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}${client.address_line1 ? `
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(client.postal_code || '')}</ram:PostcodeCode>
          <ram:LineOne>${escXml(client.address_line1)}</ram:LineOne>
          <ram:CityName>${escXml(client.city || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>` : ''}${client.email ? `
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escXml(client.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ''}${client.tva_number ? `
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escXml(client.tva_number)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>${invoice.delivery_address ? `
      <ram:ShipToTradeParty>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escXml(invoice.delivery_address)}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:ShipToTradeParty>` : ''}
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>${company.bank_iban ? `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${paymentCode}</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${escXml(company.bank_iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>${company.bank_bic ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${escXml(company.bank_bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>` : ''}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${totalTva.toFixed(2)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${totalHt.toFixed(2)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${tvaRate.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${totalHt.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${totalHt.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${totalTva.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${totalTtc.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${totalTtc.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return xml;
}

// Helpers
function formatXmlDate(date) {
  if (!date) return '20260101';
  const d = new Date(date);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function escXml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function mapPaymentCode(method) {
  const codes = {
    virement: '30', carte: '48', especes: '10', cheque: '20',
    prelevement: '49', plateforme: '30', autre: '30'
  };
  return codes[method] || '30';
}

function mapUnitCode(unit) {
  const codes = {
    'unite': 'C62', 'unité': 'C62', 'heure': 'HUR', 'h': 'HUR',
    'jour': 'DAY', 'j': 'DAY', 'km': 'KMT', 'kg': 'KGM',
    'piece': 'C62', 'pièce': 'C62', 'lot': 'C62', 'forfait': 'C62'
  };
  return codes[(unit || '').toLowerCase()] || 'C62';
}

module.exports = { generateFacturXml, FACTURX_PROFILE };
