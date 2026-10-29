/* ==================================================================
   Російська мова без правки сотень файлів.

   У коді переклад — пара t('укр', 'eng'). Російський варіант не
   пишемо третім аргументом руками: він лежить у src/i18n/ru.json
   (ключ — український рядок), а цей плагін під час збірки сам
   дописує третій аргумент: t('укр', 'eng') → t('укр', 'eng', 'рус').
   Так само:
     { uk: …, en: … }            → { uk: …, en: …, ru: … }
     pluralUk(n, 'а', 'б', 'в')  → pluralUk(n, 'а', 'б', 'в', 'А', 'Б', 'В')
   Шаблони з ${…} — ключ із плейсхолдерами {0}, {1}…, у перекладі
   порядок можна міняти.

   Ще два місця, де мову вибирають умовою, а не t():
     isEn ? 'Mon' : 'Пн'          → isEn ? 'Mon' : (ru ? 'Пн-рус' : 'Пн')
     lang === 'en' ? x.fooEn : x.foo → … : (lang === 'ru' ? (x.fooRu ?? x.foo) : x.foo)
   Для другого в обʼєкти файлу, де є поле foo з українським рядком,
   дописуємо fooRu. Для isEn мову беремо з globalThis.__EDGE_LANG
   (його ставить lib/lang.js).

   Немає перекладу — нічого не дописуємо, і в рантаймі лишається
   українська (lib/lang.js). Новий рядок: node scripts/ruI18n.mjs scan
   покаже, чого бракує в ru.json.
================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const DICT_PATH = path.resolve('src/i18n/ru.json');

export function keyOf(n) {
  if (!n) return null;
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral') {
    let s = '';
    n.quasis.forEach((q, i) => { s += q.value.cooked; if (i < n.expressions.length) s += `{${i}}`; });
    return s;
  }
  return null;
}

const propName = (p) => p.key && (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null);

const CYR = /[А-Яа-яІіЇїЄєҐґ]/;
const isEnTest = (t) => (t.type === 'Identifier' && t.name === 'isEn')
  || (t.type === 'BinaryExpression' && t.operator === '===' && t.right.type === 'StringLiteral' && t.right.value === 'en');
const ruTestSrc = (t, code) => (t.type === 'Identifier'
  ? "(globalThis.__EDGE_LANG === 'ru')"
  : `(${code.slice(t.left.start, t.left.end)} === 'ru')`);

/* Обхід файла: віддає всі місця, де потрібен переклад. */
function walk(code, visit) {
  let ast;
  try { ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }); } catch { return; }
  /* Поля, які файл читає як «українську гілку» умови: x.foo у
     `… === 'en' ? x.fooEn : x.foo`. Їм у обʼєктах допишемо fooRu. */
  const ruProps = new Set();
  traverse(ast, {
    ConditionalExpression(p) {
      const n = p.node; const a = n.alternate;
      if (isEnTest(n.test) && a.type === 'MemberExpression' && !a.computed && a.property.type === 'Identifier' && a.property.name !== 'uk') ruProps.add(a.property.name);
    },
  });
  traverse(ast, {
    ConditionalExpression(p) {
      const n = p.node; const a = n.alternate;
      if (!isEnTest(n.test)) return;
      if (a.type === 'StringLiteral' || a.type === 'TemplateLiteral') visit({ kind: 'condLit', node: n, uk: a });
      else if (a.type === 'MemberExpression' && !a.computed && a.property.type === 'Identifier') visit({ kind: 'condMem', node: n, mem: a });
    },
    CallExpression(p) {
      const n = p.node; const c = n.callee;
      if (c.type !== 'Identifier') return;
      if ((c.name === 't' || c.name === 'tx') && n.arguments.length === 2) visit({ kind: 'call', node: n, uk: n.arguments[0] });
      else if (c.name === 'pluralUk' && n.arguments.length === 4) visit({ kind: 'plural', node: n });
    },
    ObjectExpression(p) {
      const props = p.node.properties.filter((x) => x.type === 'ObjectProperty');
      const names = props.map(propName);
      props.forEach((pp, i) => {
        const nm = names[i];
        if (nm && ruProps.has(nm) && !names.includes(nm + 'Ru') && keyOf(pp.value) !== null && CYR.test(keyOf(pp.value))) visit({ kind: 'prop', node: pp, name: nm, uk: pp.value });
      });
      if (names.includes('uk') && names.includes('en') && !names.includes('ru')) {
        visit({ kind: 'obj', node: p.node, uk: props[names.indexOf('uk')].value });
      }
    },
  });
}

/* Усі рядки з вузла (рекурсивно в масиви/обʼєкти). */
function strings(n, out) {
  if (!n) return out;
  const k = keyOf(n);
  if (k !== null) { if (/[А-Яа-яІіЇїЄєҐґ]/.test(k)) out.push(k); return out; }
  if (n.type === 'ArrayExpression') n.elements.forEach((e) => strings(e, out));
  else if (n.type === 'ObjectExpression') n.properties.forEach((pp) => pp.type === 'ObjectProperty' && strings(pp.value, out));
  else if (n.type === 'ConditionalExpression') { strings(n.consequent, out); strings(n.alternate, out); }
  return out;
}

export function collect(code) {
  const out = [];
  walk(code, (h) => {
    if (h.kind === 'plural') h.node.arguments.slice(1).forEach((a) => strings(a, out));
    else if (h.kind !== 'condMem') strings(h.uk, out);
  });
  return out;
}

