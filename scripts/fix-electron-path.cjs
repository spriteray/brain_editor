const fs = require('node:fs');
const path = require('node:path');
const electronDir = path.dirname(require.resolve('electron/package.json'));
const executables = {
  win32: 'electron.exe',
  darwin: 'Electron.app/Contents/MacOS/Electron',
  linux: 'electron'
};
const relativePath = executables[process.platform];
if (!relativePath || !fs.existsSync(path.join(electronDir, 'dist', relativePath))) {
  console.error('Electron executable is missing. Run npm run install:electron before repairing path.txt.');
  process.exit(1);
}
fs.writeFileSync(path.join(electronDir, 'path.txt'), relativePath, 'utf8');
console.log('Repaired Electron path.txt for this platform.');
