import { query } from './db';
import { log } from './log';

export async function audit(userEmail: string | null, action: string, details: Record<string, unknown> = {}) {
  try {
    await query('INSERT INTO audit_logs (user_email, action, details) VALUES ($1, $2, $3)', [userEmail, action, JSON.stringify(details)]);
  } catch (e) {
    log.warn('audit', `Could not record "${action}"`, e);
  }
}

export async function notify(kind: 'info' | 'success' | 'warning' | 'error', title: string, body = '', link = '') {
  try {
    await query('INSERT INTO notifications (kind, title, body, link) VALUES ($1, $2, $3, $4)', [kind, title, body, link || null]);
  } catch (e) {
    log.warn('notify', `Could not save notification "${title}"`, e);
  }
}
