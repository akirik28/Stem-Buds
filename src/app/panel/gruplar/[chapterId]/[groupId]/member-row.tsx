'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { StatusPill } from '@/components/ui/status';
import { removeGroupMemberAction, setTeamLeaderAction, type ActionState } from '../../actions';

export type MemberRowData = {
  membershipId: string;
  fullName: string;
  username: string;
  role: 'mentor' | 'student';
  isTeamLeader: boolean;
};

export function MemberRow({
  chapterId,
  groupId,
  member,
  canManage,
}: {
  chapterId: string;
  groupId: string;
  member: MemberRowData;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      setResult(await action());
    });
  }

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-navy-900">{member.fullName}</p>
          <p className="text-sm text-navy-500">
            @{member.username} · {member.role === 'mentor' ? 'Mentor' : 'Öğrenci'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {member.isTeamLeader ? (
            <StatusPill tone="info" icon="⭐">
              Takım Lideri
            </StatusPill>
          ) : null}

          {canManage ? (
            <>
              {member.role === 'student' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setTeamLeaderAction(chapterId, groupId, member.membershipId, !member.isTeamLeader),
                    )
                  }
                >
                  {member.isTeamLeader ? 'Takım Liderliğini Kaldır' : 'Takım Lideri Yap'}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => run(() => removeGroupMemberAction(chapterId, groupId, member.membershipId))}
              >
                Gruptan Çıkar
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {result?.error ? (
        <Alert tone="error" className="mt-2">
          {result.error}
        </Alert>
      ) : null}
      {result?.success ? (
        <Alert tone="success" className="mt-2">
          {result.success}
        </Alert>
      ) : null}
    </div>
  );
}
