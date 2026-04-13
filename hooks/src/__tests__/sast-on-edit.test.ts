import { describe, it, expect } from 'vitest';
import { isSupportedFile, scanContent, formatFindings } from '../sast-on-edit.js';

describe('sast-on-edit', () => {
  describe('isSupportedFile', () => {
    it('accepts .ts files', () => {
      expect(isSupportedFile('/src/index.ts')).toBe(true);
    });

    it('accepts .py files', () => {
      expect(isSupportedFile('/app/main.py')).toBe(true);
    });

    it('accepts .jsx files', () => {
      expect(isSupportedFile('/src/App.jsx')).toBe(true);
    });

    it('rejects .md files', () => {
      expect(isSupportedFile('/docs/README.md')).toBe(false);
    });

    it('rejects .css files', () => {
      expect(isSupportedFile('/src/style.css')).toBe(false);
    });

    it('rejects files without extension', () => {
      expect(isSupportedFile('/bin/myapp')).toBe(false);
    });
  });

  describe('scanContent - CRITICAL patterns', () => {
    it('detects eval()', () => {
      const findings = scanContent('const x = eval("1+1");');
      expect(findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });

    it('detects new Function()', () => {
      const findings = scanContent('const fn = new Function("return 1");');
      expect(findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });

    it('detects exec()', () => {
      const findings = scanContent('child_process.exec("ls -la");');
      expect(findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });

    it('detects execSync()', () => {
      const findings = scanContent('execSync("rm -rf /tmp/x");');
      expect(findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });

    it('detects os.system()', () => {
      const findings = scanContent('os.system("whoami")');
      expect(findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });

    it('detects subprocess patterns', () => {
      const findings = scanContent('subprocess.call(["ls"])');
      expect(findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });
  });

  describe('scanContent - HIGH patterns', () => {
    it('detects innerHTML', () => {
      const findings = scanContent('element.innerHTML = userInput;');
      expect(findings.some(f => f.severity === 'HIGH')).toBe(true);
    });

    it('detects dangerouslySetInnerHTML', () => {
      const findings = scanContent('<div dangerouslySetInnerHTML={{__html: data}} />');
      expect(findings.some(f => f.severity === 'HIGH')).toBe(true);
    });

    it('detects document.write()', () => {
      const findings = scanContent('document.write("<h1>Hello</h1>");');
      expect(findings.some(f => f.severity === 'HIGH')).toBe(true);
    });

    it('detects pickle.load()', () => {
      const findings = scanContent('data = pickle.load(file)');
      expect(findings.some(f => f.severity === 'HIGH')).toBe(true);
    });
  });

  describe('scanContent - comment skipping', () => {
    it('skips single line comment //', () => {
      const findings = scanContent('// eval("dangerous")');
      const evalFindings = findings.filter(f => f.category === 'code-injection' || f.message?.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('skips Python comment #', () => {
      const findings = scanContent('# os.system("cmd")');
      expect(findings).toHaveLength(0);
    });

    it('skips block comment opening /*', () => {
      const findings = scanContent('/* eval("test") */');
      const evalFindings = findings.filter(f => f.message?.includes('eval'));
      expect(evalFindings).toHaveLength(0);
    });

    it('scans normal code lines', () => {
      const findings = scanContent('const result = eval(userInput);');
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe('scanContent - safe code', () => {
    it('returns empty for normal code', () => {
      const findings = scanContent('const x = 1;\nfunction add(a, b) { return a + b; }');
      expect(findings).toHaveLength(0);
    });

    it('returns empty for empty content', () => {
      const findings = scanContent('');
      expect(findings).toHaveLength(0);
    });
  });

  describe('scanContent - deduplication', () => {
    it('deduplicates same category + severity', () => {
      const findings = scanContent('eval("a");\neval("b");\neval("c");');
      const criticals = findings.filter(f => f.severity === 'CRITICAL');
      // Same category should appear only once
      const categories = new Set(criticals.map(f => f.category));
      expect(criticals.length).toBe(categories.size);
    });
  });

  describe('formatFindings', () => {
    it('returns empty string for no findings', () => {
      expect(formatFindings([])).toBe('');
    });

    it('formats single CRITICAL finding', () => {
      const findings = scanContent('eval("x");');
      const result = formatFindings(findings);
      expect(result).toContain('CRITICAL');
      expect(result).toContain('SAST UYARI');
    });

    it('formats multiple severity levels', () => {
      const findings = scanContent('eval("x");\nelement.innerHTML = y;');
      const result = formatFindings(findings);
      expect(result).toContain('CRITICAL');
      expect(result).toContain('HIGH');
    });

    it('includes scanner recommendation', () => {
      const findings = scanContent('eval("x");');
      const result = formatFindings(findings);
      expect(result).toContain('sast-scanner');
    });
  });
});
