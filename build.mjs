// Run npm ci, then npm run build after editing script.js or style.css.
// Readable sources are kept in the repository; index.html serves the small outputs.
import fs from 'node:fs';
import { minify } from 'terser';
import CleanCSS from 'clean-css';
const script = fs.readFileSync('script.js', 'utf8');
const js = await minify(script, { compress: true, mangle: true, format: { comments: false } });
const css = new CleanCSS({ level: 1, rebase: false }).minify(fs.readFileSync('style.css', 'utf8'));
if (css.errors.length) throw new Error(css.errors.join('\n'));
fs.writeFileSync('script.min.js', js.code + '\n');
fs.writeFileSync('style.min.css', css.styles + '\n');
console.log('Built script.min.js and style.min.css');
