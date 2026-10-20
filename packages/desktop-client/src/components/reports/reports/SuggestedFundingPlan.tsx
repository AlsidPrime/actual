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
import { AmountInput } from '#components/util/AmountInput';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { usePrivacyMode } from '#hooks/usePrivacyMode';

import type { PaydayRunway } from './cashFlowPayday';
import type { CashFlowRiskResult } from './cashFlowRisk';
import { derivePaydayAllocationSuggestions } from './derivePaydayAllocationSuggestions';
import type { FundingMode } from './derivePaydayAllocationSuggestions';
import type { PaydayChecklistResult } from './derivePaydayChecklist';
import type { PaydayIncomeBudget } from './paydayIncomeBudget';

export function SuggestedFundingPlan({
  checklist,
  runway,
  incomeBudget,
  risk,
  today,
}: {
  checklist: PaydayChecklistResult;
  runway: PaydayRunway | null;
  incomeBudget: PaydayIncomeBudget | null;
  risk: CashFlowRiskResult | null;
  today: string;
}) {
  const [mode, setMode] = useState<FundingMode>('available');
  const [choiceState, setChoiceState] = useState<{
    key: string;
    values: Record<string, number>;
  }>({ key: '', values: {} });
  const format = useFormat();
  const locale = useLocale();
  const isPrivate = usePrivacyMode();
  const { isNarrowWidth } = useResponsive();
  const choiceKey = JSON.stringify([
    checklist.month,
    checklist.availableToBudget,
    checklist.items.map(item => [
      item.categoryId,
      item.status,
      item.priority,
      item.target,
      item.allocated,
      item.remaining,
    ]),
    checklist.withoutRules,
    mode,
    runway?.paydayDate,
    runway?.expectedIncome,
    runway?.budgetableIncome,
    runway?.budgetableDeposits,
    incomeBudget?.manualBuffered,
    incomeBudget?.incomeCategoryHold,
  ]);
  const choices = choiceState.key === choiceKey ? choiceState.values : {};
  const plan = derivePaydayAllocationSuggestions({
    checklist,
    mode,
    runway,
    incomeBudget,
    today,
    choices,
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
          onPress={() => {
            setMode('available');
            setChoiceState({ key: '', values: {} });
          }}
        >
          <Trans>Current budget position</Trans>
        </Button>
        <Button
          variant={mode === 'payday-preview' ? 'primary' : 'normal'}
          aria-pressed={mode === 'payday-preview'}
          style={{ minHeight: 40 }}
          onPress={() => {
            setMode('payday-preview');
            setChoiceState({ key: '', values: {} });
          }}
        >
          <Trans>Hypothetical next payday</Trans>
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
            Preview unavailable: the next payday falls after this funding month
            or too far before it.
          </Trans>
        </Text>
      ) : plan.reason === 'account' ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            Preview unavailable: the selected payday has no verified forecast
            income into an on-budget Operating account.
          </Trans>
        </Text>
      ) : plan.reason === 'income' ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            Preview unavailable: the payday income category or native hold
            setting cannot be verified. Review the scheduled deposit and Budget.
          </Trans>
        </Text>
      ) : plan.reason === 'held' ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            This scheduled income is held for next month in Budget; it cannot
            fund this month's categories.
          </Trans>
        </Text>
      ) : (
        <>
          <Text>
            {mode === 'available' ? (
              <Trans>Selected-month Available to Budget for allocation</Trans>
            ) : (
              <Trans>Hypothetical allocation capacity</Trans>
            )}
            : {money(plan.capacity ?? 0)}
          </Text>
          {mode === 'payday-preview' && plan.previewIncome != null && (
            <Text>
              <Trans>Forecast income eligible for this budget preview</Trans>:{' '}
              {money(plan.previewIncome)}
            </Text>
          )}
          {plan.deferredIncome > 0 && (
            <Text style={{ color: theme.pageTextLight }}>
              <Trans>Held for next month by native Budget settings</Trans>:{' '}
              {money(plan.deferredIncome)}
            </Text>
          )}
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
            <View
              style={{
                gap: 8,
                borderTop: `1px solid ${theme.tableBorder}`,
                paddingTop: 8,
              }}
            >
              <Text style={{ fontWeight: 600 }}>
                <Trans>Choose a split for priority</Trans>{' '}
                {plan.manualChoice.priority}
              </Text>
              <Text>
                <Trans>Available for this priority group</Trans>:{' '}
                {money(plan.manualChoice.pool)} ·{' '}
                <Trans>Still to distribute</Trans>:{' '}
                {money(plan.manualChoice.remainingPool)}
              </Text>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>
                  Equal-priority categories need your choice. Lower priorities
                  remain on hold while this group has unmet targets.
                </Trans>
              </Text>
              {isPrivate ? (
                <Text>
                  <Trans>
                    Turn off Privacy Mode to edit this what-if split.
                  </Trans>
                </Text>
              ) : (
                plan.manualChoice.categories.map(category => (
                  <View
                    key={category.categoryId}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <label
                      htmlFor={`payday-choice-${category.categoryId}`}
                      style={{ flex: '1 1 170px' }}
                    >
                      {category.categoryName} · <Trans>Remaining target</Trans>:{' '}
                      {money(category.remaining)}
                    </label>
                    <AmountInput
                      id={`payday-choice-${category.categoryId}`}
                      value={choices[category.categoryId] ?? 0}
                      sign="+"
                      style={{ flex: '0 1 150px', minWidth: 120 }}
                      onUpdate={value =>
                        setChoiceState({
                          key: choiceKey,
                          values: { ...choices, [category.categoryId]: value },
                        })
                      }
                    />
                  </View>
                ))
              )}
              {plan.manualChoice.error && (
                <Text style={{ color: theme.errorText }}>
                  <Trans>
                    Use whole cents, stay within each remaining target, and do
                    not exceed the priority group's available amount.
                  </Trans>
                </Text>
              )}
              {!isPrivate && (
                <Button
                  variant="normal"
                  onPress={() => setChoiceState({ key: choiceKey, values: {} })}
                >
                  <Trans>Reset what-if split</Trans>
                </Button>
              )}
            </View>
          )}
          {plan.status === 'partial' && (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Conditional plan: some targets or priorities need review, or an
                equal-priority split is unfinished. Money not yet assigned in
                this scenario is not verified surplus.
              </Trans>
            </Text>
          )}
          {plan.blockedPriority != null && (
            <Text style={{ color: theme.warningText }}>
              <Trans>Priority</Trans> {plan.blockedPriority}:{' '}
              <Trans>
                a required target is unavailable. Lower-priority suggestions are
                paused.
              </Trans>
            </Text>
          )}
          <Text>
            <Trans>Total suggested allocations</Trans>:{' '}
            {money(plan.totalSuggested)}
          </Text>
          <Text>
            <Trans>Not yet assigned in this scenario</Trans>:{' '}
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
