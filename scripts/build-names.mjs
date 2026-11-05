// Builds src/generated/names.json (dataId -> name) from the clash-of-clans-data package.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'node_modules', 'clash-of-clans-data', 'data');
const outFile = join(root, 'src', 'generated', 'names.json');

const names = new Map();

function collect(node, file) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, file);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (typeof node.dataId === 'number' && typeof node.name === 'string') {
    const known = names.get(node.dataId);
    if (known !== undefined && known !== node.name) {
      throw new Error(`dataId ${node.dataId} has two names: "${known}" and "${node.name}" (${file})`);
    }
    names.set(node.dataId, node.name);
  }
  for (const value of Object.values(node)) collect(value, file);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.json')) collect(JSON.parse(readFileSync(path, 'utf8')), path);
  }
}

walk(dataDir);

const sorted = Object.fromEntries([...names].sort(([a], [b]) => a - b).map(([id, name]) => [String(id), name]));
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(sorted, null, 2) + '\n');
console.log(`Wrote ${names.size} names to ${outFile}`);
