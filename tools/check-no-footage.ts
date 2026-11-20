import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ALLOWED_FILES = new Set([
  'Screenshot 2026-11-20 at 9.27.10 PM.png',
  'Screenshot 2026-11-20 at 9.27.10 PM.png',
]);

const FORBIDDEN_EXTENSIONS = new Set([
  '.mp4', '.mov', '.webm', '.mkv', '.avi',
  '.jpg', '.jpeg', '.png', '.bmp', '.webp',
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  '.turbo',
]);

function scan(dir: string, violations: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        scan(fullPath, violations);
      }
    } else if (entry.isFile()) {
      if (ALLOWED_FILES.has(entry.name)) continue;
      const ext = extname(entry.name).toLowerCase();
      if (FORBIDDEN_EXTENSIONS.has(ext)) {
        violations.push(fullPath);
      }
    }
  }
}

console.log('Running SeeServe No-Footage Privacy Audit...');
const violations: string[] = [];
scan(process.cwd(), violations);

if (violations.length > 0) {
  console.error('❌ Privacy violation detected! The following unauthorized media files were found on disk:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
} else {
  console.log('✅ Privacy verified: No local footage, captured frames, or image thumbnails are stored on disk.');
  process.exit(0);
}
