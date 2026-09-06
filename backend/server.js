import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { firebaseConfigured } from './firebase.js';
import { syncProjectsFromFirebase, syncProjectsToFirebase } from './sync.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const syncIntervalMs = Number(process.env.SYNC_INTERVAL_MS || 300000);
let syncInProgress = false;

async function runProjectsSync() {
  if (syncInProgress) return { skipped: true, reason: 'sync_in_progress' };

  syncInProgress = true;
  try {
    const fromFirebase = await syncProjectsFromFirebase();
    const toFirebase = await syncProjectsToFirebase();
    return { fromFirebase, toFirebase };
  } finally {
    syncInProgress = false;
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({
      ok: true,
      mysql: 'connected',
      firebase: firebaseConfigured ? 'configured' : 'not_configured'
    });
  } catch (error) {
    console.error('MySQL health check failed:', error.message);
    response.status(503).json({ ok: false, mysql: 'disconnected' });
  }
});

app.post('/api/sync/projects', async (_request, response) => {
  try {
    const result = await runProjectsSync();
    response.json({ ok: true, direction: 'bidirectional', ...result });
  } catch (error) {
    console.error('Could not sync projects:', error.message);
    response.status(503).json({ ok: false, error: error.message });
  }
});

app.post('/api/sync/projects/to-firebase', async (_request, response) => {
  try {
    const result = await syncProjectsToFirebase();
    response.json({ ok: true, direction: 'mysql_to_firebase', ...result });
  } catch (error) {
    console.error('Could not sync projects to Firebase:', error.message);
    response.status(503).json({ ok: false, error: error.message });
  }
});

app.get('/api/projects', async (_request, response) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, image_url, project_url, created_at, updated_at
       FROM projects
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );
    response.json(rows);
  } catch (error) {
    console.error('Could not load projects:', error.message);
    response.status(500).json({ error: 'No se pudieron cargar los proyectos.' });
  }
});

app.post('/api/projects', async (request, response) => {
  const { title, description = '', imageUrl = '', projectUrl = '' } = request.body;
  const cleanTitle = typeof title === 'string' ? title.trim() : '';

  if (!cleanTitle) {
    response.status(400).json({ error: 'El título es obligatorio.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    await pool.execute(
      `INSERT INTO projects
        (id, title, description, image_url, project_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, cleanTitle, description, imageUrl, projectUrl, now, now]
    );

    response.status(201).json({
      id,
      title: cleanTitle,
      description,
      imageUrl,
      projectUrl,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
  } catch (error) {
    console.error('Could not create project:', error.message);
    response.status(500).json({ error: 'No se pudo guardar el proyecto.' });
  }
});

app.listen(port, () => {
  console.log(`API local disponible en http://localhost:${port}`);

  if (firebaseConfigured) {
    void runProjectsSync()
      .then((result) => console.log('Sincronización inicial completada:', result))
      .catch((error) => console.error('Sincronización inicial fallida:', error.message));

    setInterval(() => {
      void runProjectsSync()
        .then((result) => console.log('Sincronización automática completada:', result))
        .catch((error) => console.error('Sincronización automática fallida:', error.message));
    }, syncIntervalMs);
  }
});
