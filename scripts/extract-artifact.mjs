#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactPath = join(projectRoot, 'Pixegon (4).html');
const componentPath = join(projectRoot, 'src/components/SiteMarkup.astro');
const cssPath = join(projectRoot, 'src/styles/site.css');

const categories = [
  { key: 'frontend', label: 'Frontend', tech: ['React', 'Angular', 'Vue.js', 'Next.js', 'TypeScript', 'Tailwind', 'SASS / SCSS'] },
  { key: 'backend', label: 'Backend' },
  { key: 'databases', label: 'Databases' },
  { key: 'cloud', label: 'Cloud & DevOps' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'ai', label: 'AI & Machine Learning' },
];

const colors = {
  keyword: '#61B8F0',
  identifier: '#E8F4FF',
  string: '#89D6F5',
  punctuation: '#7E93B4',
};

const codeLine = (...segments) => ({
  seg: segments.map(([t, c]) => ({ t, c })),
});

const frontendCode = [
  codeLine(['const ', colors.keyword], ['ui', colors.identifier], [' = ', colors.punctuation], ['await ', colors.keyword], ['pixegon', colors.identifier], ['.frontend({', colors.punctuation]),
  codeLine(['  framework: ', colors.punctuation], ['bestFitFor(problem)', colors.identifier], [',', colors.punctuation]),
  codeLine(['  accessibility: ', colors.punctuation], ["'AA — always'", colors.string], [',', colors.punctuation]),
  codeLine(['  performance: ', colors.punctuation], ["'60fps'", colors.string]),
  codeLine(['});', colors.punctuation]),
];

function extractJsonScript(source, type) {
  const escapedType = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`<script\\s+type=["']${escapedType}["']>\\s*([\\s\\S]*?)\\s*<\\/script>`, 'i'));

  if (!match) {
    throw new Error(`Missing embedded ${type} script in ${artifactPath}`);
  }

  return JSON.parse(match[1]);
}

function getQuotedAttribute(openingTag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = openingTag.match(new RegExp(`\\s${escapedName}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2]) : null;
}

function unwrapExpression(value, label) {
  const match = value?.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (!match) {
    throw new Error(`Expected a mustache expression for ${label}, received ${JSON.stringify(value)}`);
  }
  return match[1].trim();
}

function resolveExpression(context, expression) {
  if (expression === 'true') return true;
  if (expression === 'false') return false;

  const parts = expression.split('.');
  let value = context;

  for (const part of parts) {
    if (value == null || !Object.prototype.hasOwnProperty.call(value, part)) {
      throw new Error(`Unable to resolve template expression: ${expression}`);
    }
    value = value[part];
  }

  return value;
}

function escapeTemplateValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    // Astro treats braces as expression delimiters, including in plain text.
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function interpolate(fragment, context) {
  return fragment.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, expression) => {
    const value = resolveExpression(context, expression.trim());
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      throw new Error(`Cannot interpolate non-scalar expression: ${expression.trim()}`);
    }
    return escapeTemplateValue(value ?? '');
  });
}

function findMatchingCustomClose(fragment, tagName, openingEnd) {
  const matcher = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  matcher.lastIndex = openingEnd;
  let depth = 1;
  let match;

  while ((match = matcher.exec(fragment))) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;

    if (depth === 0) {
      return {
        contentEnd: match.index,
        closingEnd: matcher.lastIndex,
      };
    }
  }

  throw new Error(`Unclosed <${tagName}> element in embedded template`);
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function addAttribute(attributes, name, value = null) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\s${escapedName}(?:\\s|=|$)`, 'i').test(attributes)) return attributes;
  return `${attributes} ${name}${value == null ? '' : `="${escapeAttribute(value)}"`}`;
}

function injectAttributesIntoFirstElement(fragment, attributes) {
  return fragment.replace(/<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>/, (_openingTag, tagName, rawAttributes) => {
    let nextAttributes = rawAttributes;
    for (const [name, value] of Object.entries(attributes)) {
      nextAttributes = addAttribute(nextAttributes, name, value);
    }
    return `<${tagName}${nextAttributes}>`;
  });
}

const retainedFalseBranches = {
  menuOpen: { 'data-mobile-menu': null, hidden: null },
  eName: { 'data-form-error': 'name', hidden: null },
  eMail: { 'data-form-error': 'email', hidden: null },
  eMsg: { 'data-form-error': 'message', hidden: null },
  sent: { 'data-contact-success': null, hidden: null },
};

