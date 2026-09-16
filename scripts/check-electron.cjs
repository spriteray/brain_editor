const fs = require('node:fs');
const path = require('node:path');
const electronDir = path.dirname(require.resolve('electron/package.json'));
const marker = path.join(electronDir, 'path.txt');
let executable;
try {
  const relativePath = fs.readFileSync(marker, 'utf8').trim();
  executable = path.join(electronDir, 'dist', relativePath);
  if (!relativePath || !fs.existsSync(executable)) throw new Error('Missing Electron executable.');
} catch {
  console.error('Electron binary is incomplete. Run npm run install:electron to download it again.');
  process.exit(1);
}
console.log(`Electron ${require('electron/package.json').version} binary is ready: ${executable}`);
