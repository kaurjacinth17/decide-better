'use client';
import type { ReactNode } from 'react';
import { AdvantageCards, Breakdown } from './Breakdown';
import { LeaderBar } from './LeaderBar';
import { Matrix } from './Matrix';
import { FlipTable, SensitivityPanel } from './Sensitivity';
import { CertaintyPanel, Probabilities } from './Uncertainty';
import { VerdictPanel } from './VerdictPanel';

/** The full worksheet layout, shared by the editable app and the read-only shared view. */
export function WorkspaceSections({
  matrixExtra,
  onOpenWeights,
  verdictActions,
  aside,
}: {
  matrixExtra?: ReactNode;
  onOpenWeights?: () => void;
  verdictActions?: ReactNode;
  /** Extra panels shown below the worksheet (AI features). */
  aside?: ReactNode;
}) {
  return (
    <>
      <main className="band" id="main">
        <div className="wrap work">
          <Matrix onOpenWeights={onOpenWeights}>{matrixExtra}</Matrix>
          <VerdictPanel actions={verdictActions} />
        </div>
      </main>
      {aside && (
        <section className="band nt no-print" aria-label="AI second opinion">
          <div className="wrap two s4 items-start">{aside}</div>
        </section>
      )}
      <section className="band nt" aria-label="Points breakdown">
        <div className="wrap two">
          <Breakdown />
          <AdvantageCards />
        </div>
      </section>
      <section className="band nt" aria-label="Uncertainty">
        <div className="wrap two s4">
          <Probabilities />
          <CertaintyPanel />
        </div>
      </section>
      <section className="band nt" aria-label="Sensitivity">
        <div className="wrap two s3">
          <SensitivityPanel />
          <FlipTable />
        </div>
      </section>
      <LeaderBar />
    </>
  );
}