function renderCustomElements(fragment, context) {
  const customOpening = /<(sc-for|sc-if)\b[^>]*>/gi;
  let output = '';
  let cursor = 0;
  let match;

  while (true) {
    customOpening.lastIndex = cursor;
    match = customOpening.exec(fragment);
    if (!match) break;

    output += fragment.slice(cursor, match.index);

    const tagName = match[1].toLowerCase();
    const openingTag = match[0];
    const openingEnd = customOpening.lastIndex;
    const { contentEnd, closingEnd } = findMatchingCustomClose(fragment, tagName, openingEnd);
    const content = fragment.slice(openingEnd, contentEnd);

    if (tagName === 'sc-for') {
      const listExpression = unwrapExpression(getQuotedAttribute(openingTag, 'list'), 'sc-for list');
      const alias = getQuotedAttribute(openingTag, 'as');
      const list = resolveExpression(context, listExpression);

      if (!alias || !Array.isArray(list)) {
        throw new Error(`Invalid sc-for declaration for ${listExpression}`);
      }

      output += list.map((item, index) => {
        let rendered = renderCustomElements(content, { ...context, [alias]: item });
        if (alias === 'nd') {
          rendered = injectAttributesIntoFirstElement(rendered, { 'data-stack-node': String(index) });
        }
        return rendered;
      }).join('');
    } else {
      const conditionExpression = unwrapExpression(getQuotedAttribute(openingTag, 'value'), 'sc-if value');
      const condition = Boolean(resolveExpression(context, conditionExpression));
      const rendered = renderCustomElements(content, context);

      if (condition) {
        output += rendered;
      } else if (retainedFalseBranches[conditionExpression]) {
        output += injectAttributesIntoFirstElement(rendered, retainedFalseBranches[conditionExpression]);
      }
    }

    cursor = closingEnd;
  }

  output += fragment.slice(cursor);
  return interpolate(output, context);
}

function addClass(attributes, className) {
  const classMatch = attributes.match(/\sclass="([^"]*)"/i);
  if (classMatch) {
    const classes = new Set(classMatch[1].split(/\s+/).filter(Boolean));
    classes.add(className);
    return attributes.replace(classMatch[0], ` class="${[...classes].join(' ')}"`);
  }
  return addAttribute(attributes, 'class', className);
}

function addStyleDeclaration(attributes, declaration) {
  const styleMatch = attributes.match(/\sstyle="([^"]*)"/i);
  if (!styleMatch) return addAttribute(attributes, 'style', declaration);

  const separator = styleMatch[1].endsWith(';') ? '' : ';';
  return attributes.replace(
    styleMatch[0],
    ` style="${styleMatch[1]}${separator}${declaration}"`,
  );
}

function pullAttribute(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`\\s+${escapedName}="([^"]*)"`, 'i');
  const match = attributes.match(matcher);
  return {
    attributes: match ? attributes.replace(match[0], '') : attributes,
    value: match?.[1] ?? null,
  };
}

function applyEventMarker(attributes, marker) {
  let next = attributes;

  if (marker === 'event:menu:toggle') return addAttribute(next, 'data-menu-toggle');
  if (marker === 'event:menu:close') return addAttribute(next, 'data-menu-close');
  if (marker === 'event:contact:submit') return addAttribute(next, 'data-contact-form');
  if (marker.startsWith('event:ticker:')) return addAttribute(next, 'data-ticker-interaction');
  if (marker.startsWith('event:hero:')) return addAttribute(next, 'data-hero-pointer');

  if (marker.startsWith('event:stack:')) {
    const [, , index, key] = marker.split(':');
    next = addAttribute(next, 'data-stack-tab');
    next = addAttribute(next, 'data-stack-index', index);
    next = addAttribute(next, 'data-stack-key', key);
    return next;
  }

  throw new Error(`Unknown generated event marker: ${marker}`);
}

