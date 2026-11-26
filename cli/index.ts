import { createInterface } from 'node:readline/promises';
import { run } from './run';

const interactive = Boolean(process.stdout.isTTY) && !process.env.CI;
const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

run(process.argv.slice(2), {
  io: { out: (t) => process.stdout.write(`${t}\n`), err: (t) => process.stderr.write(`${t}\n`), color },
  env: process.env,
  interactive,
  stdin: process.stdin,
  stdout: process.stdout,
  ...(process.stdin.isTTY
    ? {
        prompt: async (question: string) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          try { return await rl.question(question); } finally { rl.close(); }
        },
      }
    : {}),
}).then(
  (code) => { process.exitCode = code; },
  (e) => { process.stderr.write(`iemails: ${(e as Error)?.stack ?? e}\n`); process.exitCode = 1; },
);
