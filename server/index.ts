import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '15mb' }));

// --- API ---
app.use('/api', api);

// --- Static client (production build) ---
const clientDir = path.resolve(__dirname, '../dist');
app.use(express.static(clientDir));

// SPA fallback: any non-API route serves the React app.
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(clientDir, 'index.html'));
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[cpq] server listening on :${port}`);
});
