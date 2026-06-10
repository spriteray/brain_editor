const fs = require("node:fs");
const path = require("node:path");

const electronDir = path.join(__dirname, "..", "node_modules", "electron");
const pathTxt = path.join(electronDir, "path.txt");
const exe = path.join(electronDir, "dist", "electron.exe");

const ok = fs.existsSync(pathTxt) && fs.existsSync(exe);

if (ok) {
  console.log("Electron binary is ready.");
  process.exit(0);
}

console.error("Electron binary is incomplete.");
console.error(`Missing path.txt: ${!fs.existsSync(pathTxt)}`);
console.error(`Missing electron.exe: ${!fs.existsSync(exe)}`);
console.error("");
console.error("Try:");
console.error('$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"');
console.error('$env:npm_config_electron_mirror="https://npmmirror.com/mirrors/electron/"');
console.error("node .\\node_modules\\electron\\install.js");
process.exit(1);
