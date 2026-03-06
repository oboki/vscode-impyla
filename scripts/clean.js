const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "out");
const nodeModulesDir = path.join(projectRoot, "node_modules");

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log("Removed out/");
} else {
  console.log("No out/ directory to remove");
}

if (fs.existsSync(nodeModulesDir)) {
  fs.rmSync(nodeModulesDir, { recursive: true, force: true });
  console.log("Removed node_modules/");
} else {
  console.log("No node_modules/ directory to remove");
}

for (const fileName of fs.readdirSync(projectRoot)) {
  if (fileName.endsWith(".vsix")) {
    fs.rmSync(path.join(projectRoot, fileName), { force: true });
    console.log(`Removed ${fileName}`);
  }
}
