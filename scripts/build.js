import { deleteAsync } from 'del';
import { exec } from 'child_process';
import { globby } from 'globby';
import chalk from 'chalk';
import esbuild from 'esbuild';
import fs from 'fs/promises';
import ora from 'ora';
import util from 'util';
import * as path from 'path';
import { readFileSync } from 'fs';
import { replace } from 'esbuild-plugin-replace';

const outdir = 'dist';
const spinner = ora({ hideCursor: false }).start();
const execPromise = util.promisify(exec);

let packageData = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
const shoelaceVersion = JSON.stringify(packageData.version.toString());

//
// Builds the source with esbuild.
//
async function buildTheSource() {
  return await esbuild.build({
    format: 'esm',
    target: 'es2017',
    entryPoints: [
      //
      // NOTE: Entry points must be mapped in package.json > exports, otherwise users won't be able to import them!
      //
      // The whole shebang
      './src/shoelace.ts',
      // The auto-loader
      './src/shoelace-autoloader.ts',
      // Components
      ...(await globby('./src/components/**/!(*.(style|test)).ts')),
      // Translations
      ...(await globby('./src/translations/**/*.ts')),
      // Public utilities
      ...(await globby('./src/utilities/**/!(*.(style|test)).ts')),
      // Theme stylesheets
      ...(await globby('./src/themes/**/!(*.test).ts'))
    ],
    chunkNames: 'chunks/[name].[hash]',
    define: {
      // Floating UI requires this to be set
      'process.env.NODE_ENV': '"production"'
    },
    bundle: true,
    splitting: true,
    minify: false,
    packages: 'external',
    outdir,
    plugins: [
      replace({
        __SHOELACE_VERSION__: shoelaceVersion
      })
    ]
  });
}

//
// Helper function to draw a spinner while tasks run.
//
async function nextTask(label, action) {
  spinner.text = label;
  spinner.start();

  try {
    await action();
    spinner.stop();
    console.log(`${chalk.green('✔')} ${label}`);
  } catch (err) {
    spinner.stop();
    console.error(`${chalk.red('✘')} ${err}`);
    if (err.stdout) console.error(chalk.red(err.stdout));
    if (err.stderr) console.error(chalk.red(err.stderr));
    process.exit(1);
  }
}

await nextTask('Cleaning up the previous build', async () => {
  await deleteAsync(outdir);
  await fs.mkdir(outdir, { recursive: true });
});

await nextTask('Generating component metadata', () => {
  return execPromise(`node scripts/make-metadata.js --outdir "${outdir}"`, { stdio: 'inherit' });
});

await nextTask('Running the TypeScript compiler', () => {
  return execPromise(`tsc --project ./tsconfig.prod.json --outdir "${outdir}"`, { stdio: 'inherit' });
});

await nextTask('Building source files', buildTheSource);