function transformOpeningTags(markup) {
  const interactionStates = new Map();
  let stackRow = 0;

  const transformed = markup.replace(/<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>/g, (_openingTag, sourceTagName, rawAttributes) => {
    const tagName = sourceTagName.toLowerCase() === 'sc-raw-select' ? 'select' : sourceTagName;
    let attributes = rawAttributes;

    attributes = attributes.replace(/\ssc-camel-view-box=/gi, ' viewBox=');
    attributes = attributes.replace(/\ssc-camel-no-validate="true"/gi, ' novalidate');
    attributes = attributes.replace(/\sref="[^"]*"/gi, '');
    attributes = attributes.replace(/\shint-[A-Za-z0-9-]+="[^"]*"/gi, '');

    const events = [];
    attributes = attributes.replace(/\ssc-camel-on-[A-Za-z0-9-]+="([^"]*)"/gi, (_eventAttribute, marker) => {
      events.push(marker);
      return '';
    });

    for (const marker of new Set(events)) {
      attributes = applyEventMarker(attributes, marker);
    }

    let pulled = pullAttribute(attributes, 'style-hover');
    attributes = pulled.attributes;
    const hover = pulled.value;
    pulled = pullAttribute(attributes, 'style-focus');
    attributes = pulled.attributes;
    const focus = pulled.value;

    if (hover || focus) {
      const key = `${hover ?? ''}\u0000${focus ?? ''}`;
      if (!interactionStates.has(key)) {
        interactionStates.set(key, {
          className: `px-state-${String(interactionStates.size + 1).padStart(2, '0')}`,
          hover,
          focus,
        });
      }
      attributes = addClass(attributes, interactionStates.get(key).className);
    }

    if (/\sid="top"(?:\s|>)/i.test(`${attributes}>`)) {
      attributes = addAttribute(attributes, 'data-site-root');
    }
    if (/\sdata-px="menuBtn"/i.test(attributes)) {
      attributes = addAttribute(attributes, 'data-menu-toggle');
    }
    if (/\sdata-px="stackGrid"/i.test(attributes)) {
      attributes = addAttribute(attributes, 'data-stack-root');
    }
    if (/\sdata-px="stackRow"/i.test(attributes)) {
      attributes = addAttribute(attributes, 'data-stack-row', stackRow++ === 0 ? 'primary' : 'secondary');
    }
    if (/\sdata-px="codePanel"/i.test(attributes)) {
      attributes = addAttribute(attributes, 'data-stack-code-panel');
    }
    if (tagName.toLowerCase() === 'pre') {
      attributes = addAttribute(attributes, 'data-stack-code');
    }
    if (attributes.includes('style="display:flex;align-items:center;margin:36px 0 0"')) {
      attributes = addAttribute(attributes, 'data-stack-nodes');
    }
    if (tagName.toLowerCase() === 'form') {
      attributes = addAttribute(attributes, 'data-contact-form');
    }
    if (tagName.toLowerCase() === 'select' && /\sid="pxType"/i.test(attributes)) {
      // Astro compacts option whitespace, which changes WebKit's intrinsic select height by 4px.
      attributes = addStyleDeclaration(attributes, 'height:54px');
    }

    // Fail instead of silently leaking an unsupported proprietary attribute.
    if (/\s(?:sc-|style-(?:hover|focus|active)|hint-)[A-Za-z0-9-]*/i.test(attributes)) {
      throw new Error(`Unsupported proprietary attribute remains on <${tagName}>: ${attributes.trim()}`);
    }

    return `<${tagName}${attributes}>`;
  }).replace(/<\/sc-raw-select>/gi, '</select>');

  return { transformed, interactionStates: [...interactionStates.values()] };
}

function makeInitialContext() {
  const activeCategory = categories[0];
  const half = Math.ceil(activeCategory.tech.length / 2);
  const makeTechRow = (items) => items.map((t, index) => ({ t, sep: index < items.length - 1 }));

  return {
    rootRef: '__ROOT_REF__',
    cats: categories.map((category, index) => ({
      ...category,
      idx: `0${index + 1}`,
      on: index === 0,
      off: index !== 0,
      select: `event:stack:${index}:${category.key}`,
    })),
    rowA: makeTechRow(activeCategory.tech.slice(0, half)),
    rowB: makeTechRow(activeCategory.tech.slice(half)),
    nodes: Array.from({ length: 14 }, (_unused, index) => ({
      on: index % 6 === 0 || Math.floor(index / 2) % 6 === 0,
    })),
    codeLines: frontendCode,
    activeKey: activeCategory.key,
    menuOpen: false,
    notSent: true,
    sent: false,
    eName: false,
    eMail: false,
    eMsg: false,
    menuToggle: 'event:menu:toggle',
    menuClose: 'event:menu:close',
    tickEnter: 'event:ticker:enter',
    tickLeave: 'event:ticker:leave',
    heroMove: 'event:hero:move',
    heroLeave: 'event:hero:leave',
    submit: 'event:contact:submit',
    year: new Date().getFullYear(),
  };
}

function buildInteractionCss(states) {
  const rules = [];

  for (const state of states) {
    if (state.hover) rules.push(`.${state.className}:hover{${state.hover}}`);
    if (state.focus) rules.push(`.${state.className}:focus{${state.focus}}`);
  }

  return rules.join('\n');
}

const scrollbarCss = `/* Subtle iOS-inspired scrollbar with the original layout gutter. */
html{
  scrollbar-color:rgba(126,147,180,.34) transparent;
  scrollbar-width:auto;
}
html::-webkit-scrollbar{width:15px;height:15px}
html::-webkit-scrollbar-track{background:transparent}
html::-webkit-scrollbar-thumb{
  background:rgba(126,147,180,.3);
  background-clip:padding-box;
  border:5px solid transparent;
  border-radius:999px;
}
html::-webkit-scrollbar-thumb:hover{background-color:rgba(145,162,189,.5)}
html::-webkit-scrollbar-thumb:active{background-color:rgba(145,162,189,.65)}
html::-webkit-scrollbar-corner{background:transparent}`;

