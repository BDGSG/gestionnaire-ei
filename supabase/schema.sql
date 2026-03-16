-- ============================================
-- GESTIONNAIRE EI - DIAMBRA BROU
-- Schema Supabase PostgreSQL
-- ============================================

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: company_info (singleton - infos EI)
-- ============================================
CREATE TABLE company_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name TEXT NOT NULL DEFAULT 'DIAMBRA BROU',
  legal_form TEXT NOT NULL DEFAULT 'Entrepreneur Individuel',
  owner_name TEXT NOT NULL DEFAULT 'BROU Diambra Guy Serge',
  siret TEXT NOT NULL DEFAULT '82364255800048',
  siren TEXT NOT NULL DEFAULT '823642558',
  code_ape TEXT NOT NULL DEFAULT '4932Z',
  tva_number TEXT, -- Numéro TVA intracommunautaire (à renseigner)
  address_line1 TEXT NOT NULL DEFAULT '5 Avenue du Général de Gaulle',
  address_line2 TEXT DEFAULT 'Appt 201',
  postal_code TEXT NOT NULL DEFAULT '92360',
  city TEXT NOT NULL DEFAULT 'Meudon',
  country TEXT NOT NULL DEFAULT 'France',
  email TEXT NOT NULL DEFAULT 'brou.diambra@yahoo.fr',
  phone TEXT NOT NULL DEFAULT '0665339086',
  has_rc_pro BOOLEAN DEFAULT true,
  rc_pro_insurer TEXT,
  rc_pro_policy_number TEXT,
  bank_iban TEXT,
  bank_bic TEXT,
  logo_url TEXT,
  invoice_prefix TEXT DEFAULT 'FA',
  quote_prefix TEXT DEFAULT 'DE',
  next_invoice_number INTEGER DEFAULT 1,
  next_quote_number INTEGER DEFAULT 1,
  default_payment_delay_days INTEGER DEFAULT 30,
  default_late_penalty_rate DECIMAL(5,2) DEFAULT 3.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer les infos par défaut
INSERT INTO company_info (id) VALUES (uuid_generate_v4());

-- ============================================
-- TABLE: clients
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('particulier', 'entreprise', 'plateforme')),
  company_name TEXT,
  first_name TEXT,
  last_name TEXT,
  siret TEXT,
  siren TEXT,
  tva_number TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'France',
  email TEXT,
  phone TEXT,
  notes TEXT,
  activity TEXT CHECK (activity IN ('vtc', 'ecommerce', 'services_numeriques', 'autre')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients plateformes par défaut
INSERT INTO clients (type, company_name, activity, notes) VALUES
  ('plateforme', 'Uber', 'vtc', 'Plateforme VTC - factures mensuelles'),
  ('plateforme', 'Bolt', 'vtc', 'Plateforme VTC - factures mensuelles');

-- ============================================
-- TABLE: invoices (factures émises)
-- ============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  activity TEXT NOT NULL CHECK (activity IN ('vtc', 'ecommerce', 'services_numeriques')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  -- Montants
  total_ht DECIMAL(12,2) DEFAULT 0,
  total_tva DECIMAL(12,2) DEFAULT 0,
  total_ttc DECIMAL(12,2) DEFAULT 0,
  tva_rate DECIMAL(5,2) DEFAULT 20.00,
  -- Paiement
  payment_method TEXT,
  payment_date DATE,
  payment_reference TEXT,
  -- Mentions
  notes TEXT,
  conditions TEXT,
  -- PDF
  pdf_url TEXT,
  pdf_storage_path TEXT,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: invoice_items (lignes de facture)
-- ============================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,3) DEFAULT 1,
  unit TEXT DEFAULT 'unité',
  unit_price_ht DECIMAL(12,2) NOT NULL,
  tva_rate DECIMAL(5,2) DEFAULT 20.00,
  total_ht DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price_ht) STORED,
  total_tva DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price_ht * tva_rate / 100) STORED,
  total_ttc DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price_ht * (1 + tva_rate / 100)) STORED,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: quotes (devis)
