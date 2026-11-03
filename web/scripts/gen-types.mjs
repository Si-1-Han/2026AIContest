// shared/schema/campus.schema.json → src/types/generated/campus.ts
//   npm run gen:types          생성
//   npm run gen:types:check    최신 여부만 확인 (CI용, 다르면 exit 1)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../shared/schema/campus.schema.json');
const outPath = resolve(here, '../src/types/generated/campus.ts');

const banner = `/* eslint-disable */
/**
 * 자동 생성 파일 — 직접 수정하지 마세요.
 * 기준: backend/campus/models.py
 * 갱신: (backend) uv run python -m campus.pipeline schema → (web) npm run gen:types
 */`;

const ts = await compileFromFile(schemaPath, {
  bannerComment: banner,
  unreachableDefinitions: true,
  additionalProperties: false,
  format: true,
  style: { singleQuote: true, semi: true, printWidth: 100 },
});

if (process.argv.includes('--check')) {
  const current = await readFile(outPath, 'utf8').catch(() => '');
  if (current !== ts) {
    console.error('✗ src/types/generated/campus.ts가 스키마와 다릅니다. `npm run gen:types`를 실행하세요.');
    process.exit(1);
  }
  console.log('✓ generated types are up to date');
} else {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, ts);
  console.log(`wrote ${outPath}`);
}
