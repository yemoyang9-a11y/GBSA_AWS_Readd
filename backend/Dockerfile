# 싸비 백엔드 — Fly.io 배포 이미지
#
# @see docs/migration.md — Phase 2 (EC2 + PM2 → Fly.io 컨테이너, 2026-08-29)
#
# 빌드 컨텍스트는 backend/ 다 (모노레포라 저장소 루트가 아니다).
# fly.toml 이 같은 디렉터리에 있으므로 `fly deploy` 를 backend/ 에서 실행한다.

# ---------- 빌드 단계 ----------
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 먼저 — 소스만 바뀌었을 때 이 레이어를 재사용한다
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- 실행 단계 ----------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 프로덕션 의존성만 — devDependencies(typescript, jest, eslint 등)를 이미지에 넣지 않는다
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# 마이그레이션 SQL — 컨테이너 안에서 `npm run db:migrate` 를 돌릴 수 있게 남긴다
COPY migrations ./migrations
COPY scripts ./scripts

# 테스트 페이지 (index.ts 가 /test 로 서빙한다). 작아서 넣어 둔다
COPY public ./public

# ⚠️ backend/data/ 는 넣지 않는다 (.dockerignore) — 「탁류」 원문 970KB 는 배치
#    파이프라인(장 요약·임베딩 생성)에서만 쓰고 API 서버 런타임에는 필요 없다.
#    배치는 로컬에서 Supabase 를 향해 돌린다.

# 비루트 사용자로 실행 — node 이미지에 이미 있는 계정을 쓴다
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
