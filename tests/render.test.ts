import { describe, expect, it } from 'vitest';
import { escapeMd, renderMd, renderPages, renderTxt } from '../src/core/render';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settings';
import type { PageSection } from '../src/core/types';

const pages: PageSection[] = [
  {
    koma: 78,
    side: 'right',
    pageNo: 2,
    label: '2頁',
    blocks: [
      { kind: 'title', lines: ['第一章 地 理'] },
      { kind: 'body', lines: ['例文の一行目であり', '二行目へ続く'] },
      { kind: 'body', lines: ['- 先頭が記号 *強調* #1'] },
    ],
  },
  { koma: 78, side: 'left', pageNo: 3, label: '3頁', blocks: [{ kind: 'note', lines: ['注記です'] }] },
];

const S = (patch: (s: Settings) => void = () => {}): Settings => {
  const s = structuredClone(DEFAULT_SETTINGS);
  patch(s);
  return s;
};

describe('TXT レンダラ', () => {
  it('既定: ラベル→本文、OCR行は改行のまま、ブロック間は空行、頁間は空行', () => {
    expect(renderTxt(pages, S())).toBe(
      [
        '2頁',
        '第一章 地 理',
        '',
        '例文の一行目であり',
        '二行目へ続く',
        '',
        '- 先頭が記号 *強調* #1',
        '',
        '3頁',
        '注記です',
      ].join('\n'),
    );
  });
  it('行連結・ラベル末尾・罫線区切り', () => {
    const s = S((x) => {
      x.content.lineJoin = 'join';
      x.label.position = 'after';
      x.label.separator = 'rule';
    });
    const out = renderTxt(pages, s);
    expect(out).toContain('例文の一行目であり二行目へ続く');
    expect(out).toContain('#1\n2頁\n\n--------------------\n\n注記です\n3頁');
  });
  it('ラベルなし', () => {
    expect(
      renderTxt(
        pages,
        S((x) => {
          x.label.position = 'none';
        }),
      ),
    ).not.toContain('2頁');
  });
});

describe('Markdown レンダラ', () => {
  it('既定: 罫線+太字ラベル、タイトルは見出し、OCR行は連結、特殊文字はエスケープ、注は引用', () => {
    const out = renderMd(
      pages,
      S((x) => {
        x.output.format = 'md';
      }),
    );
    expect(out).toBe(
      [
        '---',
        '',
        '**2頁**',
        '',
        '## 第一章 地 理',
        '',
        '例文の一行目であり二行目へ続く',
        '',
        '\\- 先頭が記号 \\*強調\\* #1',
        '',
        '---',
        '',
        '**3頁**',
        '',
        '> 注記です',
      ].join('\n'),
    );
  });
  it('見出し式ラベル・コメント式ラベル・行末2スペースの改行保持', () => {
    const heading = renderMd(
      pages,
      S((x) => {
        x.output.md.labelStyle = 'heading';
        x.output.md.labelHeadingLevel = 4;
      }),
    );
    expect(heading.startsWith('#### 2頁\n\n## 第一章')).toBe(true);
    const comment = renderMd(
      pages,
      S((x) => {
        x.output.md.labelStyle = 'comment';
      }),
    );
    expect(comment.startsWith('<!-- 2頁 -->')).toBe(true);
    const hard = renderMd(
      pages,
      S((x) => {
        x.content.lineJoin = 'keep';
        x.output.md.hardBreak = true;
      }),
    );
    expect(hard).toContain('例文の一行目であり  \n二行目へ続く');
  });
  it('escapeMd', () => {
    expect(escapeMd('# 見出し')).toBe('\\# 見出し');
    expect(escapeMd('1. 項目')).toBe('1\\. 項目');
    expect(escapeMd('a_b*c`d[e]<f>')).toBe('a\\_b\\*c\\`d\\[e\\]\\<f>');
    expect(escapeMd('普通の文')).toBe('普通の文');
  });
});

describe('renderPages', () => {
  it('既定の形式は TXT', () => {
    expect(DEFAULT_SETTINGS.output.format).toBe('txt');
    expect(renderPages(pages, S())).toBe(renderTxt(pages, S()));
  });
});
