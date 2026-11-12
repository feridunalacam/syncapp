#!/usr/bin/env node
// Offline, bounded inventory: packages observed in the reviewed iOS production source map.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const inputsPath = 'scripts/notices/inputs.json';
const inputs = JSON.parse(read(inputsPath));
const lock = JSON.parse(read('package-lock.json')).packages;
const check = process.argv.includes('--check');
const sections = new Map();
const mapFlag = process.argv.indexOf('--source-map');
if (mapFlag !== -1) {
  if (check) throw new Error('Use --source-map to refresh, then --check to verify without writes.');
  const mapPath = process.argv[mapFlag + 1];
  if (!mapPath)
    throw new Error('--source-map requires the reviewed iOS production source map path.');
  const mapText = readFileSync(mapPath, 'utf8');
  const map = JSON.parse(mapText);
  const packagePaths = new Set();
  for (const source of map.sources) {
    const start = source.indexOf('node_modules/');
    if (start < 0) continue;
    const parts = source.slice(start).split('/');
    const index = parts.lastIndexOf('node_modules');
    const end = index + (parts[index + 1].startsWith('@') ? 3 : 2);
    if (parts.includes('..')) throw new Error(`Unexpected source path: ${source}`);
    packagePaths.add(parts.slice(0, end).join('/'));
  }
  const previous = new Map(inputs.packages.map((entry) => [entry.path, entry]));
  inputs.packages = [...packagePaths].sort().map((packagePath) => {
    const pkg = JSON.parse(read(`${packagePath}/package.json`));
    return {
      path: packagePath,
      name: pkg.name,
      version: pkg.version,
      ...(previous.get(packagePath)?.licenseFiles
        ? { licenseFiles: previous.get(packagePath).licenseFiles }
        : {}),
    };
  });
  inputs.scope.productionSourceMapSha256 = hash(mapText);
  inputs.scope.sourceCount = map.sources.length;
}

function add(component, text, source) {
  const normalized = text.trim();
  if (!normalized) throw new Error(`Empty notice for ${component}`);
  const id = hash(normalized);
  const section = sections.get(id) || { id, components: [], text: normalized, sources: [] };
  section.components.push(component);
  if (!section.sources.includes(source)) section.sources.push(source);
  sections.set(id, section);
}

for (const entry of inputs.packages) {
  const pkg = JSON.parse(read(`${entry.path}/package.json`));
  if (
    pkg.name !== entry.name ||
    pkg.version !== entry.version ||
    lock[entry.path]?.version !== entry.version
  )
    throw new Error(
      `Inventory/version changed: ${entry.path}. Refresh the production source-map inventory.`,
    );
  const licenseFiles =
    entry.licenseFiles ||
    readdirSync(path.join(root, entry.path))
      .filter((name) => /^(licen[cs]e|notice|copying|copyright)([.\-_]|$)/i.test(name))
      .map((name) => `${entry.path}/${name}`)
      .sort();
  if (!licenseFiles.length) throw new Error(`No verified license text for ${entry.name}`);
  for (const file of licenseFiles) add(`${entry.name} ${entry.version}`, read(file), file);
}
for (const entry of inputs.additional) add(entry.component, read(entry.file), entry.source);
for (const entry of JSON.parse(read('scripts/notices/native-notices.json')).notices)
  add(entry.component, entry.text, entry.source);

const notices = [...sections.values()]
  .map((entry) => ({
    ...entry,
    components: [...new Set(entry.components)].sort(),
    sources: entry.sources.sort(),
  }))
  .sort((a, b) => a.components[0].localeCompare(b.components[0], 'en'));
const output =
  JSON.stringify(
    {
      scope: inputs.scope,
      packageCount: inputs.packages.length,
      notices,
    },
    null,
    2,
  ) + '\n';
const destination = 'src/data/openSourceNotices.json';
if (check) {
  if (read(destination) !== output)
    throw new Error('Notices are stale. Run node scripts/generate-open-source-notices.mjs');
} else {
  writeFileSync(path.join(root, destination), output);
  if (mapFlag !== -1)
    writeFileSync(path.join(root, inputsPath), JSON.stringify(inputs, null, 2) + '\n');
}
console.log(
  `${check ? 'Verified' : 'Generated'} ${inputs.packages.length} runtime packages; ${notices.length} distinct notice texts (${Buffer.byteLength(output)} bytes).`,
);
