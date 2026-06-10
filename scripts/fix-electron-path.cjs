const fs = require("node:fs");
const path = require("node:path");

const pathTxt = path.join(__dirname, "..", "node_modules", "electron", "path.txt");
fs.writeFileSync(pathTxt, "electron.exe", "utf8");
console.log("Wrote node_modules/electron/path.txt without a trailing newline.");
