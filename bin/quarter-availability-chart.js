#!/usr/bin/env node
import { run } from '../src/cli.js';

try {
  run(process.argv.slice(2));
} catch (e) {
  process.stderr.write('error: ' + (e && e.message ? e.message : e) + '\n');
  process.exit(1);
}
