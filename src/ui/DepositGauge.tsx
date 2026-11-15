import type { DepositLevel } from '../game/sim/index.ts';
import { ResourceIcon } from './ResourceIcon.tsx';
import type { YieldResource } from './yieldIcon.ts';

const RESOURCE_WORD: Record<YieldResource, string> = { fuel: 'Fuel', materials: 'Materials' };

/** How much of the bar each level fills, in quarters; empty is an outline only. */
const FILLED: Record<DepositLevel, number> = { full: 4, half: 2, low: 1, empty: 0 };

/** The words for a deposit gauge: "Fuel, full" or "Materials, empty". */
function depositGaugeName(resource: YieldResource, level: DepositLevel): string {
  return `${RESOURCE_WORD[resource]}, ${level}`;
}

interface DepositGaugeProps {
  resource: YieldResource;
  level: DepositLevel;
  /** The `data-testid` to carry. */
  testId?: string;
}

/**
 * What a Body has left to give: the resource's icon the player already knows, and a small bar in the
 * resource colour filled to the level (outlined when empty). The words travel in the accessible name.
 */
export function DepositGauge({ resource, level, testId = 'deposit-gauge' }: DepositGaugeProps) {
  return (
    <span
      role="img"
      aria-label={depositGaugeName(resource, level)}
      className={`deposit-gauge deposit-gauge--${resource} deposit-gauge--${level}`}
      data-testid={testId}
      data-resource={resource}
      data-level={level}
    >
      <span aria-hidden="true" className="deposit-gauge__icon">
        <ResourceIcon resource={resource} className="resource-icon--inline" label="" />
      </span>
      <span aria-hidden="true" className="deposit-gauge__bar">
        <span className="deposit-gauge__fill" style={{ width: `${FILLED[level] * 25}%` }} />
      </span>
    </span>
  );
}
