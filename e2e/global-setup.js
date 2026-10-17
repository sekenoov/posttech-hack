const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function globalSetup() {
  if (process.env.E2E_RESET !== '1') return;
  const root = path.resolve(__dirname, '..');
  // Demo environment only: drops and re-seeds the synthetic database.
  execSync('docker compose exec -T backend python seed.py --reset', { cwd: root, stdio: 'inherit' });
};
