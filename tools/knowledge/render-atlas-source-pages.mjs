import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_PDF = 'C:/Users/m/Downloads/Ednea Martins - Atlas dos Pontos de Acupuntura - Guia de Localização (1).pdf';
const DEFAULT_SOURCE_INDEX = path.join(projectRoot, 'frontend', 'public', 'knowledge', 'source-assets', 'atlas-ednea', 'source-index.json');
const DEFAULT_LOCAL_ROOT = path.join(projectRoot, 'frontend', '.local-source-assets', 'atlas-ednea');
const DEFAULT_LOCAL_INDEX = path.join(DEFAULT_LOCAL_ROOT, 'source-index.local.json');
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_LOCAL_ROOT, 'pages');
const DEFAULT_SCALE = 1.65;
const DEFAULT_QUALITY = 86;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function splitArg(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizePointCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function toPageFileName(page, extension = 'webp') {
  return `page-${String(page).padStart(3, '0')}.${extension}`;
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error('Chrome ou Edge nao encontrado. Informe --chrome com o caminho do executavel.');
}

async function findPdfJs() {
  const bundledRoot = path.join(
    os.homedir(),
    '.cache',
    'codex-runtimes',
    'codex-primary-runtime',
    'dependencies',
    'node',
    'node_modules',
    'pdfjs-dist',
    'legacy',
    'build',
  );
  const projectRootCandidate = path.join(projectRoot, 'frontend', 'node_modules', 'pdfjs-dist', 'legacy', 'build');
  const candidates = [bundledRoot, projectRootCandidate];

  for (const root of candidates) {
    const pdf = path.join(root, 'pdf.mjs');
    const worker = path.join(root, 'pdf.worker.mjs');
    if ((await pathExists(pdf)) && (await pathExists(worker))) {
      return { pdf, worker };
    }
  }

  throw new Error('pdfjs-dist nao encontrado no runtime local nem no frontend/node_modules.');
}

function collectPages(sourceIndex, args) {
  const pageSet = new Set();
  const explicitPages = splitArg(args.pages).map(Number).filter(Number.isFinite);
  explicitPages.forEach(page => pageSet.add(page));

  const codes = splitArg(args.codes || args.code);
  if (codes.length) {
    for (const code of codes) {
      const normalized = normalizePointCode(code);
      const item = sourceIndex.items.find(candidate => {
        return normalizePointCode(candidate.code) === normalized
          || normalizePointCode(candidate.displayCode) === normalized;
      });
      if (!item) {
        console.warn(`Codigo nao encontrado no indice: ${code}`);
        continue;
      }
      (item.pdfPages || []).forEach(page => pageSet.add(Number(page)));
    }
  }

  if (!pageSet.size && args.all) {
    for (const item of sourceIndex.items) {
      (item.pdfPages || []).forEach(page => pageSet.add(Number(page)));
    }
  }

  const pages = [...pageSet].filter(Number.isFinite).sort((a, b) => a - b);
  const limit = Number(args.limit || 0);
  return limit > 0 ? pages.slice(0, limit) : pages;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function waitForEndpoint(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await getJson(url);
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timeout aguardando ${url}`);
}

function createCdpClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();

    ws.onopen = () => {
      resolve({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej }));
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = error => reject(error);
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        rej(new Error(message.error.message));
      } else {
        res(message.result);
      }
    };
  });
}

function renderHtml({ pdfUrl, pdfJsUrl, workerUrl }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; background: #fff; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="page"></canvas>
    <script type="module">
      try {
        const pdfjsLib = await import(${JSON.stringify(pdfJsUrl)});
        pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(workerUrl)};
        const pdf = await pdfjsLib.getDocument({ url: ${JSON.stringify(pdfUrl)} }).promise;

        window.__renderAtlasPage = async function renderAtlasPage(pageNumber, scale, quality) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const canvas = document.getElementById('page');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          document.documentElement.style.width = canvas.width + 'px';
          document.documentElement.style.height = canvas.height + 'px';
          document.body.style.width = canvas.width + 'px';
          document.body.style.height = canvas.height + 'px';
          const context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;

          return {
            width: canvas.width,
            height: canvas.height,
            dataUrl: canvas.toDataURL('image/webp', quality),
          };
        };

        window.__rendererReady = true;
      } catch (error) {
        window.__renderError = String(error && error.stack || error);
      }
    </script>
  </body>
</html>`;
}

async function waitForRenderer(client) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const result = await client.send('Runtime.evaluate', {
      expression: '({ ready: !!window.__rendererReady, error: window.__renderError || null })',
      returnByValue: true,
    });
    const value = result.result.value;
    if (value.ready) return;
    if (value.error) throw new Error(value.error);
    await delay(250);
  }
  throw new Error('Timeout aguardando renderer do Atlas.');
}

