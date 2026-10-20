import { useState } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { usePrivacyMode } from '#hooks/usePrivacyMode';

import type { PaydayRunway } from './cashFlowPayday';
import type { CashFlowRiskResult } from './cashFlowRisk';
import { derivePaydayAllocationSuggestions } from './derivePaydayAllocationSuggestions';
import type { FundingMode } from './derivePaydayAllocationSuggestions';
import type { PaydayChecklistResult } from './derivePaydayChecklist';

export function SuggestedFundingPlan({
  checklist,
  runway,
  risk,
  today,
}: {
  checklist: PaydayChecklistResult;
  runway: PaydayRunway | null;
  risk: CashFlowRiskResult | null;
  today: string;
}) {
  const [mode, setMode] = useState<FundingMode>('available');
  const format = useFormat();
  const locale = useLocale();
  const isPrivate = usePrivacyMode();
  const { isNarrowWidth } = useResponsive();
  const plan = derivePaydayAllocationSuggestions({
    checklist,
    mode,
    runway,
    today,
  });
  const money = (amount: number) =>
    isPrivate && isNarrowWidth ? (
      <Trans>Private value hidden</Trans>
    ) : (
      <PrivacyFilter>
        <FinancialText>{format(amount, 'financial')}</FinancialText>
      </PrivacyFilter>
    );
  const hasCashWarning =
    runway?.status === 'low' ||
    runway?.status === 'negative' ||
    runway?.currentCashWarning != null ||
    risk?.firstBelowBufferDate != null ||
    risk?.firstNegativeDate != null;
  const hasIncompleteCoverage =
    runway == null ||
    ['setup', 'unavailable', 'incomplete', 'scheduled-only'].includes(
      runway.status,
    ) ||
    risk?.coverage !== 'complete';

  return (
    <View
      style={{
        borderTop: `1px solid ${theme.tableBorder}`,
        paddingTop: 12,
        gap: 8,
      }}
    >
      <Text id="suggested-funding-plan-heading" style={{ fontWeight: 600 }}>
        <Trans>Suggested Funding Plan</Trans>
      </Text>
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        <Trans>Funding month</Trans>:{' '}
        {monthUtils.format(checklist.month, 'MMMM yyyy', locale)}
      </Text>
      <fieldset
        aria-labelledby="suggested-funding-plan-heading"
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          border: 0,
          padding: 0,
          margin: 0,
          minWidth: 0,
        }}
      >
        <Button
          variant={mode === 'available' ? 'primary' : 'normal'}
          aria-pressed={mode === 'available'}
          style={{ minHeight: 40 }}
          onPress={() => setMode('available')}
        >
          <Trans>Available now</Trans>
        </Button>
        <Button
          variant={mode === 'payday-preview' ? 'primary' : 'normal'}
          aria-pressed={mode === 'payday-preview'}
          style={{ minHeight: 40 }}
          onPress={() => setMode('payday-preview')}
        >
          <Trans>Next payday preview</Trans>
        </Button>
      </fieldset>
      {mode === 'payday-preview' && (
        <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
          <Trans>Expected scheduled payday</Trans>:{' '}
          {runway?.paydayDate && runway.expectedIncome != null ? (
            <>
              {monthUtils.format(runway.paydayDate, 'PP', locale)} ·{' '}
              {money(runway.expectedIncome)}
            </>
          ) : (
            <Trans>Unavailable</Trans>
          )}
        </Text>
      )}
      {plan.reason === 'budget' ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>Available to Budget is unavailable for this month.</Trans>
        </Text>
      ) : plan.reason === 'payday' ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            Preview unavailable: a valid future scheduled payday and positive
            expected income are required.
          </Trans>
        </Text>
      ) : plan.reason === 'month' ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            Preview unavailable: the next payday must fall in the selected
            funding month.
          </Trans>
        </Text>
      ) : (
        <>
          <Text>
            {mode === 'available' ? (
              <Trans>Available to Budget for allocation</Trans>
            ) : (
              <Trans>Hypothetical allocation capacity</Trans>
            )}
            : {money(plan.capacity ?? 0)}
          </Text>
          {plan.existingDeficit > 0 && (
            <Text>
              <Trans>Existing budget deficit</Trans>:{' '}
              {money(plan.existingDeficit)}
              {mode === 'payday-preview' && (
                <>
                  {' · '}
                  <Trans>Covered by expected income</Trans>:{' '}
                  {money(plan.deficitCovered)}
                </>
              )}
            </Text>
          )}
          {plan.capacity === 0 && (
            <Text style={{ color: theme.warningText }}>
              {plan.existingDeficit > plan.deficitCovered ? (
                <Trans>
                  Resolve the remaining budget deficit before funding
                  categories.
                </Trans>
              ) : (
                <Trans>No new category funding is available.</Trans>
              )}
            </Text>
          )}
          {plan.reason === 'targets' && (
            <Text>
              <Trans>No supported funding targets are configured.</Trans>
            </Text>
          )}
          {plan.suggestions.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: 600 }}>
                <Trans>Suggested funding</Trans>
              </Text>
              {plan.suggestions.map(item => (
                <View
                  key={item.categoryId}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Text>
                    {item.categoryName} · <Trans>Priority</Trans>{' '}
                    {item.priority}
                  </Text>
                  <Text>{money(item.amount)}</Text>
                </View>
              ))}
            </View>
          )}
          {plan.manualChoice && (
            <Text style={{ color: theme.warningText }}>
              <Trans>Priority</Trans> {plan.manualChoice.priority}:{' '}
              {money(plan.manualChoice.amount)}{' '}
              <Trans>
                is available for multiple equal-priority categories. Choose how
                to distribute it before considering lower priorities.
              </Trans>
            </Text>
          )}
          {plan.status === 'partial' && (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Partial plan: some targets or priorities are unsupported or
                unavailable. Unassigned money is not verified surplus.
              </Trans>
            </Text>
          )}
          <Text>
            <Trans>Total suggested allocations</Trans>:{' '}
            {money(plan.totalSuggested)}
          </Text>
          <Text>
            <Trans>Unallocated scenario amount</Trans>:{' '}
            {money(plan.unallocated ?? 0)}
          </Text>
        </>
      )}
      {hasCashWarning && (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            Operating cash is projected below the safety buffer. Budget funding
            does not make spending or a transfer safe.
          </Trans>
        </Text>
      )}
      {hasIncompleteCoverage && (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            Cash-flow coverage is incomplete; this plan does not establish cash
            safety.
          </Trans>
        </Text>
      )}
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        {mode === 'payday-preview' ? (
          <Trans>
            Hypothetical only: scheduled income may not post, may not be
            budgetable, or may already be recorded. It is not a second pool of
            money or an instruction to spend or transfer cash.
          </Trans>
        ) : (
          <Trans>
            These are budget assignments only, not confirmed payday income or
            Operating cash. They do not authorize spending or transfers.
          </Trans>
        )}
      </Text>
    </View>
  );
}
