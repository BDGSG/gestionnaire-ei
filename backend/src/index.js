require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initBot } = require('./services/telegram');
const clientsRouter = require('./routes/clients');
const invoicesRouter = require('./routes/invoices');
const quotesRouter = require('./routes/quotes');
const documentsRouter = require('./routes/documents');
const transactionsRouter = require('./routes/transactions');
const dashboardRouter = require('./routes/dashboard');
const fiscalRouter = require('./routes/fiscal');
const companyRouter = require('./routes/company');
const regulatoryRouter = require('./routes/regulatory');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/clients', clientsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/company', companyRouter);
app.use('/api/regulatory', regulatoryRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// FEC export endpoint
app.get('/api/fec/:year', async (req, res) => {
  try {
    const { exportFEC } = require('./services/accounting');
    const year = parseInt(req.params.year);
    if (!year || year < 2020 || year > 2030) return res.status(400).json({ error: 'Invalid year' });
    const result = await exportFEC(year);
    if (!result) return res.status(404).json({ error: 'No entries for this year' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Journal summary endpoint
app.get('/api/journal/:year/:month?', async (req, res) => {
  try {
    const { getJournalSummary } = require('./services/accounting');
    const year = parseInt(req.params.year);
    const month = req.params.month ? parseInt(req.params.month) : null;
    const summary = await getJournalSummary(year, month);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.resolve(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT}`);
  // Init Telegram bot
  await initBot();
  console.log('[Telegram] Bot initialized');
});
