/**
 * 세션 종료 스위퍼 실행 스크립트 — DATABASE_URL이 실제 RDS를 가리켜야 동작한다.
 * 사용법: npx ts-node src/batch/session-sweeper/run-sweep.ts
 *
 * 배포 계층에서 1분 주기로 이 스크립트를 반복 실행한다(A3, 4.8절 — 별도 실행 단위.
 * 스케줄러 자체는 이 파일에 두지 않는다).
 */
import { pool } from '../../config/database'
import { createReadingStateServices } from '../../modules/reading-state/composition'
import { systemClock } from '../../modules/reading-state/clock'
import { runSweep } from './sweep'

async function main(): Promise<void> {
  const services = createReadingStateServices(pool)

  const report = await runSweep({
    sessions: services.sessions,
    cutoffService: services.cutoffService,
    recapService: services.recapService,
    conversationHistory: services.conversationHistory,
    clock: systemClock,
  })

  console.log(`[OK] 스위퍼 실행 완료 — 처리 ${report.processed}건, 실패 ${report.failed.length}건`)
  if (report.failed.length > 0) {
    console.warn('[WARN] 실패 대상', report.failed)
  }

  await pool.end()
}

main().catch((err) => {
  console.error('[FAIL] 스위퍼 실행 실패', err)
  process.exit(1)
})
