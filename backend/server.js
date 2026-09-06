import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { firebaseConfigured, firestore } from './firebase.js';
import { syncProjectsFromFirebase, syncProjectsToFirebase } from './sync.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), override: true });

const app = express();
const port = Number(process.env.PORT || 3000);
const syncIntervalMs = Number(process.env.SYNC_INTERVAL_MS || 300000);
let syncInProgress = false;
const adminSessions = new Set();
const contentTables = new Set(['services', 'experience', 'about_content', 'site_settings']);
const adminMutationTables = new Set(['services', 'experience']);
let lastSyncAt = null;
let adminOnlineUntil = 0;
const onlineChats = new Map();

async function runProjectsSync() {
  if (syncInProgress) return { skipped: true, reason: 'sync_in_progress' };

  syncInProgress = true;
  try {
    const fromFirebase = await syncProjectsFromFirebase();
    const toFirebase = await syncProjectsToFirebase();
    lastSyncAt = new Date();
    return { fromFirebase, toFirebase };
  } finally {
    syncInProgress = false;
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function requireAdmin(request, response, next) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token || !adminSessions.has(token)) {
    response.status(401).json({ error: 'Sesión de administración requerida.' });
    return;
  }
  next();
}

app.post('/api/auth/login', (request, response) => {
  const { username, password } = request.body;
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword || username !== expectedUser || password !== expectedPassword) {
    response.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const token = crypto.randomUUID();
  adminSessions.add(token);
  adminOnlineUntil = Date.now() + 90000;
  response.json({ ok: true, token });
});

app.post('/api/auth/logout', requireAdmin, (request, response) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  adminSessions.delete(token);
  if (!adminSessions.size) {
    adminOnlineUntil = 0;
    if (firestore) void firestore.collection('system').doc('presence').set({ online: false, expiresAt: 0 });
  }
  response.json({ ok: true });
});

app.post('/api/admin/presence', requireAdmin, (_request, response) => {
  adminOnlineUntil = Date.now() + 90000;
  if (firestore) {
    void firestore.collection('system').doc('presence').set({ online: true, expiresAt: Date.now() + 90000 });
  }
  response.json({ ok: true, online: true });
});

app.get('/api/public/presence', async (_request, response) => {
  if (firestore) {
    const presence = await firestore.collection('system').doc('presence').get();
    const data = presence.exists ? presence.data() : {};
    return response.json({ online: Boolean(data.online && data.expiresAt > Date.now()) });
  }
  response.json({ online: adminOnlineUntil > Date.now() });
});

// El chat online vive solo en memoria; no se guarda en MySQL.
app.post('/api/chat', async (request, response) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
  const email = typeof request.body?.email === 'string' ? request.body.email.trim() : '';
  const body = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
  const existingId = typeof request.body?.conversationId === 'string' ? request.body.conversationId : '';
  if (firestore) {
    const chats = firestore.collection('onlineChats');
    if (existingId) {
      const reference = chats.doc(existingId);
      const snapshot = await reference.get();
      if (!snapshot.exists) return response.status(404).json({ error: 'Chat finalizado.' });
      if (!body) return response.status(400).json({ error: 'Escribe un mensaje.' });
      await reference.collection('replies').add({ sender: 'visitor', body, createdAt: new Date() });
      await reference.set({ updatedAt: new Date() }, { merge: true });
      return response.json({ ok: true, id: existingId, continued: true });
    }
    if (!name || !body) return response.status(400).json({ error: 'Nombre y mensaje son obligatorios.' });
    const reference = chats.doc();
    await reference.set({ name, email, subject: 'Chat online', createdAt: new Date(), updatedAt: new Date(), active: true });
    await reference.collection('replies').add({ sender: 'visitor', body, createdAt: new Date() });
    return response.status(201).json({ ok: true, id: reference.id });
  }
  if (existingId && onlineChats.has(existingId)) {
    if (!body) return response.status(400).json({ error: 'Escribe un mensaje.' });
    const chat = onlineChats.get(existingId);
    chat.replies.push({ sender: 'visitor', body, createdAt: new Date().toISOString() });
    chat.updatedAt = new Date().toISOString();
    return response.json({ ok: true, id: existingId, continued: true });
  }
  if (!name || !body) return response.status(400).json({ error: 'Nombre y mensaje son obligatorios.' });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  onlineChats.set(id, { id, name, email, subject: 'Chat online', updatedAt: now, replies: [{ sender: 'visitor', body, createdAt: now }] });
  response.status(201).json({ ok: true, id });
});

