// Token radar entrypoint (Node 22, standard library only, no dependencies).
//
// What a run does, in order:
//   1. Finds the snapshot: --input names either the snapshot file itself or the
//      directory holding snapshot.json; with no --input it reads /input, which
//      is where the grader mounts the sealed snapshot.
//   2. Parses it and lets lib/model.ts score it: the calibrated model ranks the
//      pre-token protocols and buildRadar returns the board rows plus the
//      dashboard payload. The entrypoint then asks boardIssue whether the
//      board is one the gate accepts, and refuses to write a bad board.
//   3. Creates the output directory (--output, else $MAKEFUN_OUTPUT_DIR, else
//      /output) and writes board.json and data.js into it.
//   4. Copies this repository's dashboard/ and screenshots/ next to them,
//      checking the screenshot names and count the gate insists on.
//   5. Writes dossier.json last, through the vendored make.fun library,
//      because the scorer rebuilds the dossier from the finished /output and
//      compares it byte for byte.
//
// Local run, outside the grader:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir with snapshot.json>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** This file's own directory: dashboard/ and screenshots/ are copied from beside it. */
const repoDir = fileURLToPath(new URL('.', import.meta.url));

/** The dossier caps the scorer applies; the dashboard text cap shapes its bytes. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const DOSSIER_SCREENSHOTS = { max: 4, max_bytes: 524_288 };
const DOSSIER_DASHBOARD = { max_files: 400, max_bytes: 4_194_304 };

/** Screenshot file names the gate accepts: letters, digits, dot, underscore, dash. */
const SCREENSHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read one --flag from argv, in either "--flag value" or "--flag=value" form. */
function flagValue(flag: string, fallback: string): string {
  const prefix = `--${flag}=`;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a === `--${flag}` && i + 1 < process.argv.length) return process.argv[i + 1]!;
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return fallback;
}

/** Stop the run with a message on stderr and the given exit code. */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/**
 * Copy every regular file directly inside `from` into `to`, skipping dotfiles,
 * and return the names copied. A missing source directory copies nothing.
 */
function copyDirFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    names.push(name);
  }
  return names;
}

// 1-2. Locate and score the snapshot.
const inputArg = flagValue('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

// 3. The board and the dashboard's data, from the same rows.
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

// 4. The dashboard page and the screenshots that show it.
const dashboardFiles = copyDirFiles(join(repoDir, 'dashboard'), join(outDir, 'dashboard'));
const shotNames = copyDirFiles(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));
if (shotNames.length < 3) {
  fail(`screenshots/ holds ${shotNames.length} image(s): hand in 3, the board, a detail view and a filtered view`, 1);
}
for (const name of shotNames) {
  if (!SCREENSHOT_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
}

// 5. The dossier, rebuilt from the finished output directory.
const dossier = buildDossier(outDir, {
  text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
  screenshots: DOSSIER_SCREENSHOTS,
  dashboard: DOSSIER_DASHBOARD,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} ` +
    `(${dashboardFiles.length} files), ${join(outDir, 'screenshots')} (${shotNames.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
