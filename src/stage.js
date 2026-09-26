/** Human-readable status for a project, used on agency screens. */
export function stageInfo(p) {
  switch (p.stage) {
    case 'review':
      return { label: `Round ${p.current_round} of ${p.max_rounds} · client reviewing`, tone: 'blue' };
    case 'revising':
      return p.current_round >= p.max_rounds
        ? { label: 'All rounds in · prepare final', tone: 'amber' }
        : { label: `Round ${p.current_round} submitted · your turn`, tone: 'amber' };
    case 'final':
      return { label: 'Final sent · awaiting approval', tone: 'purple' };
    case 'approved':
      return { label: 'Approved · in development', tone: 'green' };
    default:
      return { label: p.stage, tone: 'grey' };
  }
}

export const shareUrl = (p) => `${window.location.origin}/r/${p.share_token}`;
