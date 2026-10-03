// Renders a published page logged-out. Usage: node test/share-smoke.mjs <pageId>
import { launch } from './cdp.mjs';
const p = await launch({ port: 9337 });
await p.goto(`${process.env.BASE_URL || 'http://localhost:3456'}/p/${process.argv[2]}`, 1800);
console.log('title:', await p.eval(`document.querySelector('h1.title')?.innerText`), '| blocks:', await p.eval(`document.querySelectorAll('.content .sb').length`));
await p.shot('40-share');
console.log('errors:', p.errors.join('\n') || 'none');
p.close(); process.exit(0);
