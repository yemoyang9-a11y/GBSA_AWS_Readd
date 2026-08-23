import { describe, expect, it } from 'vitest';
import { resolveCoverUrl } from './coverOverrides';

describe('resolveCoverUrl', () => {
  it('override가 있고 cover_url이 비어 있으면 override를 쓴다', () => {
    expect(resolveCoverUrl('takryu', '')).toBe('/covers/takryu.jpg');
  });

  it('override가 있고 cover_url이 null이어도 override를 쓴다', () => {
    expect(resolveCoverUrl('takryu', null)).toBe('/covers/takryu.jpg');
  });

  it('실제 cover_url이 있으면 그대로 쓴다 — override로 덮지 않는다', () => {
    expect(resolveCoverUrl('takryu', 'https://real/cover.jpg')).toBe('https://real/cover.jpg');
  });

  it('override가 없는 book_id는 원래 값을 그대로 돌려준다', () => {
    expect(resolveCoverUrl('other-book', '')).toBe('');
    expect(resolveCoverUrl('other-book', null)).toBeNull();
  });
});
