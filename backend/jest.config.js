/**
 * Jest 설정
 *
 * tsconfig.json은 rootDir=./src, include=src/**만 잡고 있어 tests/ 를 컴파일 대상에서
 * 제외한다. ts-jest에 인라인 tsconfig를 넘겨 테스트 파일도 같은 strict 설정으로 검사한다.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
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
