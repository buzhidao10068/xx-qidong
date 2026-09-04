import { describe, expect, it } from 'vitest';
import { DEFAULT_STARS, MAX_STARS, MAX_TITLE_LEN, RANGES } from '../src/config';
import {
  applyPreset,
  defaultState,
  loadState,
  normalizeState,
  parseConfig,
  saveState,
  serializeState,
  type StorageLike,
} from '../src/state';

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('normalizeState — 缺失与垃圾输入', () => {
  it('空对象得到完整默认状态', () => {
    expect(normalizeState({})).toEqual(defaultState());
  });

  it.each([null, undefined, 'nonsense', 42, [], true])('非对象输入 %p 也回落到默认', (raw) => {
    expect(normalizeState(raw)).toEqual(defaultState());
  });

  it('原型链上的键不能骗过枚举校验', () => {
    // `'toString' in RATIOS` 是 true，用 in 做校验就会漏过去
    expect(normalizeState({ ratio: 'toString' }).ratio).toBe('16:9');
    expect(normalizeState({ font: 'constructor' }).font).toBe('song');
  });

  it('未知枚举值回落', () => {
    expect(normalizeState({ ratio: '21:9' }).ratio).toBe('16:9');
    expect(normalizeState({ font: 'comic' }).font).toBe('song');
    expect(normalizeState({ preset: '不存在' }).preset).toBe('genshin');
  });

  it('合法枚举值被保留', () => {
    expect(normalizeState({ ratio: '9:16' }).ratio).toBe('9:16');
    expect(normalizeState({ font: 'shu' }).font).toBe('shu');
  });
});

describe('normalizeState — 数值', () => {
  it('越界数值被 clamp 到滑块区间', () => {
    expect(normalizeState({ logoSize: 9999 }).logoSize).toBe(RANGES.logoSize.max);
    expect(normalizeState({ logoSize: -1 }).logoSize).toBe(RANGES.logoSize.min);
    expect(normalizeState({ lineGap: 0 }).lineGap).toBe(RANGES.lineGap.min);
  });

  it.each([null, true, '', 'abc', NaN, Infinity])('非数字 %p 用默认值而不是 0', (raw) => {
    expect(normalizeState({ logoSize: raw }).logoSize).toBe(defaultState().logoSize);
  });

  it('数字字符串可用', () => {
    expect(normalizeState({ logoSize: '30' }).logoSize).toBe(30);
  });

  it('位置允许略微出画但不能跑飞', () => {
    expect(normalizeState({ titleX: 5 }).titleX).toBe(1.15);
    expect(normalizeState({ titleY: -9 }).titleY).toBe(-0.15);
  });
});

describe('normalizeState — stars 与 lines', () => {
  it(`stars 恒补齐到 ${MAX_STARS} 项，已给的字段生效`, () => {
    const s = normalizeState({ stars: [{ size: 30 }] });
    expect(s.stars).toHaveLength(MAX_STARS);
    expect(s.stars[0]!.size).toBe(30);
    // 未给的字段来自该槽位的默认值，不是第 0 槽
    expect(s.stars[0]!.aspect).toBe(DEFAULT_STARS[0].aspect);
    expect(s.stars[1]).toEqual(DEFAULT_STARS[1]);
  });

  it('stars 里的垃圾项按槽位默认值补', () => {
    expect(normalizeState({ stars: ['x', null, 7] }).stars).toEqual(DEFAULT_STARS);
  });

  it('starCount 取整并 clamp', () => {
    expect(normalizeState({ starCount: 99 }).starCount).toBe(MAX_STARS);
    expect(normalizeState({ starCount: -5 }).starCount).toBe(0);
    expect(normalizeState({ starCount: 1.9 }).starCount).toBe(1);
  });

  /**
   * 上限与槽位默认值必须是同一份数据的两面。曾经是两处各写一个 3，把上限调大
   * 就会得到「数量能选到 4，但第 4 颗没有默认参数、画不出来」的状态。
   */
  it('槽位数量上限派生自 DEFAULT_STARS，不是另写一个数字', () => {
    expect(MAX_STARS).toBe(DEFAULT_STARS.length);
  });

  it('每个可选中的槽位都有完整的默认参数', () => {
    const { stars } = normalizeState({});
    expect(stars).toHaveLength(MAX_STARS);
    // starCount 能选到 MAX_STARS，所以每一项都得是能直接渲染的 StarState
    for (const star of stars) {
      for (const key of ['x', 'y', 'size', 'aspect', 'rot'] as const) {
        expect(Number.isFinite(star[key])).toBe(true);
      }
    }
  });

  it('lines 接受数组、字符串，并滤掉非字符串项', () => {
    expect(normalizeState({ lines: ['a', 'b'] }).lines).toEqual(['a', 'b']);
    expect(normalizeState({ lines: 'a\nb' }).lines).toEqual(['a', 'b']);
    expect(normalizeState({ lines: ['a', 3, null] }).lines).toEqual(['a']);
    expect(normalizeState({ lines: [] }).lines).toEqual([]);
  });
});

