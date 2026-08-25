import { splitMarkdownBold } from './parseMarkdownBold';

describe('splitMarkdownBold', () => {
  it('굵게 표시 없는 텍스트는 그대로 한 세그먼트로 돌려준다', () => {
    expect(splitMarkdownBold('정주사는 미두장에 다닌다.')).toEqual([
      { text: '정주사는 미두장에 다닌다.', bold: false },
    ]);
  });

  it('**로 감싼 부분만 bold:true로 분리하고 별표는 없앤다', () => {
    expect(splitMarkdownBold('**기본 정보:**')).toEqual([{ text: '기본 정보:', bold: true }]);
  });

  it('굵게 표시와 일반 텍스트가 섞여 있으면 순서대로 분리한다', () => {
    expect(splitMarkdownBold('정주사는 **하바꾼**으로 일한다')).toEqual([
      { text: '정주사는 ', bold: false },
      { text: '하바꾼', bold: true },
      { text: '으로 일한다', bold: false },
    ]);
  });

  it('굵게 표시가 여러 번 나오면 전부 분리한다', () => {
    expect(splitMarkdownBold('**부인 유씨**와 함께 **여섯 식구**를 꾸린다')).toEqual([
      { text: '부인 유씨', bold: true },
      { text: '와 함께 ', bold: false },
      { text: '여섯 식구', bold: true },
      { text: '를 꾸린다', bold: false },
    ]);
  });
});
