// Builds the deployable site into ./public : public/index.html + public/app.js
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, copyFileSync } from 'node:fs';
const order = ['core', 'ui', 'orders', 'ppc', 'depts', 'misc'];
mkdirSync('public', { recursive: true });
const js = order.map(n => `/* ---- src/${n}.js ---- */\n` + readFileSync(`src/${n}.js`, 'utf8')).join('\n');
const page = readFileSync('src/page.html', 'utf8');
const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
mkdirSync('public', { recursive: true });
writeFileSync('public/app.js', js);
// own-domain build: Supabase client + backend adapter load before app.js (the claude.ai version provides these itself)
const backendTags = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n<script src="backend.js"></script>\n';
const pageOwn = page.replace('<script src="app.js"></script>', backendTags + '<script src="app.js"></script>');
if (pageOwn === page) throw new Error('app.js script tag not found in src/page.html');
copyFileSync('src/backend.js', 'public/backend.js');
if (existsSync('seed')) cpSync('seed', 'public/seed', { recursive: true });
writeFileSync('public/index.html', head + pageOwn + '\n</body>\n</html>\n');
console.log(`Built public/index.html and public/app.js (${(js.length / 1024).toFixed(0)} KB)`);
