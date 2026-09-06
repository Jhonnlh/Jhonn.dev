import { firestore } from './firebase.js';
import { pool } from './db.js';
import { Timestamp } from 'firebase-admin/firestore';

function toDate(value) {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function syncProjectsFromFirebase() {
  if (!firestore) {
    throw new Error('Firebase no está configurado en el archivo .env.');
  }

  const snapshot = await firestore.collection('projects').get();
  let synced = 0;

  for (const document of snapshot.docs) {
    const data = document.data();
    const createdAt = toDate(data.createdAt || data.created_at);
    const updatedAt = toDate(data.updatedAt || data.updated_at || createdAt);
    const deletedAt = data.deletedAt || data.deleted_at
      ? toDate(data.deletedAt || data.deleted_at)
      : null;

    const [existingRows] = await pool.execute(
      'SELECT updated_at FROM projects WHERE id = ?',
      [document.id]
    );
    if (existingRows[0] && new Date(existingRows[0].updated_at) > updatedAt) {
      continue;
    }

    await pool.execute(
      `INSERT INTO projects
        (id, title, description, image_url, project_url, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        image_url = VALUES(image_url),
        project_url = VALUES(project_url),
        updated_at = VALUES(updated_at),
        deleted_at = VALUES(deleted_at)`,
      [
        document.id,
        cleanText(data.title),
        cleanText(data.description),
        cleanText(data.imageUrl || data.image_url),
        cleanText(data.projectUrl || data.project_url),
        createdAt,
        updatedAt,
        deletedAt
      ]
    );
    synced += 1;
  }

  return { synced };
}

export async function syncProjectsToFirebase() {
  if (!firestore) {
    throw new Error('Firebase no está configurado en el archivo .env.');
  }

  const [rows] = await pool.query(
    `SELECT id, title, description, image_url, project_url, created_at, updated_at, deleted_at
     FROM projects`
  );
  let synced = 0;

  for (const project of rows) {
    const reference = firestore.collection('projects').doc(project.id);
    const remoteSnapshot = await reference.get();
    const remoteData = remoteSnapshot.exists ? remoteSnapshot.data() : null;
    const localUpdatedAt = new Date(project.updated_at);
    const remoteUpdatedAt = remoteData
      ? toDate(remoteData.updatedAt || remoteData.updated_at)
      : null;

    if (project.deleted_at) {
      if (!remoteUpdatedAt || remoteUpdatedAt <= localUpdatedAt) {
        await reference.delete();
        synced += 1;
      }
      continue;
    }

    if (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt) {
      continue;
    }

    await reference.set({
      title: project.title,
      description: project.description || '',
      imageUrl: project.image_url || '',
      projectUrl: project.project_url || '',
      createdAt: Timestamp.fromDate(new Date(project.created_at)),
      updatedAt: Timestamp.fromDate(localUpdatedAt),
      deletedAt: project.deleted_at ? Timestamp.fromDate(new Date(project.deleted_at)) : null
    }, { merge: true });
    synced += 1;
  }

  return { synced };
}

export async function syncMessagesFromFirebase() {
  if (!firestore) {
    throw new Error('Firebase no está configurado en el archivo .env.');
  }

  const snapshot = await firestore.collection('contactMessages').get();
  let synced = 0;

  for (const document of snapshot.docs) {
    const data = document.data();
    const createdAt = toDate(data.createdAt || data.created_at);
    const updatedAt = toDate(data.updatedAt || data.updated_at || createdAt);
    const status = ['new', 'read', 'archived'].includes(data.status) ? data.status : 'new';

    await pool.execute(
      `INSERT INTO messages
        (id, name, email, phone, subject, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        email = VALUES(email),
        phone = VALUES(phone),
        subject = VALUES(subject),
        message = VALUES(message),
        status = VALUES(status),
        updated_at = VALUES(updated_at)`,
      [
        document.id,
        cleanText(data.name),
        cleanText(data.email),
        cleanText(data.phone),
        cleanText(data.subject),
        cleanText(data.message),
        status,
        createdAt,
        updatedAt
      ]
    );
    synced += 1;
  }

  return { synced };
}