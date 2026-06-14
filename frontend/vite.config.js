import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localAtlasRoot = path.resolve(__dirname, '.local-source-assets', 'atlas-ednea')
const atlasRoutePrefix = '/knowledge/source-assets/atlas-ednea/'
const localPdfSourcesRoot = path.resolve(__dirname, '.local-source-assets', 'pdf-sources')
const pdfSourcesRoutePrefix = '/knowledge/source-assets/pdf-sources/'

function contentTypeFor(filePath) {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

function serveLocalSourceFile({ req, res, next, root, routePrefix }) {
  const requestPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
  if (!requestPath.startsWith(routePrefix)) {
    next()
    return
  }

  const relativePath = requestPath.slice(routePrefix.length)
  const candidatePath = path.resolve(root, relativePath)
  const relativeFromRoot = path.relative(root, candidatePath)
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  fs.stat(candidatePath, (error, stats) => {
    if (error || !stats.isFile()) {
      next()
      return
    }

    res.setHeader('Content-Type', contentTypeFor(candidatePath))
    res.setHeader('Cache-Control', 'no-store')
    fs.createReadStream(candidatePath).pipe(res)
  })
}

function localAtlasSourcesPlugin() {
  return {
    name: 'local-atlas-sources',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serveLocalSourceFile({ req, res, next, root: localAtlasRoot, routePrefix: atlasRoutePrefix })
      })
      server.middlewares.use((req, res, next) => {
        serveLocalSourceFile({ req, res, next, root: localPdfSourcesRoot, routePrefix: pdfSourcesRoutePrefix })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        serveLocalSourceFile({ req, res, next, root: localAtlasRoot, routePrefix: atlasRoutePrefix })
      })
      server.middlewares.use((req, res, next) => {
        serveLocalSourceFile({ req, res, next, root: localPdfSourcesRoot, routePrefix: pdfSourcesRoutePrefix })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [localAtlasSourcesPlugin(), react()],
})
