import { describe, expect, it } from 'vitest';
import { downloadName } from '../src/export';

describe('downloadName', () => {
  it('用标题命名', () => {
    expect(downloadName('原神')).toBe('原神启动.png');
  });

  it('空标题退回 qidong，不生成「启动.png」', () => {
    expect(downloadName('')).toBe('qidong启动.png');
    expect(downloadName('   ')).toBe('qidong启动.png');
  });

  it('去掉文件名里不能用的字符', () => {
    expect(downloadName('上/班?')).toBe('上班启动.png');
    expect(downloadName('C:\\摸鱼')).toBe('C摸鱼启动.png');
  });
});
