/**
 * error-patterns unit testleri
 * F2 regresyon koruması: düzyazıdaki "FAIL" kelimesi test_fail üretmemeli
 * (2026-06-04'te ledger'da sahte kayıtlar kanıtlandı).
 */
import { describe, it, expect } from 'vitest';
import { matchErrorPatterns } from './error-patterns.js';

describe('matchErrorPatterns — gerçek hatalar yakalanır', () => {
  it.each([
    // [çıktı, beklenen pattern]
    ['src/x.ts(5,3): error TS2304: Cannot find name foo', 'typescript-error'],
    ['Program.cs(10,5): error CS0103: The name does not exist', 'csharp-error'],
    ['error MSB3073: The command exited with code 1', 'msbuild-error'],
    ['SCRIPT ERROR: Invalid get index on base Nil', 'godot-script-error'],
    ['USER ERROR: Condition "!is_inside_tree()" is true', 'godot-user-error'],
    ['Export template not found for preset Windows', 'godot-export-error'],
    ['error[E0382]: borrow of moved value', 'rust-error'],
    [' FAIL src/components/auth.test.ts\n  ● login fails', 'test-failure'],
    ['FAIL\tgithub.com/acme/app\t0.412s', 'go-test-failure'],
    ['FAILED tests/test_auth.py::test_login - AssertionError', 'pytest-failure'],
    ['Tests: 3 failed, 12 passed', 'test-failure'],
    // B3: boş test koşumu = false-green
    ['No test files found, exiting with code 0', 'empty-test-run'],
    ['============ collected 0 items ============', 'empty-test-run'],
    ['testing: warning: no tests to run', 'empty-test-run'],
    ['Tests: 0 passed, 0 total', 'empty-test-run'],
    ['✖ 12 problems (3 errors, 9 warnings)', 'eslint-errors'],
    ['TypeError: Cannot read properties of undefined', 'type-runtime-error'],
    ["ModuleNotFoundError: No module named 'requests'", 'python-missing-module'],
  ])('%s → %s', (output, expectedPattern) => {
    const matches = matchErrorPatterns(output);
    expect(matches.map((m) => m.pattern)).toContain(expectedPattern);
  });
});

describe('matchErrorPatterns — F2 sahte pozitifler YAKALANMAZ', () => {
  it.each([
    // Ledger'da kanıtlanmış gerçek sahte pozitif örnekleri (düzyazı)
    'FAIL = gerçek pass/fail kanıtı. Bu dosya csproj/sln DEĞİL',
    'FAIL riski yüksek** | B. Fixed-point matematik',
    'Bu test PASS/FAIL ayrımı için önemli',
    // "N failed" olmayan masum metinler
    'all tests passed successfully',
    'The build completed without issues',
  ])('düzyazı: %s', (output) => {
    const matches = matchErrorPatterns(output);
    expect(matches.filter((m) => m.type === 'test_fail')).toEqual([]);
  });

  it('boş/kısa çıktı → boş dizi', () => {
    expect(matchErrorPatterns('')).toEqual([]);
    expect(matchErrorPatterns('ok')).toEqual([]);
  });
});
