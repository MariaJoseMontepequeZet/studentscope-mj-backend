import { spawnSync } from 'node:child_process';

const URL_POR_DEFECTO = 'postgres://postgres@127.0.0.1:5433/studentscope_test';

const resultado = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'test/**/*.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || URL_POR_DEFECTO }
});

process.exit(resultado.status ?? 1);
