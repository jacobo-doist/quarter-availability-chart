// Thin wrapper over the HiBob `bob` CLI.

import { execFileSync } from 'node:child_process';

function bob(args) {
  try {
    // Capture stderr (so we format failures ourselves) and allow a large buffer
    // — `people --json --full` can be several MB.
    return execFileSync('bob', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error("the 'bob' CLI was not found. Install HiBob's bob CLI and put it on your PATH.");
    }
    const detail = (e.stderr || e.message || '').toString().trim();
    // A non-zero exit is usually auth: bob's own message (e.g. "run bob auth login") is the useful part.
    throw new Error(`bob ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
}

const parse = (args) => JSON.parse(bob(args) || '[]');

// `--full` so each person carries firstName (used for row labels).
export const loadPeople = () => parse(['people', '--json', '--full']);
export const loadWhosout = (from, to) => parse(['whosout', '--from', from, '--to', to, '--json']);
