#!/usr/bin/env bash
#
# Phase 3 — RDS 덤프를 Supabase 로 이전한다 (2026-08-30)
#
# @see docs/migration.md — Phase 3
#
# 사용:
#   export SUPABASE_DB_URL='postgresql://...'   # 값은 파일에 남기지 않는다
#   bash scripts/migrate-to-supabase.sh
#
# ⚠️ pg16 이상 클라이언트가 필요하다. 덤프가 서버 16.15 에서 떠졌기 때문에
#    pg15 의 pg_restore 로 열면 "unsupported version (1.15) in file header" 가 난다
#    (덤프가 깨진 게 아니라 읽는 쪽 버전 문제다).
#
# ⚠️ 이 스크립트는 4단계에서 **임베딩을 전량 삭제한다.** Titan 벡터를 남겨 두면
#    Cohere 벡터와 섞여 검색이 조용히 무의미해지기 때문이다(에러도 로그도 안 난다).
#    되돌릴 수 없으니 대상 DB 를 반드시 확인하고 실행할 것.

set -euo pipefail

DUMP="${DUMP:-../backup/ssabi.dump}"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL 환경변수가 필요하다 (값은 셸에서만 준다)" >&2
  exit 1
fi
if [ ! -f "$DUMP" ]; then
  echo "덤프를 찾을 수 없다: $DUMP" >&2
  exit 1
fi

psql_q() { psql "$SUPABASE_DB_URL" -t -A -c "$1"; }

echo "=== 0. 접속 확인 ==="
psql_q "SELECT 'PostgreSQL ' || current_setting('server_version');"

echo
echo "=== 1. vector 확장 ==="
psql_q "CREATE EXTENSION IF NOT EXISTS vector;"
psql_q "SELECT '  설치됨: vector ' || extversion FROM pg_extension WHERE extname='vector';"

echo
echo "=== 2. 덤프 복원 ==="
# --no-owner --no-privileges: 소유자·권한 구문을 건너뛴다. Supabase 의 역할 체계가
#   RDS 와 달라서 그대로 넣으면 권한 오류가 쏟아진다.
# --clean --if-exists 는 쓰지 않는다 — 빈 DB 전제이고, 실수로 기존 데이터를 지우지 않기 위함.
pg_restore --no-owner --no-privileges --no-comments \
  -d "$SUPABASE_DB_URL" "$DUMP" 2>&1 | grep -viE "^$" | tail -20 || true

echo
echo "=== 2b. 테이블 수 대조 (기대: 20개) ==="
psql_q "SELECT '  테이블 ' || count(*) || '개' FROM information_schema.tables WHERE table_schema='public';"

echo
echo "=== 2c. 행 수 (백업 시점과 대조할 것) ==="
psql_q "SELECT '  ' || rpad(relname, 28) || n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

echo
echo "=== 3. HNSW 인덱스 확인 (001_content_store.sql 기준) ==="
psql_q "SELECT '  ' || indexname || ' → ' || indexdef FROM pg_indexes WHERE tablename='pages' AND indexdef ILIKE '%hnsw%';"
HNSW=$(psql_q "SELECT count(*) FROM pg_indexes WHERE tablename='pages' AND indexdef ILIKE '%hnsw%';")
if [ "$HNSW" = "0" ]; then
  echo "  ⚠️ HNSW 인덱스가 없다 — 덤프에 안 따라왔다. 아래로 만든다."
  psql_q "CREATE INDEX IF NOT EXISTS ix_pages_embedding ON pages USING hnsw (embedding vector_cosine_ops);"
  echo "  생성 완료"
fi

echo
echo "=== 4. 임베딩 무효화 전 상태 ==="
psql_q "SELECT '  적재됨 ' || count(*) FILTER (WHERE embedding IS NOT NULL) || ' / 전체 ' || count(*) FROM pages WHERE book_id='takryu';"
psql_q "SELECT '  현재 차원: ' || COALESCE(max(vector_dims(embedding))::text,'(없음)') FROM pages WHERE embedding IS NOT NULL;"

echo
echo "=== 4b. Titan 임베딩 전량 무효화 ==="
echo "  ⚠️ 되돌릴 수 없다. 5초 후 진행 (Ctrl+C 로 취소)"
sleep 5
psql_q "UPDATE pages SET embedding = NULL;"
psql_q "SELECT '  무효화 후 남은 임베딩: ' || count(*) FROM pages WHERE embedding IS NOT NULL;"

echo
echo "=== 완료 ==="
echo "다음: Cohere 재임베딩"
echo "  COHERE_API_KEY=... DATABASE_URL=\"\$SUPABASE_DB_URL\" npx ts-node src/batch/pipeline/run-embed-pages.ts"
echo "그 다음 차원 확인:"
echo "  psql \"\$SUPABASE_DB_URL\" -c \"SELECT vector_dims(embedding) FROM pages WHERE embedding IS NOT NULL LIMIT 1;\""
