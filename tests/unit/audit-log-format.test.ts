import { describe, expect, it } from 'vitest';
import { describeAuditEntry } from '@/lib/audit-log-format';

describe('describeAuditEntry', () => {
  it('reads as a complete Turkish sentence with a known action, target, and chapter', () => {
    const text = describeAuditEntry({
      actorName: 'Hande Özcan',
      action: 'group.mentor_assigned',
      targetLabel: 'Bio 2',
      chapterName: 'Üsküdar Amerikan Akademisi',
    });
    expect(text).toBe('Hande Özcan grubun mentorunu değiştirdi: "Bio 2" (Üsküdar Amerikan Akademisi)');
  });

  it('omits the target/chapter suffixes when they are absent, without leaving stray punctuation', () => {
    const text = describeAuditEntry({ actorName: 'Sistem', action: 'bootstrap.executive_created' });
    expect(text).toBe('Sistem ilk yönetici hesabını oluşturdu');
  });

  it('falls back to a complete, understandable Turkish sentence for an unknown/historical action code, keeping the raw code only as secondary detail', () => {
    const text = describeAuditEntry({ actorName: 'Eski Kullanıcı', action: 'legacy.retired_action', targetLabel: null });
    expect(text).toBe('Eski Kullanıcı bir işlem gerçekleştirdi (legacy.retired_action)');
    expect(text).toContain('legacy.retired_action');
  });

  it('never throws on null/undefined target or chapter', () => {
    expect(() =>
      describeAuditEntry({ actorName: 'X', action: 'user.created', targetLabel: null, chapterName: null }),
    ).not.toThrow();
    expect(() => describeAuditEntry({ actorName: 'X', action: 'user.created' })).not.toThrow();
  });
});
