/**
 * Jest 설정
 *
 * ⚠️ 병합 시점 통합본 (2026-08-20) — 세 팀이 각자 다른 테스트 위치 관례를 썼다.
 *    R1: src/batch/pipeline/*.test.ts (소스 옆 co-location)
 *    R2: tests/unit/**·tests/static/**  (최상위 tests/ 디렉토리)
 *    R3: src/modules/**\/__tests__/*.test.ts (__tests__ 서브폴더)
 *    testMatch를 세 관례를 모두 포괄하는 두 글롭으로 합쳤다 — 어느 한 팀 테스트도
 *    빠지면 안 된다.
 *
 * tsconfig.json은 rootDir=./src, include=src/**만 잡고 있어 tests/ 를 컴파일 대상에서
 * 제외한다. ts-jest에 인라인 tsconfig를 넘겨 src/ 밖(tests/)의 테스트 파일도 같은
 * strict 설정으로 검사한다 — main의 `preset: 'ts-jest'`(프로젝트 tsconfig 그대로 사용)
 * 대신 이 방식을 유지한 이유다.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/__tests__/**'],
  coverageDirectory: 'coverage',
  verbose: true,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          lib: ['ES2022'],
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          strict: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
        },
      },
    ],
  },
}
