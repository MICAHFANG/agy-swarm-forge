#!/usr/bin/env node
/**
 * scan_ts_graph.mjs
 * Fast TypeScript/Frontend repository AST scanner for .agents/wiki/_generated/
 * - Uses target repo's local `typescript` compiler API (ts.createSourceFile) if available
 * - Gracefully falls back to lightweight regex/brace parsing if node_modules is absent
 * - Extracts: UI Components + Props/Variant union types, Hooks, Utilities, and Module Dependency Graph
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const targetRoot = path.resolve(process.argv[2] || process.cwd());
if (!fs.existsSync(targetRoot)) {
  console.error(`[scan_ts_graph] Directory not found: ${targetRoot}`);
  process.exit(1);
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next',
  '.nuxt', '.turbo', '.vercel', '.output', 'coverage', '.agents', '.agent',
  'storybook-static', 'public', '.cache', 'tmp', 'temp'
]);

const CODE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.jsx', '.vue']);
const TEST_FILE_RE = /\.(test|spec|stories|e2e)\.[cm]?[tj]sx?$|__tests__|__mocks__/i;
const VARIANT_PROP_RE = /^(variant|variants|size|intent|tone|color|theme|mode|kind|type|status|appearance|shape|layout|align|placement|asChild|render\w+|slot\w*|icon\w*|footer|header|extra)$/i;

// 1. Try loading TypeScript from workspace or parent dirs
function loadTypeScript(rootDir) {
  const candidates = [
    path.join(rootDir, 'package.json'),
    path.join(process.env.HOME || '', '.gemini/config/package.json')
  ];
  // Also check 1-level workspace subpackages if monorepo
  const pkgsDir = path.join(rootDir, 'packages');
  if (fs.existsSync(pkgsDir)) {
    try {
      for (const entry of fs.readdirSync(pkgsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(pkgsDir, entry.name, 'package.json'));
        }
      }
    } catch {}
  }
  for (const pkgJson of candidates) {
    if (fs.existsSync(pkgJson)) {
      try {
        const req = createRequire(pkgJson);
        return req('typescript');
      } catch {}
    }
  }
  return null;
}

const ts = loadTypeScript(targetRoot);

// 2. Load tsconfig path aliases (best-effort)
function loadPathAliases(rootDir) {
  const aliases = [];
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return aliases;
  try {
    const raw = fs.readFileSync(tsconfigPath, 'utf8');
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');
    const parsed = JSON.parse(stripped);
    const baseUrl = parsed?.compilerOptions?.baseUrl || '.';
    const pathsMap = parsed?.compilerOptions?.paths || {};
    for (const [pattern, targets] of Object.entries(pathsMap)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const prefix = pattern.replace(/\*.*$/, '');
      const targetPrefix = String(targets[0]).replace(/\*.*$/, '');
      if (prefix) {
        aliases.push({
          prefix,
          targetBase: path.resolve(rootDir, baseUrl, targetPrefix)
        });
      }
    }
  } catch {}
  if (aliases.length === 0) {
    if (fs.existsSync(path.join(rootDir, 'src'))) {
      aliases.push({ prefix: '@/', targetBase: path.join(rootDir, 'src') + path.sep });
      aliases.push({ prefix: '~/', targetBase: path.join(rootDir, 'src') + path.sep });
    } else {
      aliases.push({ prefix: '@/', targetBase: rootDir + path.sep });
    }
  }
  return aliases;
}

const pathAliases = loadPathAliases(targetRoot);

// 3. Walk repository files
function collectFiles(dir, acc = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.storybook') {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.git')) continue;
    }
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, acc);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.d.ts')) continue;
      const ext = path.extname(entry.name);
      if (CODE_EXTS.has(ext) && !TEST_FILE_RE.test(full)) {
        acc.push(full);
      }
    }
  }
  return acc;
}

const allFiles = collectFiles(targetRoot).sort();
const allFilesSet = new Set(allFiles);

function toRel(absPath) {
  return path.relative(targetRoot, absPath).split(path.sep).join('/');
}

function resolveImport(fromFile, spec) {
  if (!spec || (!spec.startsWith('.') && !pathAliases.some(a => spec.startsWith(a.prefix)))) {
    return null;
  }
  let candidateBase = null;
  if (spec.startsWith('.')) {
    candidateBase = path.resolve(path.dirname(fromFile), spec);
  } else {
    for (const a of pathAliases) {
      if (spec.startsWith(a.prefix)) {
        const rest = spec.slice(a.prefix.length);
        candidateBase = path.resolve(a.targetBase, rest);
        break;
      }
    }
  }
  if (!candidateBase) return null;
  const tryPaths = [
    candidateBase,
    ...['.ts', '.tsx', '.mts', '.jsx', '.vue'].map(ext => candidateBase + ext),
    ...['index.ts', 'index.tsx', 'index.jsx', 'index.vue'].map(idx => path.join(candidateBase, idx))
  ];
  // Strip .js/.mjs extension in ESM TS imports
  if (/\.[cm]?js$/.test(candidateBase)) {
    const stem = candidateBase.replace(/\.[cm]?js$/, '');
    tryPaths.unshift(stem + '.ts', stem + '.tsx', stem + '.mts');
  }
  for (const p of tryPaths) {
    if (allFilesSet.has(p)) return p;
  }
  return null;
}

function extractVueScript(content) {
  const matches = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  return matches.map(m => m[1]).join('\n');
}

function compactText(str, maxLen = 90) {
  const clean = str.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + '…' : clean;
}

// 4. Parse single file with TS AST (preferred) or regex fallback
function analyzeFileWithTS(absPath, rawContent) {
  const ext = path.extname(absPath);
  const content = ext === '.vue' ? extractVueScript(rawContent) : rawContent;
  const scriptKind = (ext === '.tsx' || ext === '.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, scriptKind);

  const imports = new Set();
  const typeDefs = new Map(); // TypeName -> [{ name, type, optional }]
  const cvaVariants = new Map(); // cva var / component -> variant summary
  const components = [];
  const hooks = [];
  const exportsList = [];

  function hasExportModifier(node) {
    return Boolean(node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
  }

  function extractPropsMembers(typeNode) {
    const props = [];
    if (!typeNode) return props;
    if (ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sf);
          const optional = Boolean(member.questionToken);
          const propType = member.type ? compactText(member.type.getText(sf), 80) : 'unknown';
          props.push({ name: propName, optional, type: propType });
        }
      }
    } else if (ts.isIntersectionTypeNode(typeNode)) {
      for (const sub of typeNode.types) {
        if (ts.isTypeLiteralNode(sub)) {
          props.push(...extractPropsMembers(sub));
        } else if (ts.isTypeReferenceNode(sub)) {
          const refName = sub.typeName.getText(sf);
          if (typeDefs.has(refName)) props.push(...typeDefs.get(refName));
        }
      }
    }
    return props;
  }

  // Pass 1: imports, interfaces, type aliases, cva() variant definitions
  sf.forEachChild(node => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    } else if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const props = [];
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sf);
          const optional = Boolean(member.questionToken);
          const propType = member.type ? compactText(member.type.getText(sf), 80) : 'unknown';
          props.push({ name: propName, optional, type: propType });
        }
      }
      typeDefs.set(name, props);
    } else if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const props = extractPropsMembers(node.type);
      if (props.length > 0) {
        typeDefs.set(name, props);
      } else {
        typeDefs.set(name, [{ name: '$type', optional: false, type: compactText(node.type.getText(sf), 80) }]);
      }
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && ts.isCallExpression(decl.initializer)) {
          const callee = decl.initializer.expression.getText(sf);
          // Detect class-variance-authority cva(..., { variants: { ... } }) or tv({ variants: ... })
          if ((callee === 'cva' || callee === 'tv') && decl.initializer.arguments.length > 0) {
            for (const arg of decl.initializer.arguments) {
              if (ts.isObjectLiteralExpression(arg)) {
                for (const prop of arg.properties) {
                  if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'variants' && ts.isObjectLiteralExpression(prop.initializer)) {
                    const vList = [];
                    for (const vProp of prop.initializer.properties) {
                      if (ts.isPropertyAssignment(vProp) && ts.isObjectLiteralExpression(vProp.initializer)) {
                        const keys = vProp.initializer.properties
                          .map(k => k.name ? k.name.getText(sf).replace(/['"]/g, '') : '')
                          .filter(Boolean);
                        vList.push({
                          name: vProp.name.getText(sf),
                          optional: true,
                          type: keys.map(k => `'${k}'`).join(' | ')
                        });
                      }
                    }
                    if (vList.length > 0) cvaVariants.set(decl.name.getText(sf), vList);
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  function resolvePropsForComponent(compName, paramNode) {
    const collected = [];
    if (paramNode?.type) {
      if (ts.isTypeReferenceNode(paramNode.type)) {
        const refName = paramNode.type.typeName.getText(sf);
        if (typeDefs.has(refName)) collected.push(...typeDefs.get(refName));
      } else {
        collected.push(...extractPropsMembers(paramNode.type));
      }
    }
    if (collected.length === 0) {
      for (const candidate of [`${compName}Props`, 'Props', `I${compName}Props`]) {
        if (typeDefs.has(candidate)) {
          collected.push(...typeDefs.get(candidate));
          break;
        }
      }
    }
    for (const [, vProps] of cvaVariants) {
      for (const vp of vProps) {
        if (!collected.some(c => c.name === vp.name)) collected.push(vp);
      }
    }
    return collected;
  }

  function containsJsx(node) {
    let found = false;
    function visit(n) {
      if (found) return;
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
        found = true;
        return;
      }
      ts.forEachChild(n, visit);
    }
    visit(node);
    return found;
  }

  // Vue SFC handling
  if (ext === '.vue') {
    const compName = path.basename(absPath, '.vue');
    let props = [];
    for (const [, pList] of typeDefs) {
      if (pList.length > 0 && pList[0].name !== '$type') {
        props.push(...pList);
      }
    }
    components.push({ name: compName, props });
  }

  // Pass 2: exported functions, hooks, components, utilities
  const localComponentCandidates = new Map();
  sf.forEachChild(node => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const isExp = hasExportModifier(node);
      if (/^[A-Z]/.test(name) && (ext === '.tsx' || ext === '.jsx' || containsJsx(node))) {
        const comp = { name, props: resolvePropsForComponent(name, node.parameters[0]) };
        if (isExp) components.push(comp);
        else localComponentCandidates.set(name, comp);
      } else if (isExp && /^use[A-Z0-9]/.test(name)) {
        hooks.push(name);
      } else if (isExp) {
        exportsList.push(name);
      }
    } else if (ts.isVariableStatement(node)) {
      const isExp = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        const init = decl.initializer;
        if (/^[A-Z]/.test(name) && init) {
          let paramNode = null;
          let isCompShape = ext === '.tsx' || ext === '.jsx';
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
            paramNode = init.parameters[0];
            isCompShape = isCompShape || containsJsx(init);
          } else if (ts.isCallExpression(init)) {
            const callee = init.expression.getText(sf);
            if (/forwardRef|memo|observer|styled|defineComponent/.test(callee)) {
              isCompShape = true;
              const fnArg = init.arguments.find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
              if (fnArg) paramNode = fnArg.parameters[0];
              if (!paramNode && init.typeArguments?.length >= 2) {
                const propsTypeArg = init.typeArguments[1];
                if (ts.isTypeReferenceNode(propsTypeArg)) {
                  const refName = propsTypeArg.typeName.getText(sf);
                  if (typeDefs.has(refName)) {
                    const comp = { name, props: typeDefs.get(refName) };
                    if (isExp) components.push(comp);
                    else localComponentCandidates.set(name, comp);
                    continue;
                  }
                }
              }
            }
          }
          if (isCompShape) {
            const comp = { name, props: resolvePropsForComponent(name, paramNode) };
            if (isExp) components.push(comp);
            else localComponentCandidates.set(name, comp);
            continue;
          }
        }
        if (isExp && /^use[A-Z0-9]/.test(name)) {
          hooks.push(name);
        } else if (isExp) {
          exportsList.push(name);
        }
      }
    } else if (ts.isExportAssignment(node) && node.expression && ts.isIdentifier(node.expression)) {
      const defName = node.expression.text;
      if (localComponentCandidates.has(defName) && !components.some(c => c.name === defName)) {
        components.push(localComponentCandidates.get(defName));
      }
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        const orig = (el.propertyName || el.name).text;
        if (localComponentCandidates.has(orig) && !components.some(c => c.name === orig)) {
          components.push(localComponentCandidates.get(orig));
        } else if (/^use[A-Z0-9]/.test(el.name.text)) {
          hooks.push(el.name.text);
        } else {
          exportsList.push(el.name.text);
        }
      }
    }
  });

  return { imports: [...imports], components, hooks, exports: exportsList };
}

function parsePropsBlockFallback(blockText) {
  const props = [];
  for (const line of blockText.split(/[;\n]/)) {
    const m = line.trim().match(/^([A-Za-z0-9_$]+)(\?)?\s*:\s*(.+)$/);
    if (m) {
      const cleanType = compactText(m[3].replace(/,\s*$/, ''), 80);
      props.push({ name: m[1], optional: Boolean(m[2]), type: cleanType });
    }
  }
  return props;
}

function analyzeFileFallback(absPath, rawContent) {
  const ext = path.extname(absPath);
  const content = ext === '.vue' ? extractVueScript(rawContent) : rawContent;
  const imports = new Set();
  for (const m of content.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    imports.add(m[1]);
  }

  // Extract interface / type Props blocks
  const typeDefs = new Map();
  for (const m of content.matchAll(/(?:interface|type)\s+([A-Za-z0-9_]+)(?:\s*=\s*)?\s*\{([\s\S]*?)\n\}/g)) {
    typeDefs.set(m[1], parsePropsBlockFallback(m[2]));
  }

  function findProps(compName, sigTail = '') {
    for (const candidate of [`${compName}Props`, 'Props', `I${compName}Props`]) {
      if (typeDefs.has(candidate)) return typeDefs.get(candidate);
    }
    const inlineMatch = sigTail.match(/:\s*\{([^}]+)\}/);
    if (inlineMatch) return parsePropsBlockFallback(inlineMatch[1]);
    return [];
  }

  const components = [];
  const hooks = [];
  const exportsList = [];

  if (ext === '.vue') {
    const allProps = [];
    for (const [, pList] of typeDefs) allProps.push(...pList);
    components.push({ name: path.basename(absPath, '.vue'), props: allProps });
  }
  for (const m of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/g)) {
    const name = m[1];
    if (/^[A-Z]/.test(name) && (ext === '.tsx' || ext === '.jsx')) components.push({ name, props: findProps(name, m[2]) });
    else if (/^use[A-Z0-9]/.test(name)) hooks.push(name);
    else exportsList.push(name);
  }
  for (const m of content.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:\(([^)]*)\)|[A-Za-z0-9_.<>,\s]+\(\s*\(([^)]*)\))?/g)) {
    const name = m[1];
    const sig = m[2] || m[3] || '';
    if (/^[A-Z]/.test(name) && (ext === '.tsx' || ext === '.jsx')) components.push({ name, props: findProps(name, sig) });
    else if (/^use[A-Z0-9]/.test(name)) hooks.push(name);
    else exportsList.push(name);
  }
  return { imports: [...imports], components, hooks, exports: exportsList };
}

// 5. Run scan across all files
const fileRecords = {};
const importedBy = {};

for (const absFile of allFiles) {
  const rel = toRel(absFile);
  let raw = '';
  try {
    raw = fs.readFileSync(absFile, 'utf8');
  } catch {
    continue;
  }
  const parsed = ts ? analyzeFileWithTS(absFile, raw) : analyzeFileFallback(absFile, raw);
  const resolvedDeps = [];
  for (const spec of parsed.imports) {
    const targetAbs = resolveImport(absFile, spec);
    if (targetAbs && targetAbs !== absFile) {
      const targetRel = toRel(targetAbs);
      if (!resolvedDeps.includes(targetRel)) resolvedDeps.push(targetRel);
      if (!importedBy[targetRel]) importedBy[targetRel] = [];
      if (!importedBy[targetRel].includes(rel)) importedBy[targetRel].push(rel);
    }
  }
  fileRecords[rel] = {
    deps: resolvedDeps,
    components: parsed.components,
    hooks: [...new Set(parsed.hooks)],
    exports: [...new Set(parsed.exports)]
  };
}

// 6. Compute Module-Level Topology
function getModuleBucket(relPath) {
  const parts = relPath.split('/');
  if (parts[0] === 'packages' && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  if ((parts[0] === 'src' || parts[0] === 'app') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts.length >= 2 ? parts[0] : 'root';
}

const moduleStats = new Map();
const moduleEdges = new Map();

for (const [rel, rec] of Object.entries(fileRecords)) {
  const fromMod = getModuleBucket(rel);
  if (!moduleStats.has(fromMod)) {
    moduleStats.set(fromMod, { files: 0, components: 0, hooks: 0 });
  }
  const st = moduleStats.get(fromMod);
  st.files += 1;
  st.components += rec.components.length;
  st.hooks += rec.hooks.length;

  for (const depRel of rec.deps) {
    const toMod = getModuleBucket(depRel);
    if (fromMod === toMod) continue;
    const edgeKey = `${fromMod}-->${toMod}`;
    moduleEdges.set(edgeKey, (moduleEdges.get(edgeKey) || 0) + 1);
  }
}

// 7. Write outputs into .agents/wiki/
const wikiDir = path.join(targetRoot, '.agents', 'wiki');
const genDir = path.join(wikiDir, '_generated');
const domainsDir = path.join(wikiDir, 'domains');
fs.mkdirSync(genDir, { recursive: true });
fs.mkdirSync(domainsDir, { recursive: true });

// 7A. COMPONENT_INDEX.md
const compRows = [];
const hookRows = [];
const utilRows = [];

for (const [rel, rec] of Object.entries(fileRecords)) {
  const fanIn = (importedBy[rel] || []).length;
  for (const comp of rec.components) {
    const variantProps = comp.props.filter(p => VARIANT_PROP_RE.test(p.name) || p.type.includes("'") || p.type.includes('"'));
    const otherProps = comp.props.filter(p => !variantProps.includes(p) && p.name !== '$type');
    const vText = variantProps.length > 0
      ? variantProps.map(p => `\`${p.name}${p.optional ? '?' : ''}: ${p.type.replace(/\|/g, '\\|')}\``).join(', ')
      : '—';
    const oText = otherProps.length > 0
      ? otherProps.slice(0, 6).map(p => `\`${p.name}${p.optional ? '?' : ''}\``).join(', ') + (otherProps.length > 6 ? ` (+${otherProps.length - 6})` : '')
      : '—';
    compRows.push({ name: comp.name, rel, fanIn, vText, oText });
  }
  if (rec.hooks.length > 0) {
    hookRows.push({ rel, fanIn, hooks: rec.hooks });
  }
  if (rec.components.length === 0 && rec.hooks.length === 0 && rec.exports.length > 0 && (/util|helper|lib|service|api|store|shared|common|constant|config|schema|type/i.test(rel) || fanIn >= 2)) {
    utilRows.push({ rel, fanIn, exports: rec.exports });
  }
}

compRows.sort((a, b) => b.fanIn - a.fanIn || a.name.localeCompare(b.name));
hookRows.sort((a, b) => b.fanIn - a.fanIn || a.rel.localeCompare(b.rel));
utilRows.sort((a, b) => b.fanIn - a.fanIn || a.rel.localeCompare(b.rel));

const compMd = [
  `# 组件、变体与可复用能力索引（自动生成）`,
  ``,
  `> 解析引擎：\`${ts ? `TypeScript Compiler AST v${ts.version}` : 'Fallback Lightweight Parser'}\` | 扫描源码文件数：\`${allFiles.length}\``,
  `> **防造轮子铁律**：新增组件或 Hook 前，必须先核对下表；优先通过新增 \`variant / size / mode / slot\` Props 扩展既有组件！`,
  ``,
  `## 1. UI 组件与变体清单（共 ${compRows.length} 个，按被复用频次排序）`,
  ``,
  compRows.length === 0
    ? `_当前未检测到导出的前端组件。_`
    : [
        `| 组件名 | 引用次数 | 现有变体 / 关键枚举与插槽 Props | 其他 Props | 文件路径 |`,
        `| :--- | :---: | :--- | :--- | :--- |`,
        ...compRows.map(r => `| **${r.name}** | ${r.fanIn} | ${r.vText} | ${r.oText} | \`${r.rel}\` |`)
      ].join('\n'),
  ``,
  `## 2. 自定义 Hooks 索引（共 ${hookRows.length} 处）`,
  ``,
  hookRows.length === 0
    ? `_当前未检测到导出的 \`use*\` Hooks。_`
    : [
        `| Hooks | 引用次数 | 文件路径 |`,
        `| :--- | :---: | :--- |`,
        ...hookRows.map(r => `| ${r.hooks.map(h => `\`${h}\``).join(', ')} | ${r.fanIn} | \`${r.rel}\` |`)
      ].join('\n'),
  ``,
  `## 3. 高频共享模块与工具（共 ${utilRows.length} 处）`,
  ``,
  utilRows.length === 0
    ? `_当前未检测到高频共享工具模块。_`
    : [
        `| 导出符号（前 6 项） | 引用次数 | 文件路径 |`,
        `| :--- | :---: | :--- |`,
        ...utilRows.slice(0, 80).map(r => {
          const ex = r.exports.slice(0, 6).map(e => `\`${e}\``).join(', ') + (r.exports.length > 6 ? ` (+${r.exports.length - 6})` : '');
          return `| ${ex} | ${r.fanIn} | \`${r.rel}\` |`;
        })
      ].join('\n'),
  ``
].join('\n');

fs.writeFileSync(path.join(genDir, 'COMPONENT_INDEX.md'), compMd, 'utf8');

// 7B. MODULE_GRAPH.md
const sortedEdges = [...moduleEdges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35);
const nodeIds = new Map();
function mermaidId(modName) {
  if (!nodeIds.has(modName)) {
    nodeIds.set(modName, `M${nodeIds.size + 1}`);
  }
  return nodeIds.get(modName);
}

const mermaidLines = ['```mermaid', 'flowchart LR'];
for (const [edgeKey, weight] of sortedEdges) {
  const [fromMod, toMod] = edgeKey.split('-->');
  const fId = mermaidId(fromMod);
  const tId = mermaidId(toMod);
  mermaidLines.push(`  ${fId}["${fromMod}"] -->|${weight}| ${tId}["${toMod}"]`);
}
if (sortedEdges.length === 0) {
  mermaidLines.push(`  Root["${path.basename(targetRoot)} (单模块或无跨目录引用)"]`);
}
mermaidLines.push('```');

const topHubs = Object.entries(importedBy)
  .map(([rel, callers]) => ({ rel, count: callers.length, callers }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 25);

const sortedModules = [...moduleStats.entries()].sort((a, b) => b[1].files - a[1].files);

const graphMd = [
  `# 模块依赖拓扑与核心枢纽图谱（自动生成）`,
  ``,
  `## 1. 顶层模块依赖图（Top ${sortedEdges.length} 跨模块引用边）`,
  ``,
  ...mermaidLines,
  ``,
  `## 2. 目录模块规模速览`,
  ``,
  `| 模块目录 | 源码文件数 | 组件数 | Hooks 数 |`,
  `| :--- | :---: | :---: | :---: |`,
  ...sortedModules.map(([mod, st]) => `| \`${mod}\` | ${st.files} | ${st.components} | ${st.hooks} |`),
  ``,
  `## 3. 核心底座枢纽（Top Fan-In 被依赖最多的文件，修改需警惕爆炸半径）`,
  ``,
  topHubs.length === 0
    ? `_暂无跨文件引用记录。_`
    : [
        `| 被依赖文件 | 被引用次数 | 示例调用方（前 3 个） |`,
        `| :--- | :---: | :--- |`,
        ...topHubs.map(h => `| \`${h.rel}\` | ${h.count} | ${h.callers.slice(0, 3).map(c => `\`${c}\``).join(', ')}${h.count > 3 ? ' …' : ''} |`)
      ].join('\n'),
  ``
].join('\n');

fs.writeFileSync(path.join(genDir, 'MODULE_GRAPH.md'), graphMd, 'utf8');

// 7C. graph.json (for instant jq blast-radius lookup)
const compactGraph = {
  generatedAt: new Date().toISOString(),
  parser: ts ? `typescript-${ts.version}` : 'fallback',
  totalFiles: allFiles.length,
  importedBy,
  files: fileRecords
};
fs.writeFileSync(path.join(genDir, 'graph.json'), JSON.stringify(compactGraph, null, 2), 'utf8');

// 7D. Initialize semantic Wiki templates ONLY if missing
const indexPath = path.join(wikiDir, 'INDEX.md');
if (!fs.existsSync(indexPath)) {
  fs.writeFileSync(indexPath, [
    `# 项目架构与知识图谱总索引（Wiki Index）`,
    ``,
    `> 本目录由 **Swarm Forge** 维护：\`_generated/\` 为 AST 脚本确定性提取，其余文档为迭代过程中持续增量编译的语义词条。`,
    ``,
    `## 1. 结构与复用必查索引`,
    `- [组件变体与 Hooks 清单](./_generated/COMPONENT_INDEX.md) — **新建任何组件/Hook 前必查**`,
    `- [模块依赖图谱与爆炸半径](./_generated/MODULE_GRAPH.md) — **跨模块改动与定位实现必查**`,
    `- [系统技术约定与设计模式](./SYSTEM_PATTERNS.md) — 状态管理、接口请求、样式与变体扩展规范`,
    `- [高频踩坑与错题本](./PITFALLS.md) — **编码与 Review 前必读，防止重犯历史扣分项**`,
    ``,
    `## 2. 业务域词条（Domains）`,
    `_随着功能迭代在 \`./domains/\` 下按模块沉淀，原位更新当前设计，不记流水账。_`,
    ``
  ].join('\n'), 'utf8');
}

const patternsPath = path.join(wikiDir, 'SYSTEM_PATTERNS.md');
if (!fs.existsSync(patternsPath)) {
  fs.writeFileSync(patternsPath, [
    `# 系统技术约定与复用模式（System Patterns）`,
    ``,
    `> 待首次任务或 \`ts-repo-wiki\` 技能根据真实代码补全以下核心约定（保持精炼，原位更新）：`,
    ``,
    `## 1. UI 组件与样式变体规范`,
    `- **基础组件目录**：_待补充_`,
    `- **变体扩展方式**（如 \`variant\` 联合类型 / \`cva\` / 插槽 Props）：_待补充_`,
    ``,
    `## 2. 状态流转与数据请求约定`,
    `- **全局/局部状态**：_待补充_`,
    `- **API 调用与错误处理封装**：_待补充_`,
    ``,
    `## 3. 增量开发禁区`,
    `- 严禁绕过既有请求层裸写 \`fetch\` 或脱离基础组件库重复造弹窗/表格/按钮。`,
    ``
  ].join('\n'), 'utf8');
}

const pitfallsPath = path.join(wikiDir, 'PITFALLS.md');
if (!fs.existsSync(pitfallsPath)) {
  fs.writeFileSync(pitfallsPath, [
    `# 项目高频踩坑与错题本（Pitfalls & Guardrails）`,
    ``,
    `> 本文件记录历次 \`strict-review\` 打回暴露出的真实项目易错点（原位去重合并，严控在 30 条以内，不记日期流水账）。所有 Author 动工前必读：`,
    ``,
    `- _暂无历史打回记录；首次发生 Review 返修后由 \`wiki\` 节点自动提炼沉淀。_`,
    ``
  ].join('\n'), 'utf8');
}

console.log(JSON.stringify({
  ok: true,
  parser: ts ? `typescript-${ts.version}` : 'fallback',
  scannedFiles: allFiles.length,
  components: compRows.length,
  hooks: hookRows.length,
  crossModuleEdges: moduleEdges.size,
  outputDir: path.relative(targetRoot, wikiDir)
}));
