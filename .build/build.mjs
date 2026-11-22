// Run npm ci --prefix .build && npm run build --prefix .build from the repository root.
// This tooling stays outside the static site's root build detection.
// Readable sources remain editable; committed small outputs are served by index.html.
import fs from 'node:fs';
import { minify } from 'terser';
import CleanCSS from 'clean-css';
const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('script.js', root), 'utf8');
const js = await minify(script, { compress: true, mangle: true, format: { comments: false } });
const css = new CleanCSS({ level: 1, rebase: false }).minify(fs.readFileSync(new URL('style.css', root), 'utf8'));
if (css.errors.length) throw new Error(css.errors.join('\n'));
fs.writeFileSync(new URL('script.min.js', root), js.code + '\n');
fs.writeFileSync(new URL('style.min.css', root), css.styles + '\n');
console.log('Built script.min.js and style.min.css');
