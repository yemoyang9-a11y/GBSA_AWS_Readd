/**
 * GET /books/{b}/pages/{n} — FR-PRG-001, R3, team-sync §4.10
 *
 * 진도에 관여하지 않는다(선요청 안전). 이동 대상 페이지도 서버가 내려준 값을 쓴다.
 */

import { createPageService } from '../../../src/modules/content/page.service'
import type { ContentRepository, PageRow } from '../../../src/modules/content/repository'

function repo(page: PageRow | null): ContentRepository {
  return {
    findCatalog: async () => [],
    findReadiness: async () => true,
    findBasicInfo: async () => null,
    findChapters: async () => [],
    findBackgroundAndIntro: async () => ({ introduction: '', background: '' }),
    findPage: async () => page,
  }
}

describe('PageService', () => {
  test('본문과 이웃 페이지 번호를 그대로 내려보낸다 (team-sync §4.10)', async () => {
    const service = createPageService({
      content: repo({ page_no: 5, content: '정 주사는...', prev_page: 4, next_page: 6 }),
    })

    expect(await service.getPage('takryu', 5)).toEqual({
      page_no: 5,
      content: '정 주사는...',
      prev_page: 4,
      next_page: 6,
    })
  })

  test('첫 페이지의 prev_page 와 마지막 페이지의 next_page 는 null', async () => {
    const first = createPageService({
      content: repo({ page_no: 1, content: '첫 장', prev_page: null, next_page: 2 }),
    })
    expect((await first.getPage('takryu', 1))?.prev_page).toBeNull()

    const last = createPageService({
      content: repo({ page_no: 411, content: '끝', prev_page: 410, next_page: null }),
    })
    expect((await last.getPage('takryu', 411))?.next_page).toBeNull()
  })

  test('이웃 페이지를 서비스가 계산하지 않는다 — 리포지토리 값을 그대로 옮긴다', async () => {
    // 일부러 어긋난 값을 준다. page_no ± 1 로 재계산하면 이 단언이 깨진다
    // (프론트의 page - 1 금지와 같은 이유 — 파생값 단일 원천, FR-BRF-005 🚦)
    const service = createPageService({
      content: repo({ page_no: 5, content: '본문', prev_page: 2, next_page: 9 }),
    })

    const page = await service.getPage('takryu', 5)

    expect(page?.prev_page).toBe(2)
    expect(page?.next_page).toBe(9)
  })

  test('R3·FR-PRG-001: 진도에 관여하지 않는다 — 디바이스도 기준점도 인자로 받지 않는다', () => {
    const service = createPageService({ content: repo(null) })

    // (bookId, pageNo) 둘뿐. deviceId 나 cutoff 가 생기면 이 테스트가 깨진다
    expect(service.getPage.length).toBe(2)
  })

  test('없는 페이지는 null (404 의 재료)', async () => {
    const service = createPageService({ content: repo(null) })

    expect(await service.getPage('takryu', 999)).toBeNull()
  })
})
