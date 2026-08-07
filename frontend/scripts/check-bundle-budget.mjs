import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const maxMainRaw = Number(process.env.BUNDLE_MAIN_RAW_MAX || 1_900_000);
const maxMainGzip = Number(process.env.BUNDLE_MAIN_GZIP_MAX || 500_000);
const maxTotalGzip = Number(process.env.BUNDLE_TOTAL_JS_GZIP_MAX || 2_000_000);

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const mainMatch = html.match(/<script[^>]+src=["']\/?([^"']+\.js)["']/i);
if (!mainMatch) {
  throw new Error('Não foi possível localizar o bundle principal em dist/index.html.');
}

const mainPath = path.join(dist, ...mainMatch[1].split('/'));
const mainSource = await readFile(mainPath);
const mainRaw = mainSource.byteLength;
const mainGzip = gzipSync(mainSource).byteLength;

const jsFiles = (await readdir(assets))
  .filter(file => file.endsWith('.js'));
let totalGzip = 0;
for (const file of jsFiles) {
  totalGzip += gzipSync(await readFile(path.join(assets, file))).byteLength;
}

const failures = [];
if (mainRaw > maxMainRaw) {
  failures.push(`bundle principal ${mainRaw} bytes > limite ${maxMainRaw}`);
}
if (mainGzip > maxMainGzip) {
  failures.push(`bundle principal gzip ${mainGzip} bytes > limite ${maxMainGzip}`);
}
if (totalGzip > maxTotalGzip) {
  failures.push(`JavaScript total gzip ${totalGzip} bytes > limite ${maxTotalGzip}`);
}

const mainStats = await stat(mainPath);
console.log(JSON.stringify({
  main: path.relative(dist, mainPath),
  mainRawBytes: mainStats.size,
  mainGzipBytes: mainGzip,
  totalJsGzipBytes: totalGzip,
  jsChunks: jsFiles.length,
}, null, 2));

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
