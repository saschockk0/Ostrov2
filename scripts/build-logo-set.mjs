/**
 * build-logo-set.mjs
 * ------------------------------------------------------------------
 * Генерирует единый набор логотипов парусного клуба «Остров» из одного
 * источника геометрии. Источник правды:
 *   - геометрия + разделение цветов (паруса / корпус / текст) — logo.svg
 *   - встроенные шрифты (Marck Script + Montserrat, base64 woff2) — logo-light.svg
 *
 * На выходе (public/assets/logo/):
 *   Полный логотип (знак + «Остров» + «Парусный клуб»):
 *     ostrov-logo-color.svg  — фирменный цвет, для светлого фона (хедер)
 *     ostrov-logo-white.svg  — выворотка, для тёмного фона (футер, hero)
 *     ostrov-logo-mono.svg   — один цвет (currentColor), гибкий
 *   Только знак (катамаран), без текста — компактные места, фавикон, соцсети:
 *     ostrov-mark-color.svg
 *     ostrov-mark-white.svg
 *     ostrov-mark-mono.svg
 *
 * Запуск:  node scripts/build-logo-set.mjs
 * Скрипт идемпотентен — можно запускать сколько угодно раз.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '..', 'public', 'assets');
const OUT = resolve(ASSETS, 'logo');
mkdirSync(OUT, { recursive: true });

// --- Исходники --------------------------------------------------------------
const colorSrc = readFileSync(resolve(ASSETS, 'logo.svg'), 'utf8');
const lightSrc = readFileSync(resolve(ASSETS, 'logo-light.svg'), 'utf8');

// Встроенные шрифты (Marck Script + Montserrat) — берём как есть из light-версии.
const fontsDefs = lightSrc.match(/<defs>[\s\S]*?<\/defs>/)[0];

// Содержимое внутри <svg> цветной версии: <g id="new_logo">…</g> + <g>…текст…</g>
const inner = colorSrc.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];

// Делим на «знак» и «текстовый блок» по началу текстовой группы (<g> ... <text>).
const textGroupStart = inner.search(/<g>\s*<text/);
const markGeometry = inner.slice(0, textGroupStart).trim(); // <g id="new_logo">…</g>
const textGeometry = inner.slice(textGroupStart).trim();     // <g>…<text>…</g>

// --- Палитра ----------------------------------------------------------------
// Цвета знака в исходнике: паруса = #5B92BD, корпус/остров/завитки = #5BA13D.
const SAIL = '#5B92BD'; // исходный синий парусов
const HULL = '#5BA13D'; // исходный зелёный корпуса/текста
const SUBTITLE_SRC_MARK = `fill="${HULL}" font-family="Montserrat`;
const WORDMARK_SRC_MARK = `fill="${HULL}" font-family="&#39;Marck Script&#39;`;
const MONO_DEFAULT = '#0e2f46'; // фирменный тёмно-синий по умолчанию для currentColor

/** Перекрашивает блоки геометрии под вариант. */
function recolor(geometry, { sail, hull, wordmark, subtitle }) {
  let out = geometry;
  // Кернинг заглавной «О» — как в фирменной выворотке.
  out = out.replace(
    '<tspan x="0" y="0">Остров</tspan>',
    '<tspan x="0" y="0">О</tspan><tspan dx="-18">стров</tspan>'
  );
  // Сначала точечно — текст (иначе общая замена зелёного перекрасит и его).
  if (wordmark) out = out.replace(WORDMARK_SRC_MARK, `fill="${wordmark}" font-family="&#39;Marck Script&#39;`);
  if (subtitle) out = out.replace(SUBTITLE_SRC_MARK, `fill="${subtitle}" font-family="Montserrat`);
  // Затем — пути знака (только если переданы цвета знака; для текстового блока — нет).
  if (hull) out = out.split(`fill="${HULL}"`).join(`fill="${hull}"`);
  if (sail) out = out.split(`fill="${SAIL}"`).join(`fill="${sail}"`);
  return out;
}

const TITLE = 'Парусный клуб «Остров»';

/** Собирает финальный SVG-файл. */
function svgFile({ viewBox, body, withFonts, monoColor }) {
  const colorAttr = monoColor ? ` color="${monoColor}"` : '';
  const defs = withFonts ? `\n  ${fontsDefs}` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${TITLE}"${colorAttr}>
  <title>${TITLE}</title>${defs}
${body}
</svg>
`;
}

// viewBox знака — как в исходном logo-mark.svg (проверенный кроп катамарана).
const MARK_VIEWBOX = '60 20 280 175';
const FULL_VIEWBOX = '0 0 336 280';

const targets = [
  // --- Полный логотип ---
  {
    file: 'ostrov-logo-color.svg',
    svg: svgFile({
      viewBox: FULL_VIEWBOX,
      withFonts: true,
      body:
        recolor(markGeometry, { sail: SAIL, hull: HULL }) + '\n' +
        recolor(textGeometry, { wordmark: HULL, subtitle: '#5f6c78' }),
    }),
  },
  {
    file: 'ostrov-logo-white.svg',
    svg: svgFile({
      viewBox: FULL_VIEWBOX,
      withFonts: true,
      body:
        recolor(markGeometry, { sail: '#ffffff', hull: '#ffffff' }) + '\n' +
        recolor(textGeometry, { wordmark: '#ffffff', subtitle: '#b8d8ec' }),
    }),
  },
  {
    file: 'ostrov-logo-mono.svg',
    svg: svgFile({
      viewBox: FULL_VIEWBOX,
      withFonts: true,
      monoColor: MONO_DEFAULT,
      body:
        recolor(markGeometry, { sail: 'currentColor', hull: 'currentColor' }) + '\n' +
        recolor(textGeometry, { wordmark: 'currentColor', subtitle: 'currentColor' }),
    }),
  },
  // --- Только знак ---
  {
    file: 'ostrov-mark-color.svg',
    svg: svgFile({ viewBox: MARK_VIEWBOX, body: recolor(markGeometry, { sail: SAIL, hull: HULL }) }),
  },
  {
    file: 'ostrov-mark-white.svg',
    svg: svgFile({ viewBox: MARK_VIEWBOX, body: recolor(markGeometry, { sail: '#ffffff', hull: '#ffffff' }) }),
  },
  {
    file: 'ostrov-mark-mono.svg',
    svg: svgFile({
      viewBox: MARK_VIEWBOX,
      monoColor: MONO_DEFAULT,
      body: recolor(markGeometry, { sail: 'currentColor', hull: 'currentColor' }),
    }),
  },
];

for (const t of targets) {
  writeFileSync(resolve(OUT, t.file), t.svg, 'utf8');
  console.log(`✓ ${t.file}  (${t.svg.length} bytes)`);
}
console.log(`\nГотово: ${targets.length} файлов → public/assets/logo/`);
