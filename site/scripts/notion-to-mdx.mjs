#!/usr/bin/env node
/**
 * notion-to-mdx.mjs — convert a Notion **HTML** export into an Astro `.mdx` note.
 *
 * Why HTML (not the Markdown export)? Notion's markdown export flattens toggles,
 * columns, and callouts (markdown can't express them). The HTML export keeps them
 * as <details>, .column-list, and .callout — so it's the lossless source.
 *
 * Zero dependencies: uses a small built-in HTML parser (Node built-ins only).
 *
 * Usage:
 *   node scripts/notion-to-mdx.mjs <export.html> [options]
 *
 * Options:
 *   --out=<path>          Output .mdx path (default: src/content/<collection>/<topic>/<slug>.mdx)
 *   --collection=<name>   notes | writing | projects        (default: notes)
 *   --topic=<name>        Topic (notes only; default: parent dir of --out, else "misc")
 *   --slug=<name>         URL slug / filename                (default: slugified title)
 *   --title=<text>        Override the page title
 *   --description=<text>  Override the description          (default: first paragraph)
 *   --date=<YYYY-MM-DD>   pubDate (Notion HTML has none)    (default: today)
 *   --tags=a,b,c          Tag references                    (default: none)
 *   --hero=<path>         heroImage path (default: topic stock photo, if known)
 *   --stdout              Print MDX to stdout instead of writing a file
 *
 * Example:
 *   node scripts/notion-to-mdx.mjs "src/content/notes/economics/Notes on ....html" \
 *     --topic=economics --slug=against-platforms --date=2025-05-23 \
 *     --tags=prosperity-project
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────── args ──────────
const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
	argv
		.filter((a) => a.startsWith('--'))
		.map((a) => {
			const [k, ...v] = a.slice(2).split('=');
			return [k, v.length ? v.join('=') : true];
		}),
);

if (!input) {
	console.error('Usage: node scripts/notion-to-mdx.mjs <export.html> [--topic=x] [--slug=y] ...');
	process.exit(1);
}

const HERO_BY_TOPIC = {
	economics: 'economics-stockphoto.jpeg',
	philosophy: 'philosophy-stockphoto.jpeg',
	engineering: 'engineering-stockphoto.jpg',
};

// ───────────────────────────────────────────────── tiny HTML parser ────────
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'col', 'area', 'base', 'source']);

function parseHTML(html) {
	const root = { type: 'root', tag: 'root', attrs: {}, children: [] };
	const stack = [root];
	const top = () => stack[stack.length - 1];
	const pushText = (v) => v && top().children.push({ type: 'text', value: v });
	let i = 0;
	while (i < html.length) {
		const lt = html.indexOf('<', i);
		if (lt < 0) {
			pushText(html.slice(i));
			break;
		}
		if (lt > i) pushText(html.slice(i, lt));
		if (html.startsWith('<!--', lt)) {
			const end = html.indexOf('-->', lt);
			i = end < 0 ? html.length : end + 3;
			continue;
		}
		if (html[lt + 1] === '!') {
			// doctype / CDATA
			const end = html.indexOf('>', lt);
			i = end < 0 ? html.length : end + 1;
			continue;
		}
		const gt = html.indexOf('>', lt);
		if (gt < 0) {
			pushText(html.slice(lt));
			break;
		}
		let tag = html.slice(lt + 1, gt).trim();
		i = gt + 1;

		if (tag.startsWith('/')) {
			const name = tag.slice(1).trim().toLowerCase();
			for (let s = stack.length - 1; s > 0; s--) {
				if (stack[s].tag === name) {
					stack.length = s;
					break;
				}
			}
			continue;
		}

		let selfClose = tag.endsWith('/');
		if (selfClose) tag = tag.slice(0, -1).trim();
		const sp = tag.search(/\s/);
		const name = (sp < 0 ? tag : tag.slice(0, sp)).toLowerCase();
		const attrs = parseAttrs(sp < 0 ? '' : tag.slice(sp + 1));
		const el = { type: 'element', tag: name, attrs, children: [] };
		top().children.push(el);

		if (selfClose || VOID.has(name)) continue;
		if (name === 'style' || name === 'script') {
			// raw-text elements: swallow until the matching close tag
			const close = `</${name}>`;
			const ce = html.indexOf(close, i);
			i = ce < 0 ? html.length : ce + close.length;
			continue;
		}
		stack.push(el);
	}
	return root;
}

function parseAttrs(str) {
	const attrs = {};
	const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	let m;
	while ((m = re.exec(str))) {
		attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
	}
	return attrs;
}

// ─────────────────────────────────────────────────────── tree helpers ──────
const isEl = (n) => n && n.type === 'element';
const hasClass = (n, c) => isEl(n) && (n.attrs.class || '').split(/\s+/).includes(c);

function findFirst(node, pred) {
	if (isEl(node) && pred(node)) return node;
	for (const c of node.children || []) {
		const r = findFirst(c, pred);
		if (r) return r;
	}
	return null;
}

function rawText(n) {
	if (n.type === 'text') return n.value;
	return (n.children || []).map(rawText).join('');
}
const cleanText = (n) => decode(rawText(n)).replace(/\s+/g, ' ').trim();

function decode(s) {
	return s
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** Merge Notion's split single-item <ol>/<ul> siblings into one list. */
function mergeLists(node) {
	if (!node.children) return;
	for (const c of node.children) if (isEl(c)) mergeLists(c);
	const out = [];
	let lastList = null;
	for (const c of node.children) {
		if (isEl(c) && (c.tag === 'ol' || c.tag === 'ul')) {
			if (lastList && lastList.tag === c.tag) {
				lastList.children.push(...c.children);
				continue;
			}
			lastList = c;
			out.push(c);
		} else if (c.type === 'text' && !c.value.trim()) {
			out.push(c); // keep whitespace, don't break list adjacency
		} else {
			lastList = null;
			out.push(c);
		}
	}
	node.children = out;
}

