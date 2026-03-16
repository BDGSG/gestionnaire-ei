# Gestionnaire EI - DIAMBRA BROU

Application de gestion pour Entreprise Individuelle avec Bot Telegram + Dashboard Web.

## Fonctionnalités

### Bot Telegram (interface principale)
| Commande | Description |
|----------|-------------|
| `/start` | Menu principal |
| `/facture` | Créer une facture (assistant interactif) |
| `/devis` | Créer un devis |
| `/clients` | Lister les clients |
| `/ca` | Chiffre d'affaires (mois + année, par activité) |
| `/tva` | Résumé TVA du mois (collectée, déductible, à reverser) |
| `/echeances` | Prochaines échéances fiscales |
| `/r montant description activité` | Enregistrer une recette rapide |
| `/d montant description catégorie` | Enregistrer une dépense rapide |
| `/docs mot-clé` | Rechercher un document |
| `/web` | Lien vers le dashboard |
| **Envoyer une photo/PDF** | Classification IA automatique |

### Dashboard Web
- Tableau de bord (KPIs, graphiques CA, TVA, factures impayées)
- Gestion factures (création, PDF conforme, marquage payé)
- Gestion devis (création, conversion en facture)
- Gestion clients (particuliers, entreprises, plateformes)
- Documents (upload, recherche, filtres, classification IA)
- Transactions (livre des recettes/dépenses, filtres)
- Fiscal (échéances, résumé TVA mensuel/annuel)
- Paramètres entreprise (identité, banque, facturation)

### Classification IA des documents
- OCR via Claude Vision (Haiku)
- Catégories: factures émises/reçues, devis, relevés bancaires, fiscal, URSSAF, assurance, contrats, véhicule, e-commerce, administratif

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Node.js + Express |
| Bot Telegram | node-telegram-bot-api |
| Frontend | React 19 + Vite + Tailwind CSS |
| BDD | Supabase (PostgreSQL) |
| Stockage | Supabase Storage |
| IA | Claude Haiku (classification + OCR) |
| PDF | pdfmake |
| Déploiement | Docker + Coolify |

## Déploiement

### 1. Créer la BDD Supabase
Exécuter `supabase/schema.sql` dans l'éditeur SQL de Supabase.
Créer un bucket Storage nommé `documents` (privé, 20MB max).

### 2. Variables d'environnement
```
SUPABASE_URL=https://...
SUPABASE_SERVICE_KEY=eyJ...
TELEGRAM_BOT_TOKEN=8266273489:AAH...
TELEGRAM_OWNER_ID=7445971784
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3000
NODE_ENV=production
APP_URL=https://gestionnaire.inkora.art
```

### 3. Déployer sur Coolify
1. Créer un projet + app (Dockerfile)
2. Pousser les env vars via l'API bulk
3. Build & deploy automatique

### Développement local
```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

## Activités de l'EI
1. **VTC** (principale, APE 4932Z)
2. **E-commerce** (produits bien-être/hygiène)
3. **Services numériques** (création sites, design, contenus)

## Échéances fiscales pré-configurées
- TVA CA3 mensuelle (le 20 de chaque mois)
- Déclaration IR + 2042-C-PRO (mai)
- Liasse fiscale 2035/2031 (mai)
- CFE (décembre)
- URSSAF trimestrielle
- DAS2 (février)