app.get('/api/chat/:id/replies', async (request, response) => {
  if (firestore) {
    const snapshot = await firestore.collection('onlineChats').doc(request.params.id).get();
    if (!snapshot.exists || snapshot.data().active === false) return response.status(404).json({ error: 'Chat finalizado.' });
    const replies = await snapshot.ref.collection('replies').orderBy('createdAt', 'asc').get();
    return response.json(replies.docs.map((entry) => entry.data()));
  }
  const chat = onlineChats.get(request.params.id);
  if (!chat) return response.status(404).json({ error: 'Chat finalizado.' });
  response.json(chat.replies);
});

app.post('/api/chat/:id/end', async (request, response) => {
  if (firestore) {
    await firestore.collection('onlineChats').doc(request.params.id).delete();
    return response.json({ ok: true, ended: true });
  }
  response.json({ ok: onlineChats.delete(request.params.id), ended: true });
});

app.get('/api/admin/chats', requireAdmin, async (_request, response) => {
  if (firestore) {
    const snapshot = await firestore.collection('onlineChats').where('active', '==', true).get();
    const chats = await Promise.all(snapshot.docs.map(async (entry) => {
      const replies = await entry.ref.collection('replies').orderBy('createdAt', 'desc').limit(1).get();
      return { id: entry.id, ...entry.data(), lastMessage: replies.docs[0]?.data().body || '' };
    }));
    chats.sort((first, second) => String(second.updatedAt || '').localeCompare(String(first.updatedAt || '')));
    return response.json(chats);
  }
  response.json([...onlineChats.values()].map(({ replies, ...chat }) => ({ ...chat, lastMessage: replies.at(-1)?.body || '' })));
});

app.get('/api/admin/chats/:id/replies', requireAdmin, async (request, response) => {
  if (firestore) {
    const reference = firestore.collection('onlineChats').doc(request.params.id);
    const snapshot = await reference.get();
    if (!snapshot.exists) return response.status(404).json({ error: 'Chat finalizado.' });
    const replies = await reference.collection('replies').orderBy('createdAt', 'asc').get();
    return response.json(replies.docs.map((entry) => entry.data()));
  }
  const chat = onlineChats.get(request.params.id);
  if (!chat) return response.status(404).json({ error: 'Chat finalizado.' });
  response.json(chat.replies);
});

app.post('/api/admin/chats/:id/replies', requireAdmin, async (request, response) => {
  if (firestore) {
    const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
    const reference = firestore.collection('onlineChats').doc(request.params.id);
    const snapshot = await reference.get();
    if (!snapshot.exists) return response.status(404).json({ error: 'Chat finalizado.' });
    if (!body) return response.status(400).json({ error: 'La respuesta no puede estar vacía.' });
    await reference.collection('replies').add({ sender: 'admin', body, createdAt: new Date() });
    await reference.set({ updatedAt: new Date() }, { merge: true });
    return response.status(201).json({ ok: true });
  }
  const chat = onlineChats.get(request.params.id);
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!chat) return response.status(404).json({ error: 'Chat finalizado.' });
  if (!body) return response.status(400).json({ error: 'La respuesta no puede estar vacía.' });
  chat.replies.push({ sender: 'admin', body, createdAt: new Date().toISOString() });
  chat.updatedAt = new Date().toISOString();
  response.status(201).json({ ok: true });
});

app.delete('/api/admin/chats/:id', requireAdmin, async (request, response) => {
  if (firestore) {
    const reference = firestore.collection('onlineChats').doc(request.params.id);
    const replies = await reference.collection('replies').get();
    await Promise.all(replies.docs.map((entry) => entry.ref.delete()));
    await reference.delete();
    return response.json({ ok: true, ended: true });
  }
  response.json({ ok: onlineChats.delete(request.params.id), ended: true });
});

