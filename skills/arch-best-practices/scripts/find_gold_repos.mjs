#!/usr/bin/env node
/**
 * find_gold_repos.mjs
 * High-signal GitHub open-source exemplar finder for engineering best practices.
 * Filters out tutorial/demo/awesome-list noise and ranks actively maintained,
 * production-grade repositories so agents study real battle-tested architectures.
 *
 * Usage:
 *   node find_gold_repos.mjs "<keywords>" [--lang=TypeScript] [--limit=6]
 */

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const queryParts = [];
let lang = 'TypeScript';
let limit = 6;

for (const arg of args) {
  if (arg.startsWith('--lang=')) lang = arg.slice('--lang='.length);
  else if (arg.startsWith('--limit=')) limit = Math.max(1, Math.min(15, Number(arg.slice('--limit='.length)) || 6));
  else queryParts.push(arg);
}

const rawQuery = queryParts.join(' ').trim();
if (!rawQuery) {
  console.error('Usage: node find_gold_repos.mjs "<domain or pattern keywords>" [--lang=TypeScript] [--limit=6]');
  process.exit(1);
}

function resolveGitHubToken() {
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUBT_ACCESS_TOKEN_AGY', 'GITHUB_ACCESS_TOKEN_AGY']) {
    if (process.env[key]) return process.env[key].trim();
  }
  try {
    const out = execFileSync('fish', ['-c', 'printf "%s" "$GITHUBT_ACCESS_TOKEN_AGY"'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500
    }).trim();
    if (out) return out;
  } catch {}
  return '';
}

const token = resolveGitHubToken();
const headers = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'agy-swarm-forge-gold-miner/1.2'
};
if (token) headers['Authorization'] = `Bearer ${token}`;

// Cutoff: active push within last 14 months
const cutoffDate = new Date(Date.now() - 425 * 24 * 3600 * 1000).toISOString().slice(0, 10);

const SLOP_NAME_RE = /(^awesome-|-awesome$|-tutorial|-demo$|-starter$|-boilerplate$|leetcode|interview-questions|cheatsheet|roadmap|hello-world|todo-app|clone$)/i;
const SLOP_DESC_RE = /\b(awesome list|curated list|tutorial series|youtube tutorial|udemy|bootcamp|homework|my first|practice repo)\b/i;

const KNOWN_GOLD_ORGS = new Set([
  'vercel', 'supabase', 'drizzle-team', 'honojs', 'calcom', 'dubinc',
  'triggerdotdev', 'medusajs', 'makeplane', 'TanStack', 'trpc', 'colinhacks',
  'upstash', 'cloudflare', 'biomejs', 'vitest-dev', 'fastify'
]);

async function ghGet(url) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return res.json();
}

async function main() {
  const q = `${rawQuery} language:${lang} stars:>=150 pushed:>=${cutoffDate} archived:false`;
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=25`;

  const data = await ghGet(searchUrl);
  const candidates = [];

  for (const repo of data.items || []) {
    if (repo.fork || repo.archived || repo.disabled) continue;
    if (SLOP_NAME_RE.test(repo.name)) continue;
    if (SLOP_DESC_RE.test(repo.description || '')) continue;
    if ((repo.size || 0) < 80) continue; // Tiny empty shells

    const owner = repo.owner?.login || '';
    const daysSincePush = Math.max(1, (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000);
    const recencyBoost = daysSincePush <= 30 ? 1.25 : daysSincePush <= 120 ? 1.1 : 1.0;
    const orgBoost = KNOWN_GOLD_ORGS.has(owner) ? 1.4 : 1.0;
    const issueSignal = repo.has_issues && repo.open_issues_count > 0 ? 1.05 : 0.95;

    const qualityScore = Math.round(Math.log10((repo.stargazers_count || 10) + 1) * 25 * recencyBoost * orgBoost * issueSignal);

    candidates.push({
      fullName: repo.full_name,
      url: repo.html_url,
      stars: repo.stargazers_count,
      pushedAt: repo.pushed_at?.slice(0, 10),
      defaultBranch: repo.default_branch,
      topics: (repo.topics || []).slice(0, 6),
      description: repo.description || '',
      qualityScore
    });
  }

  candidates.sort((a, b) => b.qualityScore - a.qualityScore || b.stars - a.stars);
  const top = candidates.slice(0, limit);

  // If authenticated, also try fetching up to 5 concrete matching source file paths across top repos
  let codeHits = [];
  if (token && top.length > 0) {
    try {
      const repoScope = top.slice(0, 3).map(r => `repo:${r.fullName}`).join(' ');
      const codeQ = `${rawQuery} ${repoScope} language:${lang}`;
      const codeUrl = `https://api.github.com/search/code?q=${encodeURIComponent(codeQ)}&per_page=6`;
      const codeData = await ghGet(codeUrl);
      codeHits = (codeData.items || []).map(item => ({
        repo: item.repository?.full_name,
        path: item.path,
        htmlUrl: item.html_url
      }));
    } catch {
      // Code search is optional enhancement; ignore rate-limit or query syntax errors
    }
  }

  console.log(JSON.stringify({
    query: rawQuery,
    language: lang,
    authenticated: Boolean(token),
    totalFiltered: top.length,
    repositories: top,
    directSourceFiles: codeHits
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