/**
 * 输入框的 maxlength 拦不住粘贴进来的配置 JSON 和 localStorage 里的旧值，
 * 所以上限得在状态层。
 */
describe('normalizeState — 标题长度', () => {
  it('不超限的标题一字不改', () => {
    expect(normalizeState({ title: '原神' }).title).toBe('原神');
    expect(normalizeState({ title: '' }).title).toBe('');
  });

  it('超长标题截到上限，不让它排到画面外面去', () => {
    const title = normalizeState({ title: '启'.repeat(200) }).title;
    expect(Array.from(title)).toHaveLength(MAX_TITLE_LEN);
  });

  it('按码点截断，不切出半个代理对', () => {
    // 每个 emoji 占两个 UTF-16 码元；按码元切会在中间断开、产生孤立代理
    const title = normalizeState({ title: '🌟'.repeat(MAX_TITLE_LEN + 5) }).title;
    expect(Array.from(title)).toHaveLength(MAX_TITLE_LEN);
    expect(title).toBe('🌟'.repeat(MAX_TITLE_LEN));
    expect(title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('往返之后长度不再变化（截断是幂等的）', () => {
    const once = normalizeState({ title: '启'.repeat(50) });
    expect(parseConfig(serializeState(once))).toEqual(once);
  });
});

describe('颜色', () => {
  it('非法颜色回落，合法颜色统一小写', () => {
    expect(normalizeState({ bg: 'red' }).bg).toBe('#ffffff');
    expect(normalizeState({ bg: '#FFF' }).bg).toBe('#ffffff');
    expect(normalizeState({ bg: '#AbCdEf' }).bg).toBe('#abcdef');
  });
});

describe('序列化往返与模板', () => {
  it('serialize → parseConfig 不丢信息', () => {
    const original = normalizeState({ title: '摸鱼', ratio: '1:1', starCount: 3 });
    expect(parseConfig(serializeState(original))).toEqual(original);
  });

  it('坏 JSON 得到 null 而不是抛异常', () => {
    expect(parseConfig('{ 不是 json')).toBeNull();
  });

  it('applyPreset 换文案但保留几何参数', () => {
    const base = { ...defaultState(), logoSize: 40, titleX: 0.2, starCount: 3 };
    const next = applyPreset(base, 'gym');
    expect(next.title).toBe('健身');
    expect(next.bg).toBe('#0b0b0d');
    expect(next.logoSize).toBe(40);
    expect(next.titleX).toBe(0.2);
    expect(next.starCount).toBe(3);
  });

  it('未知模板 key 原样返回', () => {
    const base = defaultState();
    expect(applyPreset(base, '没这个')).toBe(base);
  });
});

describe('持久化', () => {
  it('存进去能读回来', () => {
    const store = fakeStorage();
    const state = normalizeState({ title: '考研', logoSize: 33 });
    saveState(state, store);
    expect(loadState(store)).toEqual(state);
  });

  it('空存储返回 null；坏数据返回默认而不是抛', () => {
    expect(loadState(fakeStorage())).toBeNull();
    const broken = fakeStorage({ 'xx-qidong-v1': '{oops' });
    expect(loadState(broken)).toBeNull();
  });

  it('存储里是合法 JSON 但字段乱七八糟时仍归一化', () => {
    const store = fakeStorage({ 'xx-qidong-v1': JSON.stringify({ ratio: 'bogus', starCount: 77 }) });
    const loaded = loadState(store);
    expect(loaded?.ratio).toBe('16:9');
    expect(loaded?.starCount).toBe(MAX_STARS);
  });
});
