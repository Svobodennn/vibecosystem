/**
 * Error Patterns - Ortak hata pattern kütüphanesi
 *
 * Tool çıktılarında (stdout/stderr) gömülü hata sinyallerini yakalar.
 * canavar-error-broadcast (PostToolUse) kullanır; başka scanner'lar da kullanabilir.
 *
 * NOT: Bu pattern'lar BAŞARILI tool call'ların çıktısındaki gömülü hatalar içindir
 * (exit 0 maskeleme, `cmd || true`, pipe yutması). Hard fail'ler transcript
 * scan'iyle yakalanır (agent-error-scan.ts) çünkü PostToolUse fail'de ateşlenmez.
 *
 * 2026-06-04 F2 düzeltmesi: eski /FAIL\s+(.+?)$/m düzyazıdaki "FAIL = ..." gibi
 * metinleri de yakalıyordu (ledger'da sahte test_fail kirliliği). Yeni FAIL
 * pattern'ları test-runner çıktı biçimlerine daraltıldı.
 */

export interface ErrorPattern {
  regex: RegExp;
  type: string;
  pattern: string;
  lesson: (m: RegExpExecArray) => string;
}

export interface ErrorMatch {
  type: string;
  pattern: string;
  detail: string;
  lesson: string;
}

export const ERROR_PATTERNS: ErrorPattern[] = [
  // --- Build / TypeScript ---
  {
    regex: /error TS(\d+):\s*(.+)/,
    type: 'build_fail',
    pattern: 'typescript-error',
    lesson: (m) => `TS${m[1]}: ${m[2].slice(0, 80)}`,
  },
  {
    regex: /Cannot find module ['"](.+?)['"]/i,
    type: 'build_fail',
    pattern: 'missing-import',
    lesson: (m) => `${m[1]} import'u eksik`,
  },
  {
    regex: /Property ['"](.+?)['"] does not exist/i,
    type: 'type_error',
    pattern: 'missing-property',
    lesson: (m) => `'${m[1]}' property'si yok`,
  },
  {
    regex: /Type ['"](.+?)['"] is not assignable to type ['"](.+?)['"]/i,
    type: 'type_error',
    pattern: 'type-mismatch',
    lesson: (m) => `${m[1]} → ${m[2]} atanamaz`,
  },

  // --- C# / .NET (Godot C# projeleri dahil) ---
  {
    regex: /error CS(\d{4}):?\s*(.+)/,
    type: 'build_fail',
    pattern: 'csharp-error',
    lesson: (m) => `CS${m[1]}: ${m[2].slice(0, 80)}`,
  },
  {
    regex: /error MSB(\d{4}):?\s*(.+)/,
    type: 'build_fail',
    pattern: 'msbuild-error',
    lesson: (m) => `MSB${m[1]}: ${m[2].slice(0, 80)}`,
  },

  // --- Godot ---
  {
    regex: /SCRIPT ERROR:\s*(.+)/,
    type: 'runtime_error',
    pattern: 'godot-script-error',
    lesson: (m) => `Godot script: ${m[1].slice(0, 80)}`,
  },
  {
    regex: /USER ERROR:\s*(.+)/,
    type: 'runtime_error',
    pattern: 'godot-user-error',
    lesson: (m) => `Godot: ${m[1].slice(0, 80)}`,
  },
  {
    regex: /(?:export template|export preset).{0,50}(?:missing|not found|invalid)/i,
    type: 'build_fail',
    pattern: 'godot-export-error',
    lesson: () => 'Godot export template/preset sorunu — export ayarlarını kontrol et',
  },

  // --- Rust ---
  {
    regex: /error\[E(\d{4})\]:?\s*(.+)/,
    type: 'build_fail',
    pattern: 'rust-error',
    lesson: (m) => `rustc E${m[1]}: ${m[2].slice(0, 80)}`,
  },

  // --- Test failures (daraltılmış: test-runner biçimleri, düzyazı DEĞİL) ---
  {
    // vitest/jest dosya satırı: "FAIL src/foo.test.ts" — token uzantılı dosya olmalı
    regex: /^\s*(?:✗\s*)?FAIL\s+(\S*\.(?:m?[jt]sx?|py|go|rs|cs|java|rb|php)\b\S*)/m,
    type: 'test_fail',
    pattern: 'test-failure',
    lesson: (m) => `Test FAIL: ${m[1].slice(0, 80)}`,
  },
  {
    // go test özeti: "FAIL\tgithub.com/x/y\t0.123s"
    regex: /^FAIL\s+(\S+)\s+[\d.]+s/m,
    type: 'test_fail',
    pattern: 'go-test-failure',
    lesson: (m) => `go test FAIL: ${m[1].slice(0, 80)}`,
  },
  {
    // pytest: "FAILED tests/test_x.py::test_y"
    regex: /^FAILED\s+(\S+::\S+)/m,
    type: 'test_fail',
    pattern: 'pytest-failure',
    lesson: (m) => `pytest FAILED: ${m[1].slice(0, 80)}`,
  },
  {
    regex: /(\d+) failed/i,
    type: 'test_fail',
    pattern: 'test-failure',
    lesson: (m) => `${m[1]} test basarisiz`,
  },

  // --- Boş test koşumu (false-green: "0 test koştu" = doğrulama YOK) ---
  {
    regex: /No test files? found/i,
    type: 'empty_test_run',
    pattern: 'empty-test-run',
    lesson: () => 'Test dosyası bulunamadı — "yeşil" sayma, test pattern/path yanlış olabilir',
  },
  {
    regex: /collected 0 items/,
    type: 'empty_test_run',
    pattern: 'empty-test-run',
    lesson: () => 'pytest 0 test topladı — doğrulama yapılmadı',
  },
  {
    regex: /testing:\s+warning:\s+no tests to run/,
    type: 'empty_test_run',
    pattern: 'empty-test-run',
    lesson: () => 'go test koşacak test bulamadı — doğrulama yapılmadı',
  },
  {
    regex: /Tests:\s*0 passed,?\s*0 total/,
    type: 'empty_test_run',
    pattern: 'empty-test-run',
    lesson: () => 'Jest 0 test koştu — doğrulama yapılmadı',
  },

  // --- Lint ---
  {
    // eslint özeti: "✖ 12 problems (3 errors, 9 warnings)"
    regex: /✖\s+\d+\s+problems?\s+\((\d+)\s+errors?/,
    type: 'lint_fail',
    pattern: 'eslint-errors',
    lesson: (m) => `eslint: ${m[1]} error`,
  },

  // --- Runtime ---
  {
    regex: /TypeError:\s*(.+)/,
    type: 'runtime_error',
    pattern: 'type-runtime-error',
    lesson: (m) => `TypeError: ${m[1].slice(0, 80)}`,
  },
  {
    regex: /ReferenceError:\s*(.+)/,
    type: 'runtime_error',
    pattern: 'reference-error',
    lesson: (m) => `ReferenceError: ${m[1].slice(0, 80)}`,
  },
  {
    regex: /SyntaxError:\s*(.+)/,
    type: 'build_fail',
    pattern: 'syntax-error',
    lesson: (m) => `SyntaxError: ${m[1].slice(0, 80)}`,
  },
  {
    regex: /(?:ENOENT|no such file|ENOENT: no such file or directory)[,:\s]+(?:open|stat|lstat|access|unlink|rename|read)?\s*['"](.+?)['"]/i,
    type: 'runtime_error',
    pattern: 'missing-file',
    lesson: (m) => `Dosya bulunamadi: ${m[1]}`,
  },

  // --- Go build ---
  {
    regex: /undefined:\s*(\w+)/,
    type: 'build_fail',
    pattern: 'go-undefined',
    lesson: (m) => `${m[1]} tanimlanmamis`,
  },

  // --- Python ---
  {
    regex: /ModuleNotFoundError:\s*No module named ['"](.+?)['"]/,
    type: 'runtime_error',
    pattern: 'python-missing-module',
    lesson: (m) => `Python modul eksik: ${m[1]}`,
  },
];

/** Çıktıda eşleşen tüm pattern'ları döndürür (pattern başına ilk eşleşme) */
export function matchErrorPatterns(output: string): ErrorMatch[] {
  if (!output) return [];
  const matches: ErrorMatch[] = [];
  for (const ep of ERROR_PATTERNS) {
    const m = ep.regex.exec(output);
    if (m) {
      matches.push({
        type: ep.type,
        pattern: ep.pattern,
        detail: m[0].slice(0, 200),
        lesson: ep.lesson(m),
      });
    }
  }
  return matches;
}
