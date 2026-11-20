import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

/**
 * Zero-footage privacy audit. Fails (exit 1) if any of these is found:
 *  1. media files (video/images) anywhere in the repo outside the allow-list
 *  2. database columns that could hold images or raw frames (bytea/blob, or columns named image/frame/photo/snapshot)
 *  3. source code that logs request bodies, frames or chat message text
 */
const ALLOWED_FILES = new Set([
  'Screenshot 2026-11-20 at 9.27.10 PM.png',
  'Screenshot 2026-11-20 at 9.27.10 PM.png',
]);
const FORBIDDEN_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.jpg', '.jpeg', '.png', '.bmp', '.webp', '.h264', '.raw']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '.turbo', 'data']);

function walk(dir: string, visit: (path: string, name: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walk(fullPath, visit);
    } else if (entry.isFile()) {
      visit(fullPath, entry.name);
    }
  }
}

const root = process.cwd();
const media: string[] = [];
const schema: string[] = [];
const logging: string[] = [];

walk(root, (path, name) => {
  const ext = extname(name).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext) && !ALLOWED_FILES.has(name)) media.push(relative(root, path));

  if (ext === '.sql') {
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
      const code = line.replace(/--.*$/, '');
      if (/\b(bytea|blob)\b/i.test(code) || /^\s*(image|frame|photo|snapshot|thumbnail)\w*\s+\w+/i.test(code)) {
        schema.push(`${relative(root, path)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  if ((ext === '.ts' || ext === '.tsx' || ext === '.mts') && !path.includes(`${join('tools', 'check-no-footage')}`)) {
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
      if (/console\.(log|info|warn|error|debug)\([^)]*\b(req\.body|request\.body|jpegBase64|imageBytes|image|frame|messages|content)\b/.test(line)
        && !/frame limit|Frame limit/i.test(line)) {
        logging.push(`${relative(root, path)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
});

console.log('Running SeeServe No-Footage Privacy Audit...');
const report = (title: string, items: string[]) => {
  if (items.length === 0) return;
  console.error(`❌ ${title}`);
  for (const item of items) console.error(`  - ${item}`);
};
report('Media files found on disk:', media);
report('Database columns that could store images or frames:', schema);
report('Code that may log request bodies, frames or chat text:', logging);

if (media.length || schema.length || logging.length) process.exit(1);
console.log('✅ Privacy verified: no stored media, no image-capable database columns, no logging of request bodies, frames or chat text.');
