// CLI orchestration: parse args, load config + HiBob data, build, render, write.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { quarterWindow, iso } from './dates.js';
import { loadPeople, loadWhosout } from './bob.js';
import { buildModel } from './model.js';
import { renderHtml } from './render.js';

const USAGE = `quarter-availability-chart — render a group's availability for a Doist quarter as an HTML chart

Usage:
  quarter-availability-chart --config <path>     fetch from bob, write output.html

Options:
  --config <path>    config file (required)
  --out <path>       output HTML file       (default: output.html)
  -h, --help         show this help
`;

function parseArgs(argv) {
  const out = { config: null, out: 'output.html', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--config') out.config = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

const EXAMPLE_CONFIG = JSON.stringify({
  group: 'BE KLM',
  quarter: '2026Q3',
  eyebrow: 'Squad availability — from HiBob',
  members: [
    { email: 'lead@doist.com', tag: 'lead' },
    { email: 'someone@doist.com' },
    { email: 'other@doist.com', name: 'Nickname' },
  ],
  markers: [
    { date: '2026-08-28', label: 'SOC2 deadline', deadline: true },
  ],
  areas: [
    { start: '2026-07-20', end: '2026-07-24', label: 'Doist Connect', busy: true },
  ],
  manual: [
    { email: 'someone@doist.com', start: '2026-09-22', end: '2026-09-23' },
  ],
}, null, 2);

function needConfig(lead) {
  process.stderr.write(`${lead}\n\nSave a config like this and pass it with --config <path>:\n\n${EXAMPLE_CONFIG}\n`);
  process.exit(1);
}

function readConfig(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') needConfig(`No config file at '${path}'.`);
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`config '${path}' is not valid JSON: ${e.message}`);
  }
}

export function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!args.config) needConfig('No config specified (--config is required).');

  const config = readConfig(args.config);
  const window = quarterWindow(config.quarter);

  const people = loadPeople();
  const whosout = config.members.length ? loadWhosout(iso(window[0]), iso(window[1])) : [];

  const model = buildModel(config, people, whosout, window);
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  writeFileSync(args.out, renderHtml(config, model, { generatedAt }));

  for (const w of model.warnings) process.stderr.write('WARNING: ' + w + '\n');
  process.stdout.write(`Done: ${resolve(args.out)}\n`);
}
