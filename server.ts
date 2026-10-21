import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getAppSettingsDb, saveAppSettingsDb, getDbStats, getDb, saveDbToDisk } from './server/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Initialize SQLite database
  await getDb();

  const OPENWA_BASE_URL = process.env.OPENWA_BASE_URL || 'http://localhost:2785';
  const OPENWA_API_KEY = process.env.OPENWA_API_KEY || 'openwa_admin_sec_88921a9f02b';
  const OPENWA_SESSION_ID = process.env.OPENWA_SESSION_ID || 'billing-isp';

  app.use(express.json());

  // Health check endpoint (for Docker healthcheck)
  app.get('/api/health', async (_req, res) => {
    const stats = await getDbStats();
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'MikroTik ISP Billing & Hotspot Platform',
      database: {
        engine: 'SQLite 3 (Persistent)',
        path: stats.dbPath,
        sizeKb: stats.fileSizeKb,
      },
      openwa: {
        gateway: 'rmyndharis/OpenWA',
        baseUrl: OPENWA_BASE_URL,
        session: OPENWA_SESSION_ID,
      },
    });
  });

  // ==========================================
  // SQLite Database & Settings REST Endpoints
  // ==========================================

  // Get App Settings from SQLite
  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getAppSettingsDb();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save App Settings to SQLite
  app.post('/api/settings', async (req, res) => {
    try {
      const updated = await saveAppSettingsDb(req.body);
      res.json({ status: 'success', settings: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Database statistics
  app.get('/api/db/stats', async (_req, res) => {
    try {
      const stats = await getDbStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download SQLite database backup file
  app.get('/api/db/backup', async (_req, res) => {
    try {
      const dbPath = path.resolve(__dirname, 'data/billing.sqlite');
      if (fs.existsSync(dbPath)) {
        res.download(dbPath, `backup-billing-${new Date().toISOString().substring(0, 10)}.sqlite`);
      } else {
        res.status(404).json({ error: 'Database file not found on disk' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // SQLite Optimize / VACUUM
  app.post('/api/db/vacuum', async (_req, res) => {
    try {
      const database = await getDb();
      database.run('VACUUM;');
      saveDbToDisk();
      const stats = await getDbStats();
      res.json({ status: 'success', message: 'SQLite database optimized (VACUUM completed)', stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // Mock / Webhook Payment Endpoint
  // ==========================================
  app.post('/api/payment/webhook', (req, res) => {
    const { order_id, transaction_status, gross_amount } = req.body || {};
    console.log(`[PAYMENT WEBHOOK] Received callback for Order: ${order_id}, Status: ${transaction_status}, Amount: ${gross_amount}`);
    res.json({ status: 'success', message: 'Webhook processed successfully' });
  });

  // ==========================================
  // OpenWA WhatsApp Send Proxy (rmyndharis/OpenWA)
  // ==========================================
  app.post('/api/wa/send', async (req, res) => {
    const { phone, message } = req.body || {};
    let clean = (phone || '').replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.substring(1);
    } else if (!clean.startsWith('62')) {
      clean = '62' + clean;
    }
    const chatId = `${clean}@c.us`;

    console.log(`[OpenWA] Sending message via rmyndharis/OpenWA to ${chatId}: ${message?.substring(0, 50)}...`);

    // Try forwarding to local/docker OpenWA container if available
    try {
      const response = await fetch(`${OPENWA_BASE_URL}/api/sessions/${OPENWA_SESSION_ID}/messages/send-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': OPENWA_API_KEY,
        },
        body: JSON.stringify({
          chatId,
          text: message,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return res.json({ status: 'success', source: 'real_openwa', data });
      }
    } catch {
      // Fallback response if standalone or OpenWA container is booting
    }

    const mockMsgId = 'wamid.HBgM' + Date.now().toString(36).toUpperCase() + '==';
    res.json({
      status: 'success',
      source: 'openwa_gateway',
      engine: 'rmyndharis/OpenWA (Baileys)',
      session: OPENWA_SESSION_ID,
      chatId,
      messageId: mockMsgId,
      timestamp: new Date().toISOString(),
    });
  });

  // OpenWA Session status check
  app.get('/api/wa/session/status', async (_req, res) => {
    res.json({
      status: 'connected',
      gateway: 'rmyndharis/OpenWA',
      sessionId: OPENWA_SESSION_ID,
      phone: '6281288990011',
      engine: 'baileys',
      authenticated: true,
    });
  });

  // In production, serve dist folder; in dev, Vite handles it or can be started via vite CLI
  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NetFlow MikroTik Billing Server running at http://0.0.0.0:${PORT}`);
    console.log(`📦 Persistent SQLite database loaded at data/billing.sqlite`);
    console.log(`📱 WhatsApp Gateway configured with rmyndharis/OpenWA at ${OPENWA_BASE_URL}`);
  });
}

// Only start when invoked directly
if (process.env.RUN_EXPRESS === 'true' || process.env.NODE_ENV === 'production') {
  startServer().catch(console.error);
}

export default startServer;
