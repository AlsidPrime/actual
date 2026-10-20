import { Trans } from 'react-i18next';
import { Link } from 'react-router';

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
import type { PaydayObligation } from './derivePaydayObligations';
import { SuggestedFundingPlan } from './SuggestedFundingPlan';

export function PaydayChecklist({
  month,
  checklist,
  obligations,
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
  obligations: PaydayObligation[] | null;
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
                <Trans>Known target funding remaining</Trans>
              </Text>
              <Text>{money(result.knownRemainingTotal)}</Text>
            </View>
          </View>
          {result.items.length === 0 ? (
            <Text>
              <Trans>
                No calculable Budget Automation funding targets are configured.
              </Trans>
            </Text>
          ) : isIncomplete ? (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Some configured rules do not provide a prioritized monthly
                funding amount. Review their category details below.
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
                Supported configured targets are fully allocated for this month.
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
                      {item.status === 'goal-only' ? (
                        <Trans>Goal only; no monthly funding amount</Trans>
                      ) : item.status === 'unprioritized' ? (
                        <Trans>Priority unavailable; review manually</Trans>
                      ) : item.status === 'unsupported' ? (
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
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>
              These targets cover configured rules only. They do not confirm
              that every monthly expense is funded.
            </Trans>
          </Text>
          {result.withoutRules.length > 0 && (
            <details>
              <summary>
                <Trans>Categories without funding rules</Trans> (
                {result.withoutRules.length})
              </summary>
              <Text style={{ color: theme.warningText }}>
                <Trans>
                  Review these categories in Budget; no funding amount can be
                  inferred from their names.
                </Trans>
              </Text>
              <Text>
                {result.withoutRules.map(item => item.categoryName).join(', ')}
              </Text>
            </details>
          )}
          {obligations == null ? (
            <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
              <Trans>Scheduled expense review is unavailable.</Trans>
            </Text>
          ) : obligations.length > 0 ? (
            <details>
              <summary>
                <Trans>Scheduled expenses to review</Trans> (
                {obligations.length})
              </summary>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>
                  These forecast expenses are not added to funding targets;
                  check their category assignments and any Cover Schedule rules.
                </Trans>
              </Text>
              {obligations.slice(0, 5).map(item => (
                <Text key={`${item.scheduleId}:${item.date}`}>
                  {item.name} · {monthUtils.format(item.date, 'PP', locale)}
                </Text>
              ))}
              {obligations.length > 5 && (
                <Text>
                  <Trans>
                    Review the remaining scheduled expenses in Schedules.
                  </Trans>
                </Text>
              )}
            </details>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Link to="/budget">
              <Trans>Review Budget</Trans>
            </Link>
            <Link to="/schedules">
              <Trans>Review Schedules</Trans>
            </Link>
          </View>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>
              After income posts, use Actual's updated budget position to make
              assignments in Budget. Review physical transfers separately in
              Savings Sweep.
            </Trans>
          </Text>
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
