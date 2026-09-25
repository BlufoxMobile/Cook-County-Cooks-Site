#!/usr/bin/env node
/* =============================================================================
 * Cook County Cooks — build/strip-comments.mjs
 * DEPENDENCY-FREE COMMENT STRIPPER FOR THE SHIPPED (HASHED) COPIES
 * -----------------------------------------------------------------------------
 * build/fingerprint.mjs calls stripCss(text) / stripJs(text) on the rewritten
 * bytes just before it emits each hashed copy, so the hash is taken over what
 * actually ships. THE SOURCES KEEP EVERY COMMENT — nobody edits a hashed twin,
 * and the prose in this codebase is where its decisions are recorded.
 *
 * WHY: comments are most of the code bytes. Measured on the 2026-09-24 tree
 * (scratchpad audit/load.md §2.3): the cinema path is 414 KB gzip with them and
 * ~170 KB without; theme.css — the one render-blocking file — 104 KB → 16 KB.
 *
 * JS: a small tokenizer that understands '…', "…", `…${…}…` (nested), regex
 * literals (by the previous-significant-token rule), // and /* *\/ comments.
 * A comment becomes a single space, or a newline if it contained one, so ASI
 * and line-based semantics cannot change. Nothing else is touched: whitespace
 * is NOT collapsed, because a blank line inside a template literal is content
 * (that was the one difference the esbuild cross-check caught). CSS embedded in
 * template literals (wallprint/chefwall/freezer/screens/overlay) is content and
 * keeps its comments.
 *
 * CSS: strips /* *\/ outside strings; keeps /*! … *\/; drops the blank lines
 * the removed comments leave behind (CSS has no whitespace-significant text).
 *
 * VERIFIED: every one of the 24 JS/CSS files shipped on 2026-09-24 stripped to
 * output that esbuild --minify makes byte-identical to the original's minified
 * form, i.e. only comments were removed. Re-run that check after any change to
 * this file (esbuild is NOT a build dependency — it is only the referee):
 *     ESBUILD=/path/to/esbuild node build/strip-comments.mjs --verify assets/*.js assets/*.css
 * fingerprint.mjs additionally syntax-checks every stripped module with
 * `node --check` and balances every stripped stylesheet's braces before it
 * writes anything, so a tokenizer slip fails the build instead of shipping.
 * ========================================================================== */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>',
  '~', '^', '=>', '']);
const REGEX_KW = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'yield', 'await', 'instanceof']);

export function stripJs(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let prev = '';            // previous significant token (punctuator char or identifier word)
  const braceStack = [];    // for template literal ${ } nesting: 'tpl' or 'brace'

  const readString = (q) => {
    let j = i + 1;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === q) { j++; break; }
      if (c === '\n') break;   // unterminated: bail out conservatively
      j++;
    }
    out += src.slice(i, j); i = j; prev = 'str';
  };
  const readTemplateChunk = () => {
    // at a backtick or right after a closing } of ${ }: read until ` or ${
    let j = i;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { j++; out += src.slice(i, j); i = j; prev = 'str'; return 'end'; }
      if (c === '$' && src[j + 1] === '{') { j += 2; out += src.slice(i, j); i = j; braceStack.push('tpl'); prev = '{'; return 'expr'; }
      j++;
    }
    out += src.slice(i); i = n; return 'end';
  };
  const readRegex = () => {
    let j = i + 1, inClass = false;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '\n') break;
      if (inClass) { if (c === ']') inClass = false; }
      else if (c === '[') inClass = true;
      else if (c === '/') { j++; break; }
      j++;
    }
    while (j < n && /[a-z]/i.test(src[j])) j++;   // flags
    out += src.slice(i, j); i = j; prev = 'regex';
  };

  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i);
      i = e === -1 ? n : e;           // keep the newline itself
      continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const body = src.slice(i, e === -1 ? n : e + 2);
      if (body.startsWith('/*!')) { out += body; }
      else out += body.includes('\n') ? '\n' : ' ';
      i = e === -1 ? n : e + 2;
      continue;
    }
    if (c === '\'' || c === '"') { readString(c); continue; }
    if (c === '`') { out += '`'; i++; const r = readTemplateChunk(); continue; }
    if (c === '/') {
      if (REGEX_PREV.has(prev) || REGEX_KW.has(prev)) { readRegex(); continue; }
      out += c; i++; prev = '/'; continue;
    }
    if (c === '{') { braceStack.push('brace'); out += c; i++; prev = '{'; continue; }
    if (c === '}') {
      const top = braceStack.pop();
      out += c; i++;
      if (top === 'tpl') { readTemplateChunk(); continue; }
      prev = '}'; continue;
    }
    if (/\s/.test(c)) { out += c; i++; continue; }
    if (/[A-Za-z_$0-9]/.test(c) || c.charCodeAt(0) > 127) {
      let j = i + 1;
      while (j < n && (/[A-Za-z_$0-9]/.test(src[j]) || src.charCodeAt(j) > 127)) j++;
      const word = src.slice(i, j);
      out += word; i = j; prev = /^[0-9]/.test(word) ? 'num' : word;
      if (!REGEX_KW.has(word)) prev = /^[0-9]/.test(word) ? 'num' : 'ident';
      else prev = word;
      continue;
    }
    if (c === '=' && d === '>') { out += '=>'; i += 2; prev = '=>'; continue; }
    if ((c === '+' && d === '+') || (c === '-' && d === '-')) { out += c + d; i += 2; prev = 'ident'; continue; }
    if (c === ')' || c === ']') { out += c; i++; prev = c === ')' ? 'paren' : 'bracket'; continue; }
    out += c; i++; prev = c;
  }
  // NO whitespace post-processing: a blank line inside a template literal is
  // content. (Collapsing them was the one difference the esbuild check caught.)
  return out;
}

export function stripCss(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === '\'') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const body = src.slice(i, e === -1 ? n : e + 2);
      if (body.startsWith('/*!')) out += body;
      i = e === -1 ? n : e + 2; continue;
    }
    out += c; i++;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n\s*\n+/g, '\n');
}

if (process.argv[2] === '--verify') {
  const esb = process.env.ESBUILD;
  const tmp = mkdtempSync(join(tmpdir(), 'ccc-strip-'));
  let bad = 0;
  for (const f of process.argv.slice(3)) {
    const src = readFileSync(f, 'utf8');
    const css = f.endsWith('.css');
    const stripped = css ? stripCss(src) : stripJs(src);
    const tmpA = join(tmp, 'a' + (css ? '.css' : '.js')), tmpB = join(tmp, 'b' + (css ? '.css' : '.js'));
    writeFileSync(tmpA, src); writeFileSync(tmpB, stripped);
    let same = null;
    if (esb) {
      const fmt = (p) => execFileSync(esb, [p, '--minify', '--legal-comments=none', '--log-level=error', ...(css ? [] : ['--format=esm'])]).toString();
      try { same = fmt(tmpA) === fmt(tmpB); } catch (e) { same = false; }
    }
    if (same === false) bad++;
    console.log(`${f}: ${src.length} -> ${stripped.length} bytes (${(100 * (1 - stripped.length / src.length)).toFixed(0)}% smaller)` +
      (same === null ? '' : same ? '  esbuild-equivalent: YES' : '  esbuild-equivalent: NO'));
  }
  process.exit(bad ? 1 : 0);
}
