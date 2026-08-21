/**
 * GET /books/{b}/pages/{n} — 본문 단건 (R4, S1·S3)
 *
 * 조항: FR-PRG-001(재분할 금지의 좌표계) · R3(본문 접근은 제한하지 않는다)
 *
 * ⚠️ 이 엔드포인트는 진도에 관여하지 않는다 — (page, seq)를 동봉받지 않고 기준점도 움직이지
 *    않는다. 프리페치가 기준점을 밀지 않게 하려는 것이다 (team-sync-r4.md §1.1·§4.3).
 *    진도는 POST /books/{b}/progress 하나로만 올라간다.
 *
 * ⚠️ 이웃 페이지를 여기서 계산하지 않는다. 리포지토리가 준 prev_page·next_page 를 그대로
 *    옮긴다 — 서버가 이 값을 주기로 한 것 자체가 프론트의 `page ± 1` 산술을 없애려는
 *    결정이었다 (team-sync §4.10). 서버에서 다시 산술을 하면 그 결정이 무의미해진다.
 *
 * ⚠️ cutoff 인자가 없다. 본문 접근은 상한 대상이 아니다 (R3, FR-SPL-001) — 차단 대상은
 *    싸비가 제공하는 정보뿐이다. 미완비 도서 차단은 별개이며 라우트의 ensureBookReady 가 맡는다.
 */

import type { ContentRepository, PageRow } from './repository';

export interface PageServiceDeps {
  content: ContentRepository;
}

export interface PageService {
  getPage(bookId: string, pageNo: number): Promise<PageRow | null>;
}

export function createPageService(deps: PageServiceDeps): PageService {
  const { content } = deps;

  return {
    async getPage(bookId: string, pageNo: number): Promise<PageRow | null> {
      return content.findPage(bookId, pageNo);
    },
  };
}