-- ============================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'invoiced')),
  activity TEXT NOT NULL CHECK (activity IN ('vtc', 'ecommerce', 'services_numeriques')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  validity_date DATE,
  -- Montants
  total_ht DECIMAL(12,2) DEFAULT 0,
  total_tva DECIMAL(12,2) DEFAULT 0,
  total_ttc DECIMAL(12,2) DEFAULT 0,
  tva_rate DECIMAL(5,2) DEFAULT 20.00,
  -- Conversion
  converted_invoice_id UUID REFERENCES invoices(id),
  -- Contenu
  notes TEXT,
  conditions TEXT,
  -- PDF
  pdf_url TEXT,
  pdf_storage_path TEXT,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: quote_items (lignes de devis)
-- ============================================
CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,3) DEFAULT 1,
  unit TEXT DEFAULT 'unité',
  unit_price_ht DECIMAL(12,2) NOT NULL,
  tva_rate DECIMAL(5,2) DEFAULT 20.00,
  total_ht DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price_ht) STORED,
  total_tva DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price_ht * tva_rate / 100) STORED,
  total_ttc DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price_ht * (1 + tva_rate / 100)) STORED,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: documents (documents classifiés)
-- ============================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Classification
  category TEXT NOT NULL CHECK (category IN (
    'facture_emise', 'facture_recue', 'devis',
    'releve_bancaire', 'fiscal', 'social_urssaf',
    'assurance', 'contrat', 'administratif',
    'vehicule', 'ecommerce', 'autre'
  )),
  subcategory TEXT,
  -- Infos extraites par IA
  title TEXT NOT NULL,
  description TEXT,
  extracted_date DATE,        -- Date du document
  extracted_amount DECIMAL(12,2),
  extracted_vendor TEXT,      -- Fournisseur/émetteur
  extracted_reference TEXT,   -- Numéro de référence
  -- Fichier
  original_filename TEXT,
  file_type TEXT,             -- pdf, jpg, png, etc.
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  -- Organisation
  year INTEGER NOT NULL,
  month INTEGER,
  -- Lien avec facture/devis si applicable
  linked_invoice_id UUID REFERENCES invoices(id),
  linked_quote_id UUID REFERENCES quotes(id),
  -- OCR
  ocr_text TEXT,
  ai_classification_confidence DECIMAL(3,2),
  -- Source
  source TEXT DEFAULT 'telegram' CHECK (source IN ('telegram', 'web', 'auto')),
  telegram_file_id TEXT,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: transactions (livre des recettes + achats)
-- ============================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('recette', 'depense')),
  activity TEXT CHECK (activity IN ('vtc', 'ecommerce', 'services_numeriques', 'general')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount_ht DECIMAL(12,2) NOT NULL,
  amount_tva DECIMAL(12,2) DEFAULT 0,
  amount_ttc DECIMAL(12,2) NOT NULL,
  tva_rate DECIMAL(5,2),
  -- Paiement
  payment_method TEXT CHECK (payment_method IN ('virement', 'carte', 'especes', 'cheque', 'prelevement', 'plateforme', 'autre')),
  payment_reference TEXT,
  -- Liens
  client_id UUID REFERENCES clients(id),
  invoice_id UUID REFERENCES invoices(id),
  document_id UUID REFERENCES documents(id),
  -- Catégorie dépense
  expense_category TEXT CHECK (expense_category IN (
    'carburant', 'entretien_vehicule', 'assurance',
    'telephone', 'internet', 'logiciel',
    'achat_marchandise', 'frais_port',
    'comptabilite', 'formation',
    'cotisations_sociales', 'impots_taxes',
    'fournitures', 'deplacement', 'autre'
  )),
  notes TEXT,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: fiscal_deadlines (échéances fiscales)
-- ============================================
CREATE TABLE fiscal_deadlines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  deadline_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tva', 'ir', 'cfe', 'urssaf', 'das2', 'liasse', 'autre')),
  recurring TEXT CHECK (recurring IN ('mensuel', 'trimestriel', 'annuel', 'ponctuel')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'overdue')),
  reminder_days_before INTEGER DEFAULT 7,
  reminded BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer les échéances fiscales types 2026