app.get('/api/content/:type', requireAdmin, async (request, response) => {
  const { type } = request.params;
  if (!contentTables.has(type)) {
    response.status(404).json({ error: 'Tipo de contenido no válido.' });
    return;
  }

  try {
    const order = type === 'services' || type === 'experience'
      ? 'position ASC, updated_at DESC'
      : 'updated_at DESC';
    const [rows] = await pool.query(`SELECT * FROM ${type} ORDER BY ${order}`);
    response.json(rows);
  } catch (error) {
    console.error('Could not load content:', error.message);
    response.status(500).json({ error: 'No se pudo cargar el contenido.' });
  }
});

app.get('/api/public/content/:type', async (request, response) => {
  const { type } = request.params;
  if (!contentTables.has(type)) return response.status(404).json({ error: 'Tipo de contenido no válido.' });
  try {
    const order = type === 'services' || type === 'experience'
      ? 'position ASC, updated_at DESC'
      : 'updated_at DESC';
    const visibility = type === 'services' || type === 'experience' ? ' WHERE visible = TRUE' : '';
    const [rows] = await pool.query(`SELECT * FROM ${type}${visibility} ORDER BY ${order}`);
    response.json(rows);
  } catch (error) {
    console.error('Could not load public content:', error.message);
    response.status(500).json({ error: 'No se pudo cargar el contenido público.' });
  }
});

app.post('/api/content/:type', requireAdmin, async (request, response) => {
  const { type } = request.params;
  if (!adminMutationTables.has(type)) return response.status(405).json({ error: 'Tipo no editable.' });
  const data = request.body || {};
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    if (type === 'services') {
      await pool.execute(
        `INSERT INTO services (id, title, description, icon, features, position, visible, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.title?.trim() || '', data.description?.trim() || '', data.icon || '', JSON.stringify(data.features || []), Number(data.position || 0), data.visible !== false, now, now]
      );
    } else {
      await pool.execute(
        `INSERT INTO experience (id, role, company, description, start_year, end_year, skills, position, visible, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.role?.trim() || '', data.company?.trim() || '', data.description?.trim() || '', Number(data.startYear), data.endYear ? Number(data.endYear) : null, JSON.stringify(data.skills || []), Number(data.position || 0), data.visible !== false, now, now]
      );
    }
    response.status(201).json({ ok: true, id });
  } catch (error) {
    console.error('Could not create content:', error.message);
    response.status(500).json({ error: 'No se pudo crear el contenido.' });
  }
});

app.put('/api/content/:type/:id', requireAdmin, async (request, response) => {
  const { type, id } = request.params;
  if (!adminMutationTables.has(type)) return response.status(405).json({ error: 'Tipo no editable.' });
  const data = request.body || {};
  try {
    const values = type === 'services'
      ? [data.title?.trim() || '', data.description?.trim() || '', data.icon || '', JSON.stringify(data.features || []), Number(data.position || 0), data.visible !== false, id]
      : [data.role?.trim() || '', data.company?.trim() || '', data.description?.trim() || '', Number(data.startYear), data.endYear ? Number(data.endYear) : null, JSON.stringify(data.skills || []), Number(data.position || 0), data.visible !== false, id];
    const sql = type === 'services'
      ? `UPDATE services SET title = ?, description = ?, icon = ?, features = ?, position = ?, visible = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`
      : `UPDATE experience SET role = ?, company = ?, description = ?, start_year = ?, end_year = ?, skills = ?, position = ?, visible = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`;
    const [result] = await pool.execute(sql, values);
    if (!result.affectedRows) return response.status(404).json({ error: 'Contenido no encontrado.' });
    response.json({ ok: true, id });
  } catch (error) {
    console.error('Could not update content:', error.message);
    response.status(500).json({ error: 'No se pudo actualizar el contenido.' });
  }
});

app.delete('/api/content/:type/:id', requireAdmin, async (request, response) => {
  const { type, id } = request.params;
  if (!adminMutationTables.has(type)) return response.status(405).json({ error: 'Tipo no editable.' });
  const [result] = await pool.execute(`DELETE FROM ${type} WHERE id = ?`, [id]);
  if (!result.affectedRows) return response.status(404).json({ error: 'Contenido no encontrado.' });
  response.json({ ok: true, id });
});