/* ---------- генерація перекладеного літерала ---------- */
function tplSrc(ru, exprs, code) {
  const parts = ru.split(/\{(\d+)\}/);
  let s = '`';
  parts.forEach((part, i) => {
    if (i % 2 === 0) s += part.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    else { const e = exprs[+part]; s += '${' + (e ? code.slice(e.start, e.end) : "''") + '}'; }
  });
  return s + '`';
}

function trans(n, code, dict, stat) {
  const src = () => code.slice(n.start, n.end);
  const k = keyOf(n);
  if (k !== null) {
    if (!/[А-Яа-яІіЇїЄєҐґ]/.test(k)) return src();
    const ru = dict[k];
    if (ru == null) { stat.miss++; return src(); }
    stat.hit++;
    if (n.type === 'StringLiteral') return JSON.stringify(ru);
    return tplSrc(ru, n.expressions, code);
  }
  if (n.type === 'ArrayExpression') return '[' + n.elements.map((e) => (e ? trans(e, code, dict, stat) : '')).join(', ') + ']';
  if (n.type === 'ObjectExpression') {
    return '{' + n.properties.map((pp) => (pp.type === 'ObjectProperty' && !pp.computed
      ? code.slice(pp.key.start, pp.key.end) + ': ' + trans(pp.value, code, dict, stat)
      : code.slice(pp.start, pp.end))).join(', ') + '}';
  }
  if (n.type === 'ConditionalExpression') {
    return '(' + code.slice(n.test.start, n.test.end) + ' ? ' + trans(n.consequent, code, dict, stat) + ' : ' + trans(n.alternate, code, dict, stat) + ')';
  }
  return src();
}

export function transformCode(code, dict) {
  const edits = [];
  const stat = { hit: 0, miss: 0 };
  walk(code, (h) => {
    if (h.kind === 'call') {
      const before = stat.hit;
      const ru = trans(h.uk, code, dict, stat);
      if (stat.hit > before) edits.push([h.node.arguments[1].end, ', ' + ru]);
    } else if (h.kind === 'plural') {
      const before = stat.hit;
      const forms = h.node.arguments.slice(1).map((a) => trans(a, code, dict, stat));
      if (stat.hit > before) edits.push([h.node.arguments[3].end, ', ' + forms.join(', ')]);
    } else if (h.kind === 'condLit') {
      const before = stat.hit;
      const ru = trans(h.uk, code, dict, stat);
      if (stat.hit > before) {
        const a = h.node.alternate;
        edits.push([a.start, `(${ruTestSrc(h.node.test, code)} ? ${ru} : `]);
        edits.push([a.end, ')']);
      }
    } else if (h.kind === 'condMem') {
      const a = h.node.alternate; const src = code.slice(a.start, a.end);
      const obj = code.slice(a.object.start, a.object.end); const nm = a.property.name;
      const ruMem = nm === 'uk' ? `(${obj}.ru ?? ${src})` : `(${obj}.${nm}Ru ?? ${src})`;
      edits.push([a.start, `(${ruTestSrc(h.node.test, code)} ? ${ruMem} : `]);
      edits.push([a.end, ')']);
    } else if (h.kind === 'prop') {
      const before = stat.hit;
      const ru = trans(h.uk, code, dict, stat);
      if (stat.hit > before) edits.push([h.node.end, `, ${h.name}Ru: ${ru}`]);
    } else if (h.kind === 'obj') {
      const before = stat.hit;
      const ru = trans(h.uk, code, dict, stat);
      if (stat.hit > before) {
        const props = h.node.properties;
        edits.push([props[props.length - 1].end, ', ru: ' + ru]);
      }
    }
  });
  if (!edits.length) return null;
  /* З кінця файла до початку, щоб позиції не зсувались. Дві вставки
     в одну точку (кінець гілки й початок наступної) — у порядку
     додавання. */
  edits.forEach((e, i) => { e[2] = i; });
  edits.sort((a, b) => b[0] - a[0] || b[2] - a[2]);
  let out = code;
  for (const [pos, txt] of edits) out = out.slice(0, pos) + txt + out.slice(pos);
  return { code: out, stat };
}

export default function ruI18n() {
  let dict = {};
  const load = () => { try { dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')); } catch { dict = {}; } };
  load();
  return {
    name: 'edge-ru-i18n',
    enforce: 'pre',
    configureServer(server) {
      server.watcher.add(DICT_PATH);
      /* Новий переклад — скидаємо кеш перетворених модулів: без цього
         Vite віддавав файли, перетворені ще старим словником, і в dev
         половина інтерфейсу лишалась українською до перезапуску. */
      server.watcher.on('change', (f) => {
        if (path.resolve(f).toLowerCase() !== DICT_PATH.toLowerCase()) return;
        load();
        server.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      });
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\/src\/.*\.(jsx?|mjs)$/.test(file.replace(/\\/g, '/')) || file.includes('node_modules')) return null;
      if (!/\b(tx?|pluralUk)\(|\buk\s*:|isEn|'en'/.test(code)) return null;
      const r = transformCode(code, dict);
      return r ? { code: r.code, map: null } : null;
    },
  };
}

/* node scripts/ruI18n.mjs scan — які рядки ще без перекладу. */
if (process.argv[1] && process.argv[1].endsWith('ruI18n.mjs') && process.argv[2] === 'scan') {
  const files = [];
  (function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) w(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } })('src');
  let dict = {}; try { dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')); } catch { /* ще немає */ }
  const all = new Set();
  for (const f of files) collect(fs.readFileSync(f, 'utf8')).forEach((s) => all.add(s));
  const missing = [...all].filter((s) => dict[s] == null);
  fs.writeFileSync(process.argv[3] || 'ru-missing.json', JSON.stringify(missing, null, 1));
  console.log(`рядків: ${all.size}, без перекладу: ${missing.length}`);
}
