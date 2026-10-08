import './env';
import { createApp } from './app';
import { pool } from '@/server/db';
import { log } from '@/server/log';
import { syncScopusListIfStale, scheduleNightlyScopusCheck } from '@/server/lookup/scopusList';

const port = Number(process.env.PORT ?? 4000);
// Loopback by default: the API is reached through the web tier, never directly from the
// internet. A container sets HOST=0.0.0.0 so its sibling containers can reach it.
const host = process.env.HOST ?? '127.0.0.1';

if (!process.env.APP_URL) {
  throw new Error('APP_URL is not set — it must be the exact origin of the web tier, for CSRF origin checks');
}

const server = createApp().listen(port, host, () => {
  log.info('api listening', { url: `http://${host}:${port}`, appUrl: process.env.APP_URL });
  // Quartile and Scopus indexing come from Elsevier's public Scopus list: fetch it in the
  // background when it is missing or over a month old, then look for a newer one every night
  // at 2 AM India time. Never blocks or crashes start-up.
  void syncScopusListIfStale();
  scheduleNightlyScopusCheck();
});

function shutdown(signal: string) {
  log.info('api shutting down', { signal });
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
