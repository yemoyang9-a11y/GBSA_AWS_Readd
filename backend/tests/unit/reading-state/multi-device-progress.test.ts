import { randomUUID } from 'crypto';
import { createCutoffService } from '../../../src/modules/reading-state/cutoff.service';
import { createProgressService } from '../../../src/modules/reading-state/progress.service';
import { createSessionService } from '../../../src/modules/reading-state/session.service';
import { FakeClock, FakeReadingSessionRepository, SEED_BOOK_ID, makeSeededFakes } from './fakes';

const READER_ID = 'reader-shared-by-two-devices';

function setup() {
  const { positions, books } = makeSeededFakes();
  const clock = new FakeClock(new Date('2026-11-10T00:00:00Z'));
  const sessions = new FakeReadingSessionRepository(clock);
  const progress = createProgressService({ positions });
  const session = createSessionService({ positions, books, sessions, clock });
  const cutoff = createCutoffService({ positions, books });

  function device() {
    const deviceId = randomUUID();
    let seq = 0;
    return {
      async enter() {
        await session.decideEntry(READER_ID, SEED_BOOK_ID);
        seq = 0;
      },
      async openPage(page: number) {
        seq += 1;
        await progress.acceptProgressEvent(READER_ID, SEED_BOOK_ID, { page, seq }, deviceId);
      },
      async sendStale(page: number, staleSeq: number) {
        await progress.acceptProgressEvent(
          READER_ID,
          SEED_BOOK_ID,
          { page, seq: staleSeq },
          deviceId
        );
      },
    };
  }

  const currentCutoff = async () =>
    (await cutoff.getCutoffSnapshot(READER_ID, SEED_BOOK_ID)).cutoff;

  return { device, currentCutoff };
}

async function deviceAReadThenDeviceBEnters(context: ReturnType<typeof setup>) {
  const a = context.device();
  const b = context.device();
  await a.enter();
  await a.openPage(5);
  await a.openPage(6);
  await a.openPage(7);
  await b.enter();
  return { a, b };
}

describe('같은 독자 ID를 쓰는 두 기기의 진도', () => {
  test('FR-PRG-003: 기기 B 진입 뒤 기기 A가 넘긴 쪽이 기준점에 반영된다', async () => {
    const context = setup();
    const { a } = await deviceAReadThenDeviceBEnters(context);

    await a.openPage(8);

    expect(await context.currentCutoff()).toBe(8);
  });

  test('FR-PRG-003: 기기 A가 다시 넘긴 뒤 기기 B가 넘긴 쪽도 기준점에 반영된다', async () => {
    const context = setup();
    const { a, b } = await deviceAReadThenDeviceBEnters(context);

    await a.openPage(8);
    await b.openPage(12);

    expect(await context.currentCutoff()).toBe(12);
  });

  test('FR-PRG-003: 기기 B가 앞쪽으로 돌아가도 마지막으로 열어본 페이지가 기준점이다', async () => {
    const context = setup();
    const { a, b } = await deviceAReadThenDeviceBEnters(context);

    await a.openPage(20);
    await b.openPage(3);

    expect(await context.currentCutoff()).toBe(3);
  });

  test('FR-PRG-003: 두 기기가 번갈아 넘기면 매번 마지막 페이지가 기준점이다', async () => {
    const context = setup();
    const { a, b } = await deviceAReadThenDeviceBEnters(context);

    await a.openPage(8);
    expect(await context.currentCutoff()).toBe(8);
    await b.openPage(9);
    expect(await context.currentCutoff()).toBe(9);
    await a.openPage(10);
    expect(await context.currentCutoff()).toBe(10);
    await b.openPage(11);
    expect(await context.currentCutoff()).toBe(11);
  });

  test('FR-PRG-002: 한 기기 안에서 늦게 도착한 낡은 seq는 두 기기 상황에서도 반영되지 않는다', async () => {
    const context = setup();
    const { a } = await deviceAReadThenDeviceBEnters(context);

    await a.openPage(8);
    await a.sendStale(2, 1);

    expect(await context.currentCutoff()).toBe(8);
  });
});
