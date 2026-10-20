import { Trans } from 'react-i18next';

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
import type { PaydayChecklistResult } from './derivePaydayChecklist';
import { SuggestedFundingPlan } from './SuggestedFundingPlan';

export function PaydayChecklist({
  month,
  checklist,
  isLoading,
  isEnvelope,
  hasCategoryData,
  hasCategories,
  runway,
  risk,
  today,
}: {
  month: string;
  checklist: PaydayChecklistResult | undefined;
  isLoading: boolean;
  isEnvelope: boolean;
  hasCategoryData: boolean;
  hasCategories: boolean;
  runway: PaydayRunway | null;
  risk: CashFlowRiskResult | null;
  today: string;
}) {
  const format = useFormat();
  const locale = useLocale();
  const isPrivate = usePrivacyMode();
  const { isNarrowWidth } = useResponsive();
  const money = (amount: number | null) =>
    amount == null ? (
      <Trans>Unavailable</Trans>
    ) : isPrivate && isNarrowWidth ? (
      <Trans>Private value hidden</Trans>
    ) : (
      <PrivacyFilter>
        <FinancialText>{format(amount, 'financial')}</FinancialText>
      </PrivacyFilter>
    );
  const result = checklist?.month === month ? checklist : undefined;
  const isIncomplete = result != null && !result.isComplete;

  return (
    <View
      style={{ border: `1px solid ${theme.tableBorder}`, padding: 14, gap: 10 }}
    >
      <Text style={{ fontWeight: 600, fontSize: 16 }}>
        <Trans>Payday Funding Checklist</Trans>
      </Text>
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        <Trans>Budget month</Trans>:{' '}
        {monthUtils.format(month, 'MMMM yyyy', locale)}.{' '}
        <Trans>
          Budget funding is separate from Operating cash and transfer headroom.
        </Trans>
      </Text>
      {!isEnvelope ? (
        <Text>
          <Trans>Envelope budgeting is required for funding targets.</Trans>
        </Text>
      ) : isLoading ? (
        <Text>
          <Trans>Loading funding checklist.</Trans>
        </Text>
      ) : !hasCategoryData ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>Funding checklist data is unavailable.</Trans>
        </Text>
      ) : !hasCategories ? (
        <Text>
          <Trans>No expense categories to review.</Trans>
        </Text>
      ) : result == null ? (
        <Text style={{ color: theme.warningText }}>
          <Trans>Funding checklist data is unavailable.</Trans>
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <View style={{ flex: '1 1 170px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Available to Budget</Trans>
              </Text>
              <Text>{money(result.availableToBudget)}</Text>
            </View>
            <View style={{ flex: '1 1 170px', minWidth: 0 }}>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>Remaining target funding</Trans>
              </Text>
              <Text>{money(result.remainingTotal)}</Text>
            </View>
          </View>
          {result.items.length === 0 ? (
            <Text>
              <Trans>
                No Budget Automation funding targets are configured.
              </Trans>
            </Text>
          ) : isIncomplete ? (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Some funding data is unavailable or unsupported. The checklist
                is incomplete.
              </Trans>
            </Text>
          ) : result.availableToBudget != null &&
            result.availableToBudget < 0 ? (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Available to Budget is negative. Review your budget before
                funding more categories.
              </Trans>
            </Text>
          ) : result.availableToBudget != null &&
            result.remainingTotal != null &&
            result.remainingTotal > result.availableToBudget ? (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Available to Budget does not cover the remaining targets.
              </Trans>
            </Text>
          ) : result.remainingTotal === 0 ? (
            <Text>
              <Trans>
                Configured targets are fully allocated for this month.
              </Trans>
            </Text>
          ) : (
            <Text>
              <Trans>Review the remaining category funding below.</Trans>
            </Text>
          )}
          {result.items.length > 0 && (
            <details>
              <summary>
                <Trans>Category funding details</Trans>
              </summary>
              <View style={{ marginTop: 8 }}>
                {result.items.map(item => (
                  <View
                    key={item.categoryId}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      paddingBlock: 6,
                      borderBottom: `1px solid ${theme.tableBorder}`,
                    }}
                  >
                    <View style={{ gap: 2 }}>
                      <Text>{item.categoryName}</Text>
                      <Text
                        style={{ color: theme.pageTextLight, fontSize: 12 }}
                      >
                        <Trans>Allocated</Trans>: {money(item.allocated)} ·{' '}
                        <Trans>Target</Trans>: {money(item.target)}
                      </Text>
                    </View>
                    <Text>
                      {item.status === 'unsupported' ? (
                        <Trans>Unsupported target</Trans>
                      ) : item.status === 'unavailable' ||
                        item.remaining == null ? (
                        <Trans>Funding unavailable</Trans>
                      ) : item.remaining === 0 ? (
                        <Trans>Fully allocated</Trans>
                      ) : (
                        <>
                          <Trans>Remaining</Trans>: {money(item.remaining)}
                        </>
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            </details>
          )}
          <SuggestedFundingPlan
            key={month}
            checklist={result}
            runway={runway}
            risk={risk}
            today={today}
          />
        </>
      )}
    </View>
  );
}
