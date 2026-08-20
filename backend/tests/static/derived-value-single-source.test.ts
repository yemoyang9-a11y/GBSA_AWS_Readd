/**
 * S1 게이트 테스트 — 파생값 단일 원천 정적 검색
 *
 * 근거: dev-spec-R2-core.md 4.5절 자가 검증 표 4번
 *       "결정기 외 코드에 `page - 1`·`/ total` 패턴 0건 (정적 검색). grep으로 확인하고 CI에 넣는다"
 *
 * 조항: FR-BRF-005 🚦 · CLAUDE.md 절대 규칙 2번
 *       "기준점 결정기 밖에서 `page - 1` 또는 `%` 계산 (프론트 포함)"
 *
 * FR-BRF-005의 "불일치 0건"은 검증으로 맞추는 것이 아니라 계산 지점 단일화로 달성한다
 * (architecture-r1.md 3.3절). 이 테스트가 그 단일화를 기계적으로 고정한다.
 *
 * 검사 대상에서 tests/ 를 제외한다 — 상한 테스트 자체가 `page - 1`을 기대값으로 계산하며,
 * 조항이 겨냥하는 것은 런타임 코드 경로다. 테스트용 우회가 아니라 검사 범위의 정의다.
 */

import * as fs from 'fs'
import * as path from 'path'

const BACKEND_ROOT = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..')

/** 파생값을 계산할 수 있는 유일한 파일 — 기준점 결정기 */
const SOLE_DERIVATION_POINT = path.join(
  BACKEND_ROOT,
  'src/modules/reading-state/cutoff.service.ts'
)

/** 검사 대상 루트 — 프론트엔드도 포함한다 (절대 규칙 2번 "프론트 포함") */
const SCAN_ROOTS = [
  path.join(BACKEND_ROOT, 'src'),
  path.join(REPO_ROOT, 'frontend', 'src'),
]

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git'])
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

const FORBIDDEN_PATTERNS = [
  {
    label: '기준점 재계산 (page - 1)',
    regex: /\b(current_?[Pp]age|page_?[Nn]o|page)\s*[-−]\s*1\b/,
  },
  {
    label: '진도 % 재계산 (/ total_pages)',
    regex: /\/\s*\(?\s*(total_?[Pp]ages|total_?[Pp]age_?[Cc]ount)\b/,
  },
]

/**
 * 주석을 공백으로 치환한다. 조항이 금지하는 것은 "계산"이므로 서술용 주석
 * (예: shared/types.ts의 `기준점 (current_page - 1)`)은 위반이 아니다.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

function collectSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []

  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
        continue
      }
      if (SCAN_EXTENSIONS.has(path.extname(entry.name))) out.push(path.join(dir, entry.name))
    }
  }
  walk(root)
  return out
}

describe('FR-BRF-005 🚦 파생값 단일 원천 — 정적 검색', () => {
  const files = SCAN_ROOTS.flatMap(collectSourceFiles)

  test('검사 대상 소스가 실제로 수집된다 (검사가 공집합을 통과하지 않는다)', () => {
    // positive 쌍 — 파일이 0개면 아래 "0건" 테스트는 항상 통과한다 (테스트 규약 3.4절)
    expect(files.length).toBeGreaterThan(0)
  })

  test('FR-BRF-005 🚦: 기준점 결정기 밖에 `page - 1` · `/ total_pages` 패턴이 0건', () => {
    const violations: string[] = []

    for (const file of files) {
      if (path.resolve(file) === path.resolve(SOLE_DERIVATION_POINT)) continue

      const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        for (const { label, regex } of FORBIDDEN_PATTERNS) {
          if (regex.test(line)) {
            violations.push(`${path.relative(REPO_ROOT, file)}:${i + 1} — ${label}`)
          }
        }
      })
    }

    expect(violations).toEqual([])
  })

  test('기준점 결정기 자체는 파생 계산을 담고 있다 (검사 규칙이 헛돌지 않는다)', () => {
    // positive 쌍 — 결정기에서 패턴이 사라졌다면 계산이 다른 곳으로 옮겨간 것이다
    const source = stripComments(fs.readFileSync(SOLE_DERIVATION_POINT, 'utf8'))

    for (const { label, regex } of FORBIDDEN_PATTERNS) {
      expect({ label, found: regex.test(source) }).toEqual({ label, found: true })
    }
  })
})