function countOccurrences(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function validateOutput(component, css) {
  const checks = [
    ['custom sc-* syntax', /(?:<\/?sc-|\ssc-)/i],
    ['mustache syntax', /\{\{[\s\S]*?\}\}/],
    ['x-dc wrapper', /<\/?x-dc\b/i],
    ['helmet wrapper', /<\/?helmet\b/i],
    ['embedded component runtime', /data-dc-script|text\/x-dc/i],
    ['proprietary interaction attributes', /\sstyle-(?:hover|focus|active)=/i],
  ];

  for (const [label, pattern] of checks) {
    const componentMatch = component.match(pattern);
    const cssMatch = css.match(pattern);
    if (componentMatch || cssMatch) {
      const match = componentMatch ?? cssMatch;
      const source = componentMatch ? component : css;
      const start = Math.max(0, match.index - 80);
      const context = source.slice(start, match.index + match[0].length + 80).replace(/\s+/g, ' ');
      throw new Error(`Generated output still contains ${label}: ${context}`);
    }
  }

  if (/@font-face/i.test(css)) {
    throw new Error('site.css must not contain @font-face rules; fonts are generated separately');
  }

  const expectedCounts = [
    ['stack tabs', countOccurrences(component, /\sdata-stack-tab(?:\s|>)/g), 6],
    ['stack rows', countOccurrences(component, /\sdata-stack-row=/g), 2],
    ['stack nodes', countOccurrences(component, /\sdata-stack-node=/g), 14],
    ['form errors', countOccurrences(component, /\sdata-form-error=/g), 3],
    ['mobile menu', countOccurrences(component, /\sdata-mobile-menu(?:\s|>)/g), 1],
    ['contact success', countOccurrences(component, /\sdata-contact-success(?:\s|>)/g), 1],
    ['keyframes', countOccurrences(css, /@keyframes\s+/g), 15],
  ];

  for (const [label, actual, expected] of expectedCounts) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected} ${label}, generated ${actual}`);
    }
  }
}

async function writeGeneratedFile(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${contents.trim()}\n`, 'utf8');
}

async function main() {
  const source = await readFile(artifactPath, 'utf8');
  const template = extractJsonScript(source, '__bundler/template');
  const dcMatch = template.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/i);

  if (!dcMatch) throw new Error('Decoded template does not contain an <x-dc> root');

  const helmetMatch = dcMatch[1].match(/<helmet\b[^>]*>([\s\S]*?)<\/helmet>/i);
  if (!helmetMatch) throw new Error('Decoded template does not contain a <helmet> block');

  const styleBlocks = [...helmetMatch[1].matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const layoutStyles = styleBlocks.filter((css) => !/@font-face/i.test(css));
  if (layoutStyles.length !== 1) {
    throw new Error(`Expected one non-font style block, found ${layoutStyles.length}`);
  }

  let markupSource = dcMatch[1]
    .replace(helmetMatch[0], '')
    .replace(/<script\b[^>]*data-dc-script[^>]*>[\s\S]*?<\/script>/i, '')
    .trim();

  const sourceLoopCount = countOccurrences(markupSource, /<sc-for\b/g);
  if (sourceLoopCount !== 6) {
    throw new Error(`Expected six sc-for loops in the artifact, found ${sourceLoopCount}`);
  }

  // These wrappers keep the dynamic key text addressable without affecting layout.
  markupSource = markupSource
    .replace("stack.active → '{{ activeKey }}'", "stack.active → '<span data-stack-active-key>{{ activeKey }}</span>'")
    .replace('// pixegon.stack — {{ activeKey }}', '// pixegon.stack — <span data-stack-code-key>{{ activeKey }}</span>');

  const renderedMarkup = renderCustomElements(markupSource, makeInitialContext());
  const { transformed, interactionStates } = transformOpeningTags(renderedMarkup);
  const component = `<!-- Generated by scripts/extract-artifact.mjs. Do not edit manually. -->\n${transformed}`;
  const interactionCss = buildInteractionCss(interactionStates);
  const css = `/* Generated by scripts/extract-artifact.mjs. Do not edit manually. */\n[hidden]{display:none!important}\nhtml,body{height:100%}\n#dc-root,#dc-root>.sc-host{height:100%}\n${layoutStyles[0].trim()}\n\n${scrollbarCss}\n\n/* Static replacements for the artifact's interaction-state attributes. */\n${interactionCss}`;

  validateOutput(component, css);
  await writeGeneratedFile(componentPath, component);
  await writeGeneratedFile(cssPath, css);

  console.log(`Generated ${componentPath}`);
  console.log(`Generated ${cssPath}`);
  console.log(`Expanded 6 stack tabs, 14 stack nodes, and ${interactionStates.length} unique interaction-state rules.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
