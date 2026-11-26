#!/usr/bin/env node
/**
 * detect_env.mjs
 * Scans the local machine for installed external Coding CLIs (codex, claude, opencode, gemini, aider, etc.)
 * and checks existing swarm-forge model configuration files (project-level and global).
 *
 * Usage: node detect_env.mjs [workspaceRoot]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const workspaceRoot = path.resolve(process.argv[2] || process.cwd());
const homeDir = os.homedir();

const CLI_CATALOG = [
  {
    id: 'codex',
    bin: 'codex',
    name: 'OpenAI Codex CLI',
    recommendedModels: ['astra', 'sol', 'gpt-5.3-codex'],
    reviewHint: '适合连接 Astra / Sol 执行跨厂商只读交叉评审（不消耗 Antigravity Claude 额度）'
  },
  {
    id: 'claude',
    bin: 'claude',
    name: 'Claude Code CLI',
    recommendedModels: ['sonnet', 'opus'],
    reviewHint: '走本机独立 Claude 订阅/API 执行只读交叉评审'
  },
  {
    id: 'opencode',
    bin: 'opencode',
    name: 'OpenCode CLI',
    recommendedModels: ['default'],
    reviewHint: '通过 OpenCode 已配置的异构模型执行只读评审'
  },
  {
    id: 'gemini',
    bin: 'gemini',
    name: 'Gemini CLI',
    recommendedModels: ['gemini-4-carbon', 'gemini-4-neon'],
    reviewHint: '通过本机独立 Gemini CLI 通道执行评审'
  },
  {
    id: 'aider',
    bin: 'aider',
    name: 'Aider CLI',
    recommendedModels: ['default'],
    reviewHint: '通过 Aider 配置的外部模型执行只读审查'
  },
  {
    id: 'goose',
    bin: 'goose',
    name: 'Goose CLI',
    recommendedModels: ['default'],
    reviewHint: '通过 Goose 配置的模型执行审查'
  }
];

function whichBin(bin) {
  try {
    const p = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).trim();
    return p || null;
  } catch {
    return null;
  }
}

function getVersion(bin) {
  try {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 2500 }).trim();
    return out.split('\n')[0].slice(0, 80);
  } catch {
    return 'installed';
  }
}

const detectedClis = [];
for (const entry of CLI_CATALOG) {
  const binPath = whichBin(entry.bin);
  if (binPath) {
    detectedClis.push({
      id: entry.id,
      name: entry.name,
      path: binPath,
      version: getVersion(entry.bin),
      recommendedModels: entry.recommendedModels,
      reviewHint: entry.reviewHint
    });
  }
}

const projectConfigPath = path.join(workspaceRoot, '.agents', 'swarm-forge.json');
const globalConfigPath = path.join(homeDir, '.gemini', 'config', 'swarm-forge.json');

function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const projectConfig = readJsonSafe(projectConfigPath);
const globalConfig = readJsonSafe(globalConfigPath);

console.log(JSON.stringify({
  workspaceRoot,
  detectedClis,
  configStatus: {
    projectConfigPath,
    hasProjectConfig: Boolean(projectConfig),
    globalConfigPath,
    hasGlobalConfig: Boolean(globalConfig),
    activeConfig: projectConfig || globalConfig || null
  },
  defaults: {
    scout: 'gemini-3.8-flash-medium',
    wiki: 'gemini-3.8-flash-medium',
    authorSlice: 'gemini-4-hydrogen-high',
    authorCore: 'gemini-4-neon-high',
    reviewer: {
      mode: 'swarm-model',
      defaultModel: 'claude-sonnet-5-5-high',
      highRiskModel: 'claude-opus-5-5-high',
      fallbackModel: 'gemini-4-carbon-high'
    }
  }
}, null, 2));
