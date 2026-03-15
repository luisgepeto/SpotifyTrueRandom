import 'dotenv/config';
import cron from 'node-cron';
import { reconcileAllUsers } from './reconcile.js';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 * * * *'; // Every hour by default

console.log('🎵 TrueRandom Cron Service');
console.log('─'.repeat(50));
console.log(`Schedule: ${CRON_SCHEDULE}`);
console.log(`Started at: ${new Date().toISOString()}\n`);

// Run immediately on startup
console.log('Running initial reconciliation...');
reconcileAllUsers().then(() => {
  console.log(`Next run scheduled per cron: ${CRON_SCHEDULE}\n`);
});

// Schedule recurring runs
cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`\n⏰ Scheduled reconciliation triggered at ${new Date().toISOString()}`);
  await reconcileAllUsers();
});