app.put('/api/content/:type', requireAdmin, async (request, response) => {
  const { type } = request.params;
  if (!['about_content', 'site_settings'].includes(type)) return response.status(405).json({ error: 'Tipo no válido.' });
  const data = request.body || {};
  const id = data.id || type;
  try {
    if (type === 'about_content') {
      await pool.execute(
        `INSERT INTO about_content (id, title, description, biography, photo_url, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), biography = VALUES(biography), photo_url = VALUES(photo_url), updated_at = UTC_TIMESTAMP()`,
        [id, data.title || '', data.description || '', data.biography || '', data.photoUrl || '']
      );
    } else {
      await pool.execute(
        `INSERT INTO site_settings (id, site_name, hero_title, hero_description, email, location, instagram_url, linkedin_url, github_url, profile_image_url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE site_name = VALUES(site_name), hero_title = VALUES(hero_title), hero_description = VALUES(hero_description), email = VALUES(email), location = VALUES(location), instagram_url = VALUES(instagram_url), linkedin_url = VALUES(linkedin_url), github_url = VALUES(github_url), profile_image_url = VALUES(profile_image_url), updated_at = UTC_TIMESTAMP()`,
        [id, data.siteName || '', data.heroTitle || '', data.heroDescription || '', data.email || '', data.location || '', data.instagramUrl || '', data.linkedinUrl || '', data.githubUrl || '', data.profileImageUrl || '']
      );
    }
    response.json({ ok: true, id });
  } catch (error) {
    console.error('Could not save singleton content:', error.message);
    response.status(500).json({ error: 'No se pudo guardar el contenido.' });
  }
});

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({
      ok: true,
      mysql: 'connected',
      firebase: firebaseConfigured ? 'configured' : 'not_configured',
      lastSyncAt
    });
  } catch (error) {
    console.error('MySQL health check failed:', error.message);
    response.status(503).json({ ok: false, mysql: 'disconnected' });
  }
});

app.post('/api/sync/projects', requireAdmin, async (_request, response) => {
  try {
    const result = await runProjectsSync();
    response.json({ ok: true, direction: 'bidirectional', ...result });
  } catch (error) {
    console.error('Could not sync projects:', error.message);
    response.status(503).json({ ok: false, error: error.message });
  }
});

app.post('/api/sync/projects/to-firebase', requireAdmin, async (_request, response) => {
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

app.post('/api/messages', async (request, response) => {
  const {
    name = '',
    email = '',
    phone = '',
    subject = '',
    message = ''
  } = request.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';

  if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
    response.status(400).json({ error: 'Todos los campos son obligatorios.' });
    return;
  }

  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    response.status(400).json({ error: 'El correo no es válido.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    await pool.execute(
      `INSERT INTO messages
        (id, name, email, phone, subject, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, cleanName, cleanEmail, cleanPhone, cleanSubject, cleanMessage, now, now]
    );
    await pool.execute(
      `INSERT INTO message_replies (id, message_id, sender, body, created_at) VALUES (?, ?, 'visitor', ?, ?)`,
      [crypto.randomUUID(), id, cleanMessage, now]
    );
    response.status(201).json({ ok: true, id });
  } catch (error) {
    console.error('Could not save contact message:', error.message);
    response.status(500).json({ error: 'No se pudo guardar el mensaje.' });
  }
});

app.get('/api/messages/:id/replies', requireAdmin, async (request, response) => {
  const [rows] = await pool.execute(
    'SELECT id, sender, body, created_at FROM message_replies WHERE message_id = ? ORDER BY created_at ASC',
    [request.params.id]
  );
  response.json(rows);
});

app.get('/api/public/messages/:id/replies', async (request, response) => {
  const [rows] = await pool.execute(
    `SELECT sender, body, created_at FROM message_replies WHERE message_id = ? ORDER BY created_at ASC`,
    [request.params.id]
  );
  response.json(rows);
});

app.post('/api/messages/:id/replies', requireAdmin, async (request, response) => {
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!body) return response.status(400).json({ error: 'La respuesta no puede estar vacía.' });
  const [messages] = await pool.execute('SELECT id FROM messages WHERE id = ? AND deleted_at IS NULL', [request.params.id]);
  if (!messages.length) return response.status(404).json({ error: 'Mensaje no encontrado.' });
  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO message_replies (id, message_id, sender, body, created_at) VALUES (?, ?, 'admin', ?, UTC_TIMESTAMP())`,
    [id, request.params.id, body]
  );
  await pool.execute("UPDATE messages SET status = 'read', updated_at = UTC_TIMESTAMP() WHERE id = ?", [request.params.id]);
  response.status(201).json({ ok: true, id });
});

app.get('/api/messages', requireAdmin, async (_request, response) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, subject, message, status, created_at
       FROM messages
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );
    response.json(rows);
  } catch (error) {
    console.error('Could not load contact messages:', error.message);
    response.status(500).json({ error: 'No se pudieron cargar los mensajes.' });
  }
});

