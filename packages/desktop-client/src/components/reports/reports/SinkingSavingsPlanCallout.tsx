import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type { SinkingSavingsPlan } from './cashFlowSavingsPlan';

export function SinkingSavingsPlanCallout({
  plan,
  currentMonth,
  nextMonth,
  selectedMonth,
  onMonthChange,
  isLoading,
}: {
  plan: SinkingSavingsPlan;
  currentMonth: string;
  nextMonth: string;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  isLoading: boolean;
}) {
  const format = useFormat();
  const locale = useLocale();
  const money = (amount: number | null) =>
    amount == null ? (
      <Trans>Unavailable</Trans>
    ) : (
      <PrivacyFilter>
        <FinancialText>{format(amount, 'financial')}</FinancialText>
      </PrivacyFilter>
    );
  const hasAutomation = plan.categories.some(
    category => category.contribution.status !== 'none',
  );

  return (
    <View
      style={{ border: `1px solid ${theme.tableBorder}`, padding: 14, gap: 12 }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <Text style={{ fontWeight: 600, fontSize: 16 }}>
          <Trans>Sinking Savings Plan</Trans>
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Button
            variant={selectedMonth === currentMonth ? 'primary' : 'normal'}
            style={{ minHeight: 40 }}
            aria-pressed={selectedMonth === currentMonth}
            onPress={() => onMonthChange(currentMonth)}
          >
            <Trans>Current month</Trans> ·{' '}
            {monthUtils.format(currentMonth, 'MMM yyyy', locale)}
          </Button>
          <Button
            variant={selectedMonth === nextMonth ? 'primary' : 'normal'}
            style={{ minHeight: 40 }}
            aria-pressed={selectedMonth === nextMonth}
            onPress={() => onMonthChange(nextMonth)}
          >
            <Trans>Next month</Trans> ·{' '}
            {monthUtils.format(nextMonth, 'MMM yyyy', locale)}
          </Button>
        </View>
      </View>
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        <Trans>Plan for budget month</Trans>:{' '}
        {monthUtils.format(selectedMonth, 'MMMM yyyy', locale)}.{' '}
        <Trans>
          Monthly contributions come from native Budget Automations. This plan
          does not move money or recommend a transfer.
        </Trans>
      </Text>
      {plan.status === 'setup' ? (
        <Text>
          <Trans>
            Select sinking categories in Cash Flow Setup to see their savings
            plan.
          </Trans>
        </Text>
      ) : isLoading ? (
        <Text>
          <Trans>Loading Sinking Savings Plan.</Trans>
        </Text>
      ) : (
        <>
          {plan.status === 'incomplete' && (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Some plan data is unavailable. Missing amounts are excluded from
                totals and planning gaps.
              </Trans>
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <View style={{ flex: '1 1 145px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Planned contribution</Trans>
              </Text>
              <Text style={{ fontWeight: 600 }}>
                {hasAutomation ? (
                  money(plan.plannedTotal)
                ) : (
                  <Trans>No automations</Trans>
                )}
              </Text>
            </View>
            <View style={{ flex: '1 1 145px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Budgeted this month</Trans>
              </Text>
              <Text style={{ fontWeight: 600 }}>
                {money(plan.monthlyAllocationTotal)}
              </Text>
            </View>
            <View style={{ flex: '1 1 145px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Planning gap</Trans>
              </Text>
              <Text style={{ fontWeight: 600 }}>
                {hasAutomation ? (
                  money(plan.planningGap)
                ) : (
                  <Trans>Not applicable</Trans>
                )}
              </Text>
            </View>
            <View style={{ flex: '1 1 145px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Current envelope balance</Trans>
              </Text>
              <Text style={{ fontWeight: 600 }}>
                {money(plan.currentEnvelopeTotal)}
              </Text>
            </View>
            <View style={{ flex: '1 1 145px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Physical Sinking Savings cash</Trans>
              </Text>
              <Text style={{ fontWeight: 600 }}>
                {money(plan.physicalCash)}
              </Text>
            </View>
          </View>
          <View style={{ gap: 0 }}>
            {plan.categories.map(category => (
              <View
                key={category.id}
                style={{
                  borderTop: `1px solid ${theme.tableBorder}`,
                  paddingTop: 10,
                  paddingBottom: 10,
                  gap: 6,
                }}
              >
                <Text style={{ fontWeight: 600 }}>{category.name}</Text>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
                >
                  <View style={{ flex: '1 1 145px', minWidth: 0 }}>
                    <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                      <Trans>Planned contribution</Trans>
                    </Text>
                    <Text>
                      {category.contribution.status === 'none' ? (
                        <Trans>No automation configured</Trans>
                      ) : (
                        money(category.contribution.amount)
                      )}
                    </Text>
                  </View>
                  <View style={{ flex: '1 1 145px', minWidth: 0 }}>
                    <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                      <Trans>Budgeted this month</Trans>
                    </Text>
                    <Text>{money(category.monthlyAllocation)}</Text>
                  </View>
                  <View style={{ flex: '1 1 145px', minWidth: 0 }}>
                    <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                      <Trans>Planning gap</Trans>
                    </Text>
                    <Text>
                      {category.contribution.status === 'none' ? (
                        <Trans>Not applicable</Trans>
                      ) : (
                        money(category.planningGap)
                      )}
                    </Text>
                  </View>
                  <View style={{ flex: '1 1 145px', minWidth: 0 }}>
                    <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                      <Trans>Current envelope balance</Trans>
                    </Text>
                    <Text>{money(category.currentEnvelopeBalance)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>
              The planning gap compares each automation contribution with that
              month's assigned budget. Current envelope balances and physical
              cash are shown as they stand now, including when viewing next
              month. Neither amount is transfer headroom.
            </Trans>
          </Text>
        </>
      )}
    </View>
  );
}
