import { startServer } from '@/backend';
import { host } from '@/backend/db/host';
import { checkHostForImageUpdates } from './backend/endpoints/update-check';
import { checkIfDatabaseNeedsUpdating } from './backend/db/migrations';

if (process.argv.includes('--check-for-updates')) {
  const argIndex = process.argv.indexOf('--check-for-updates');
  const context = process.argv[argIndex + 1];
  if (!context) console.error('No context provided for update check');

  const selectedHost = await host.getByName(context);
  if (!selectedHost) {
    console.error('Host not found');
    process.exit(1);
  }

  console.log('Checking for updates...');
  await checkHostForImageUpdates(selectedHost);
} else {
    await checkIfDatabaseNeedsUpdating();
    startServer();
}