// ──────────────────────────────────────────────── markdown rendering ───────
// Inline text is escaped for BOTH markdown and MDX ({ } < would break JSX).
function inlineText(v) {
	return decode(v)
		.replace(/\s+/g, ' ')
		.replace(/([\\`<{}*_])/g, '\\$1');
}

function wrapEmph(s, mark) {
	const lead = s.match(/^\s*/)[0];
	const trail = s.match(/\s*$/)[0];
	const core = s.slice(lead.length, s.length - trail.length);
	return core ? lead + mark + core + mark + trail : s;
}

function inline(nodes) {
	return (nodes || []).map(inlineNode).join('');
}
function inlineNode(n) {
	if (n.type === 'text') return inlineText(n.value);
	switch (n.tag) {
		case 'strong':
		case 'b':
			return wrapEmph(inline(n.children), '**');
		case 'em':
		case 'i':
			return wrapEmph(inline(n.children), '*');
		case 'code':
			return '`' + decode(rawText(n)) + '`';
		case 'a':
			return `[${inline(n.children)}](${n.attrs.href || ''})`;
		case 'br':
			return '  \n';
		default:
			return inline(n.children); // span (icons), mark, u, ...
	}
}

function blockList(children) {
	const parts = [];
	for (const c of children || []) {
		if (c.type === 'text') {
			const t = inlineText(c.value).trim();
			if (t) parts.push(t);
			continue;
		}
		const md = block(c).trim();
		if (md) parts.push(md);
	}
	return parts.join('\n\n');
}

function list(node, ordered) {
	const items = node.children.filter((c) => isEl(c) && c.tag === 'li');
	const start = ordered ? parseInt(node.attrs.start || '1', 10) : 0;
	return items
		.map((li, idx) => {
			const marker = ordered ? `${start + idx}. ` : '- ';
			const pad = ' '.repeat(marker.length);
			const inlineKids = [];
			const subLists = [];
			for (const c of li.children) {
				if (isEl(c) && (c.tag === 'ol' || c.tag === 'ul')) subLists.push(c);
				else inlineKids.push(c);
			}
			let out = marker + inline(inlineKids).trim();
			for (const sub of subLists) {
				const subMd = list(sub, sub.tag === 'ol');
				out += '\n' + subMd.split('\n').map((l) => (l ? pad + l : l)).join('\n');
			}
			return out;
		})
		.join('\n');
}

function blockquote(node) {
	const content = inline(node.children).trim();
	return content
		.split('\n')
		.map((l) => ('> ' + l).trimEnd())
		.join('\n');
}

function toggle(node) {
	const sum = node.children.find((c) => isEl(c) && c.tag === 'summary');
	const summary = sum ? cleanText(sum) : '';
	const bodyDiv = node.children.find((c) => hasClass(c, 'indented'));
	const body = bodyDiv
		? blockList(bodyDiv.children)
		: blockList(node.children.filter((c) => c !== sum));
	return `<Toggle summary={${JSON.stringify(summary)}}>\n\n${body}\n\n</Toggle>`;
}

function columns(node) {
	const cols = node.children.filter((c) => hasClass(c, 'column'));
	const inner = cols
		.map((c) => `<Column>\n\n${blockList(c.children)}\n\n</Column>`)
		.join('\n\n');
	return `<Columns cols={${cols.length}}>\n\n${inner}\n\n</Columns>`;
}

function callout(node) {
	const emoji = node.attrs['data-notion-callout-icon'] || '';
	const contentDiv = node.children.filter((c) => isEl(c) && c.tag === 'div').pop();
	const body = contentDiv ? blockList(contentDiv.children) : blockList(node.children);
	return `<Callout${emoji ? ` emoji="${emoji}"` : ''}>\n\n${body}\n\n</Callout>`;
}

function equation(node) {
	const ann = findFirst(node, (n) => n.attrs.encoding === 'application/x-tex');
	const tex = ann ? decode(rawText(ann)).trim() : cleanText(node);
	return tex ? `$$\n${tex}\n$$` : '';
}

function block(node) {
	if (node.type === 'text') return inlineText(node.value).trim();
	const { tag } = node;
	if (tag === 'details') return toggle(node);
	if (hasClass(node, 'column-list')) return columns(node);
	if (hasClass(node, 'callout')) return callout(node);
	if (hasClass(node, 'equation')) return equation(node);
	if (tag === 'p') return inline(node.children).trim();
	if (/^h[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + inline(node.children).trim();
	if (tag === 'ul') return list(node, false);
	if (tag === 'ol') return list(node, true);
	if (tag === 'blockquote') return blockquote(node);
	if (tag === 'hr') return '---';
	if (tag === 'img') return `![${node.attrs.alt || ''}](${node.attrs.src || ''})`;
	// div / figure / header / any wrapper → recurse into children
	return blockList(node.children);
}

// ─────────────────────────────────────────────────────── frontmatter ───────
const slugify = (s) =>
	s
		.toLowerCase()
		.replace(/[’'"“”]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const yamlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

function today() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
		d.getDate(),
	).padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────── main ───────
const html = readFileSync(input, 'utf8');
const root = parseHTML(html);
mergeLists(root);

const titleEl = findFirst(root, (n) => hasClass(n, 'page-title'));
const title = String(flags.title || (titleEl ? cleanText(titleEl) : path.basename(input, '.html')));

const bodyEl =
	findFirst(root, (n) => hasClass(n, 'page-body')) ||
	findFirst(root, (n) => n.tag === 'article') ||
	root;

const firstPara = (bodyEl.children || []).find((c) => c.tag === 'p' && cleanText(c));
const description = String(
	flags.description || (firstPara ? cleanText(firstPara).slice(0, 200) : `Notes: ${title}`),
);

const collection = String(flags.collection || 'notes');

// Resolve output path
let outPath = flags.out ? String(flags.out) : null;
const slug = String(flags.slug || slugify(title));
const topic = String(
	flags.topic || (outPath ? path.basename(path.dirname(outPath)) : 'misc'),
);
if (!outPath) {
	outPath =
		collection === 'notes'
			? path.join('src/content/notes', topic, `${slug}.mdx`)
			: path.join('src/content', collection, `${slug}.mdx`);
}

// Compute the "../" prefix from the output file up to src/
const outDir = path.dirname(path.resolve(outPath)).split(path.sep);
const srcIdx = outDir.lastIndexOf('src');
const upPrefix = srcIdx >= 0 ? '../'.repeat(outDir.length - 1 - srcIdx) : '../../../';

// heroImage
let hero = flags.hero ? String(flags.hero) : null;
if (!hero && HERO_BY_TOPIC[topic]) hero = `${upPrefix}assets/${HERO_BY_TOPIC[topic]}`;

// tags
const tags = flags.tags
	? String(flags.tags)
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
	: [];

// Assemble frontmatter
const fm = [`title: ${yamlStr(title)}`, `description: ${yamlStr(description)}`, `pubDate: ${yamlStr(flags.date ? String(flags.date) : today())}`];
if (collection === 'notes') fm.push(`topic: ${yamlStr(topic)}`);
fm.push(`tags: [${tags.map(yamlStr).join(', ')}]`);
if (hero) fm.push(`heroImage: ${yamlStr(hero)}`);

// Body
let body = blockList(bodyEl.children).replace(/\n{3,}/g, '\n\n').trim();
const importLine = `import { Toggle, Columns, Column, Callout } from '${upPrefix}components/notion';`;

const mdx = `---\n${fm.join('\n')}\n---\n${importLine}\n\n${body}\n`;

if (flags.stdout) {
	process.stdout.write(mdx);
} else {
	mkdirSync(path.dirname(outPath), { recursive: true });
	writeFileSync(outPath, mdx, 'utf8');
	console.error(`✓ Wrote ${outPath}  (${body.length} chars, topic="${topic}", slug="${slug}")`);
}
