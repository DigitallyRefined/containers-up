import { startServer } from '@/backend';
import { host } from '@/backend/db/host';
import { checkHostForImageUpdates } from '@/backend/endpoints/update-check';
import { checkIfDatabaseNeedsUpdating } from '@/backend/db/migrations';
import { setCrontab } from '@/backend/endpoints/host';
import { mainLogger } from '@/backend/utils/logger';

if (process.argv.includes('--check-for-updates')) {
  const argIndex = process.argv.indexOf('--check-for-updates');
  const context = process.argv[argIndex + 1];
  if (!context) mainLogger.error('No context provided for update check');

  const selectedHost = await host.getByName(context);
  if (!selectedHost) {
    mainLogger.error('Host not found');
    process.exit(1);
  }

  mainLogger.info('Checking for updates...');
  await checkHostForImageUpdates(selectedHost);
} else {
  await checkIfDatabaseNeedsUpdating();
  await setCrontab();
  startServer();
}