async function renderPage(client, options) {
  if (!options.force && await pathExists(options.outputPath)) {
    return {
      skipped: true,
      bytes: fsSync.statSync(options.outputPath).size,
    };
  }

  const evaluation = await client.send('Runtime.evaluate', {
    expression: `window.__renderAtlasPage(${Number(options.page)}, ${Number(options.scale)}, ${Number(options.quality / 100)})`,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.text || `Falha ao renderizar pagina PDF ${options.page}`);
  }

  const result = evaluation.result.value;
  const [, base64] = String(result.dataUrl || '').split(',');
  if (!base64) throw new Error(`Canvas nao retornou imagem para pagina PDF ${options.page}`);

  await fs.writeFile(options.outputPath, Buffer.from(base64, 'base64'));

  return {
    width: result.width,
    height: result.height,
    bytes: fsSync.statSync(options.outputPath).size,
  };
}

function refreshLocalIndex(sourceIndex, outputDir) {
  const renderedPages = new Set(
    fsSync.existsSync(outputDir)
      ? fsSync.readdirSync(outputDir)
        .map(file => file.match(/^page-(\d+)\.webp$/)?.[1])
        .filter(Boolean)
        .map(value => Number(value))
      : [],
  );

  const items = sourceIndex.items.map(item => {
    const imageUrls = (item.pdfPages || []).map(pdfPage => {
      const page = Number(pdfPage);
      const rendered = renderedPages.has(page);
      return {
        pdfPage: page,
        url: rendered ? `/knowledge/source-assets/atlas-ednea/pages/${toPageFileName(page)}` : null,
        status: rendered ? 'rendered_local' : 'not_rendered',
      };
    });
    return {
      ...item,
      imageAvailable: imageUrls.some(image => Boolean(image.url)),
      imageUrls,
    };
  });

  return {
    ...sourceIndex,
    generatedAt: new Date().toISOString(),
    assetMode: 'local_rendered_pages',
    counts: {
      ...sourceIndex.counts,
      withImages: items.filter(item => item.imageAvailable).length,
      renderedPages: renderedPages.size,
    },
    items,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = path.resolve(args.pdf || DEFAULT_PDF);
  const sourceIndexPath = path.resolve(args.index || DEFAULT_SOURCE_INDEX);
  const localIndexPath = path.resolve(args.localIndex || DEFAULT_LOCAL_INDEX);
  const outputDir = path.resolve(args.outputDir || DEFAULT_OUTPUT_DIR);
  const scale = Number(args.scale || DEFAULT_SCALE);
  const quality = Number(args.quality || DEFAULT_QUALITY);
  const force = Boolean(args.force);

  if (!globalThis.WebSocket) {
    throw new Error('Esta versao do Node nao expoe WebSocket global. Use Node 22+ ou 24+.');
  }

  const sourceIndex = JSON.parse(await fs.readFile(sourceIndexPath, 'utf8'));
  const pages = collectPages(sourceIndex, args);
  if (!pages.length) {
    throw new Error('Nenhuma pagina selecionada. Use --codes LU1,LI4, --pages 69,70 ou --all.');
  }

  const chromePath = await findChrome(args.chrome);
  const pdfJs = await findPdfJs();
  const tempRoot = path.join(os.tmpdir(), `atlas-source-render-${Date.now()}`);
  const userDataDir = path.join(tempRoot, 'chrome-profile');
  const htmlPath = path.join(tempRoot, 'render.html');
  const port = Number(args.port || 9347);
  const pdfUrl = pathToFileURL(pdfPath).href;
  const pdfJsUrl = pathToFileURL(pdfJs.pdf).href;
  const workerUrl = pathToFileURL(pdfJs.worker).href;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-web-security',
    '--allow-file-access-from-files',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForEndpoint(`http://127.0.0.1:${port}/json/version`);
    const target = await getJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const client = await createCdpClient(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await fs.writeFile(htmlPath, renderHtml({ pdfUrl, pdfJsUrl, workerUrl }), 'utf8');
    await client.send('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await waitForRenderer(client);

    for (const page of pages) {
      const outputPath = path.join(outputDir, toPageFileName(page));
      const rendered = await renderPage(client, {
        page,
        scale,
        quality,
        force,
        outputPath,
      });
      if (rendered.skipped) {
        console.log(`Skipped PDF page ${page}: ${path.relative(projectRoot, outputPath)} already exists (${rendered.bytes} bytes)`);
      } else {
        console.log(`Rendered PDF page ${page}: ${path.relative(projectRoot, outputPath)} (${rendered.width}x${rendered.height}, ${rendered.bytes} bytes)`);
      }
    }

    client.close();
  } finally {
    chrome.kill();
    await delay(500);
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Aviso: nao foi possivel limpar pasta temporaria agora (${error.code || error.message}).`);
    }
  }

  const localIndex = refreshLocalIndex(sourceIndex, outputDir);
  await fs.writeFile(localIndexPath, `${JSON.stringify(localIndex, null, 2)}\n`, 'utf8');
  console.log(`Local source index written: ${path.relative(projectRoot, localIndexPath)}`);
  console.log(`Rendered pages available: ${localIndex.counts.renderedPages}`);
}

await main();
