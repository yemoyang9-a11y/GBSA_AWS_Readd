import { resumeLabel } from './resumeLabel';
import type { BookSummary } from '../types';

const base: BookSummary = {
  book_id: 'takryu',
  title: '탁류',
  author: '채만식',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-10-01T00:00:00.000Z',
};

const progress = {
  current_page: 21,
  percent: 70,
  is_complete: false,
  last_read_at: '2026-11-09T00:00:00.000Z',
};

test('FR-BRW-002: 준비되지 않은 책은 아직 준비 중입니다', () => {
  expect(resumeLabel({ ...base, ssabi_ready: false, progress }, false)).toBe('아직 준비 중입니다');
  expect(resumeLabel({ ...base, ssabi_ready: false }, true)).toBe('아직 준비 중입니다');
});

test('여는 중이면 여는 중', () => {
  expect(resumeLabel({ ...base, progress }, true)).toBe('여는 중');
  expect(resumeLabel(base, true)).toBe('여는 중');
});

test('진도가 있으면 이어서 읽기', () => {
  expect(resumeLabel({ ...base, progress }, false)).toBe('이어서 읽기');
});

test('진도가 없으면 읽기 시작', () => {
  expect(resumeLabel(base, false)).toBe('읽기 시작');
});