app.patch('/api/messages/:id/read', requireAdmin, async (request, response) => {
  try {
    const [result] = await pool.execute(
      `UPDATE messages
       SET status = 'read', updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      [request.params.id]
    );
    if (!result.affectedRows) {
      response.status(404).json({ error: 'Mensaje no encontrado.' });
      return;
    }
    response.json({ ok: true, id: request.params.id, status: 'read' });
  } catch (error) {
    console.error('Could not mark message as read:', error.message);
    response.status(500).json({ error: 'No se pudo actualizar el mensaje.' });
  }
});

app.patch('/api/messages/:id/archive', requireAdmin, async (request, response) => {
  const [result] = await pool.execute(
    `UPDATE messages SET status = 'archived', updated_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL`,
    [request.params.id]
  );
  if (!result.affectedRows) return response.status(404).json({ error: 'Mensaje no encontrado.' });
  response.json({ ok: true, id: request.params.id, status: 'archived' });
});

app.delete('/api/messages/:id', requireAdmin, async (request, response) => {
  const [result] = await pool.execute(
    `UPDATE messages SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL`,
    [request.params.id]
  );
  if (!result.affectedRows) return response.status(404).json({ error: 'Mensaje no encontrado.' });
  response.json({ ok: true, id: request.params.id });
});

app.get('/api/stats', requireAdmin, async (_request, response) => {
  try {
    const [[projects], [services], [experience], [messages], [unread]] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM projects WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) AS total FROM services WHERE visible = TRUE'),
      pool.query('SELECT COUNT(*) AS total FROM experience WHERE visible = TRUE'),
      pool.query('SELECT COUNT(*) AS total FROM messages WHERE deleted_at IS NULL'),
      pool.query("SELECT COUNT(*) AS total FROM messages WHERE status = 'new' AND deleted_at IS NULL")
    ]);
    response.json({ projects: projects[0].total, services: services[0].total, experience: experience[0].total, messages: messages[0].total, unread: unread[0].total, lastSyncAt });
  } catch (error) {
    response.status(500).json({ error: 'No se pudieron cargar las estadísticas.' });
  }
});

app.post('/api/projects', requireAdmin, async (request, response) => {
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

app.put('/api/projects/:id', requireAdmin, async (request, response) => {
  const { title, description = '', imageUrl = '', projectUrl = '' } = request.body;
  const cleanTitle = typeof title === 'string' ? title.trim() : '';

  if (!cleanTitle) {
    response.status(400).json({ error: 'El título es obligatorio.' });
    return;
  }

  try {
    const [result] = await pool.execute(
      `UPDATE projects
       SET title = ?, description = ?, image_url = ?, project_url = ?, updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      [cleanTitle, description, imageUrl, projectUrl, request.params.id]
    );

    if (!result.affectedRows) {
      response.status(404).json({ error: 'Proyecto no encontrado.' });
      return;
    }

    response.json({ ok: true, id: request.params.id });
  } catch (error) {
    console.error('Could not update project:', error.message);
    response.status(500).json({ error: 'No se pudo actualizar el proyecto.' });
  }
});

app.delete('/api/projects/:id', requireAdmin, async (request, response) => {
  try {
    const [result] = await pool.execute(
      `UPDATE projects
       SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND deleted_at IS NULL`,
      [request.params.id]
    );

    if (!result.affectedRows) {
      response.status(404).json({ error: 'Proyecto no encontrado.' });
      return;
    }

    response.json({ ok: true, id: request.params.id });
  } catch (error) {
    console.error('Could not delete project:', error.message);
    response.status(500).json({ error: 'No se pudo eliminar el proyecto.' });
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
