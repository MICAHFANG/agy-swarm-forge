#!/usr/bin/env node
/**
 * run_cli_review.mjs
 * Read-only cross-model adversarial review bridge for external local Coding CLIs
 * (Codex CLI w/ Astra/Sol, Claude Code CLI, OpenCode CLI, or custom command).
 *
 * Usage:
 *   node run_cli_review.mjs --repo=<path> --cli=codex [--model=astra] [--spec=<path>] [--round=1]
 *   node run_cli_review.mjs --repo=<path> --cli=claude [--model=sonnet] [--spec=<path>] [--round=1]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const idx = a.indexOf('=');
      return idx === -1 ? [a.slice(2), 'true'] : [a.slice(2, idx), a.slice(idx + 1)];
    })
);

const repoDir = path.resolve(args.repo || process.cwd());
const cli = (args.cli || '').toLowerCase();
const model = args.model || '';
const specPath = args.spec || '';
const round = Number(args.round || 1);
const timeoutMs = Math.min(180000, Math.max(30000, Number(args.timeout || 120) * 1000));

if (!cli) {
  console.error('Missing --cli=<codex|claude|opencode|gemini|custom>');
  process.exit(1);
}

// 1. Collect bounded git diff + status + optional spec & pitfalls
function runGit(gitArgs) {
  try {
    return execFileSync('git', ['-C', repoDir, ...gitArgs], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  } catch {
    return '';
  }
}

const statusOut = runGit(['status', '--short']).trim();
let diffOut = runGit(['diff', 'HEAD']);
if (!diffOut.trim()) diffOut = runGit(['diff', '--cached']);
if (!diffOut.trim()) diffOut = runGit(['diff']);
if (diffOut.length > 60000) {
  diffOut = diffOut.slice(0, 60000) + '\n\n...[diff truncated at 60KB for bounded review]...';
}

function readOptional(p, maxLen = 6000) {
  if (!p || !fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8').slice(0, maxLen);
}

const specText = readOptional(specPath ? path.resolve(repoDir, specPath) : '');
const pitfallsText = readOptional(path.join(repoDir, '.agents', 'wiki', 'PITFALLS.md'), 3000);
const compIdxText = readOptional(path.join(repoDir, '.agents', 'wiki', '_generated', 'COMPONENT_INDEX.md'), 5000);

const reviewPrompt = `You are a strict, read-only adversarial Principal Architect reviewer (Round ${round}/2).
DO NOT modify any files. Inspect the diff below against 5 hard gates (100 points total):
1. Reuse & Variant Design (25 pts): Flag reinvented UI components or leaving 2 parallel APIs.
2. Architecture & Stack Red Lines (25 pts): Flag shallow pass-through layers, PGSQL N+1 / missing FK indexes / OFFSET pagination / network IO inside db.transaction(), Redis loops or missing TTL, unvalidated API boundaries.
3. Spec & UX 4-State Completeness (20 pts): Loading, Empty, Error/Retry, Normal states.
4. Strict TypeScript Discipline (15 pts): Zero new \`any\`, bare \`as\`, or optional-field bags instead of discriminated unions.
5. Evidence & Blast Radius (15 pts): Only report findings proven by concrete \`file:line\` paths.

Output strictly in this format:
### [Review 裁决 | Round ${round}/2] 得分：<XX>/100 — <PASS | CHANGES_REQUESTED | ESCALATE>
- **[Blocker]** \`file:line\` — issue & exact fix
- **[Major]** \`file:line\` — issue & exact fix
- **[Nit]** \`file:line\` — optional polish

${specText ? `=== SPEC ===\n${specText}\n` : ''}
${pitfallsText ? `=== PITFALLS ===\n${pitfallsText}\n` : ''}
${compIdxText ? `=== EXISTING COMPONENTS (EXCERPT) ===\n${compIdxText}\n` : ''}
=== GIT STATUS ===
${statusOut || '(clean)'}

=== GIT DIFF ===
${diffOut || '(no diff found)'}
`;

// 2. Dispatch to the selected local Coding CLI in read-only non-interactive mode
let cmd = '';
let cmdArgs = [];
let stdinData = undefined;

if (cli === 'codex') {
  cmd = 'codex';
  cmdArgs = ['exec', '--sandbox', 'read-only', '-C', repoDir];
  if (model) cmdArgs.push('-m', model);
  cmdArgs.push('-'); // read prompt from stdin
  stdinData = reviewPrompt;
} else if (cli === 'claude') {
  cmd = 'claude';
  cmdArgs = ['-p', '--permission-mode', 'plan'];
  if (model) cmdArgs.push('--model', model);
  stdinData = reviewPrompt;
} else if (cli === 'opencode') {
  cmd = 'opencode';
  cmdArgs = ['run'];
  if (model && model !== 'default') cmdArgs.push('-m', model);
  cmdArgs.push(reviewPrompt);
} else if (cli === 'gemini') {
  cmd = 'gemini';
  cmdArgs = ['-p', reviewPrompt];
  if (model) cmdArgs.push('-m', model);
} else if (cli === 'custom' && args.cmd) {
  cmd = '/bin/sh';
  cmdArgs = ['-c', args.cmd];
  stdinData = reviewPrompt;
} else {
  console.error(`Unsupported --cli=${cli}. Use codex, claude, opencode, gemini, or custom with --cmd=...`);
  process.exit(1);
}

const res = spawnSync(cmd, cmdArgs, {
  cwd: repoDir,
  input: stdinData,
  encoding: 'utf8',
  timeout: timeoutMs,
  maxBuffer: 8 * 1024 * 1024
});

if (res.error) {
  console.error(`[run_cli_review] Failed to launch ${cmd}: ${res.error.message}`);
  process.exit(1);
}
if (res.stdout) process.stdout.write(res.stdout);
if (res.status !== 0) {
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.status || 1);
}