INSERT INTO fiscal_deadlines (title, description, deadline_date, category, recurring) VALUES
  ('Déclaration TVA CA3 - Janvier', 'Déclaration mensuelle de TVA', '2026-02-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Février', 'Déclaration mensuelle de TVA', '2026-03-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Mars', 'Déclaration mensuelle de TVA', '2026-04-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Avril', 'Déclaration mensuelle de TVA', '2026-05-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Mai', 'Déclaration mensuelle de TVA', '2026-06-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Juin', 'Déclaration mensuelle de TVA', '2026-07-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Juillet', 'Déclaration mensuelle de TVA', '2026-08-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Août', 'Déclaration mensuelle de TVA', '2026-09-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Septembre', 'Déclaration mensuelle de TVA', '2026-10-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Octobre', 'Déclaration mensuelle de TVA', '2026-11-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Novembre', 'Déclaration mensuelle de TVA', '2026-12-20', 'tva', 'mensuel'),
  ('Déclaration TVA CA3 - Décembre', 'Déclaration mensuelle de TVA', '2027-01-20', 'tva', 'mensuel'),
  ('DAS2 - Honoraires versés', 'Déclaration des honoraires > 1200€ versés à des tiers', '2026-02-28', 'das2', 'annuel'),
  ('Déclaration IR + 2042-C-PRO', 'Impôt sur le revenu + revenus professionnels', '2026-05-22', 'ir', 'annuel'),
  ('Liasse fiscale 2035/2031', 'Dépôt de la liasse fiscale', '2026-05-20', 'liasse', 'annuel'),
  ('CFE - Paiement', 'Cotisation Foncière des Entreprises', '2026-12-15', 'cfe', 'annuel'),
  ('URSSAF - Cotisations T1', 'Cotisations sociales 1er trimestre', '2026-04-15', 'urssaf', 'trimestriel'),
  ('URSSAF - Cotisations T2', 'Cotisations sociales 2ème trimestre', '2026-07-15', 'urssaf', 'trimestriel'),
  ('URSSAF - Cotisations T3', 'Cotisations sociales 3ème trimestre', '2026-10-15', 'urssaf', 'trimestriel'),
  ('URSSAF - Cotisations T4', 'Cotisations sociales 4ème trimestre', '2027-01-15', 'urssaf', 'trimestriel');

-- ============================================
-- TABLE: tva_summary (résumé TVA par période)
-- ============================================
CREATE TABLE tva_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  tva_collected DECIMAL(12,2) DEFAULT 0,     -- TVA sur ventes
  tva_deductible DECIMAL(12,2) DEFAULT 0,    -- TVA sur achats
  tva_due DECIMAL(12,2) DEFAULT 0,           -- TVA à payer (collected - deductible)
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'declared', 'paid')),
  declaration_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_year, period_month)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(issue_date);
CREATE INDEX idx_invoices_activity ON invoices(activity);

CREATE INDEX idx_quotes_client ON quotes(client_id);
CREATE INDEX idx_quotes_status ON quotes(status);

CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_year ON documents(year);
CREATE INDEX idx_documents_date ON documents(extracted_date);

CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_activity ON transactions(activity);

CREATE INDEX idx_fiscal_deadlines_date ON fiscal_deadlines(deadline_date);
CREATE INDEX idx_fiscal_deadlines_status ON fiscal_deadlines(status);

-- ============================================
-- FUNCTIONS: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_company_info_updated BEFORE UPDATE ON company_info FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_quotes_updated BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_transactions_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_fiscal_deadlines_updated BEFORE UPDATE ON fiscal_deadlines FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_tva_summary_updated BEFORE UPDATE ON tva_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- STORAGE BUCKET (à créer via Supabase Dashboard)
-- Bucket name: documents
-- Public: false
-- File size limit: 20MB
-- Allowed MIME types: image/*, application/pdf
-- ============================================

-- ============================================
-- RLS Policies (Row Level Security)
-- Pour une app serveur-side, on peut désactiver RLS
-- ou utiliser le service_role key
-- ============================================
ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tva_summary ENABLE ROW LEVEL SECURITY;

-- Policy: autoriser tout via service_role (backend uniquement)
CREATE POLICY "Service role full access" ON company_info FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON invoice_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON quotes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON quote_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON fiscal_deadlines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON tva_summary FOR ALL USING (true) WITH CHECK (true);
