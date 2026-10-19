import { Trans } from 'react-i18next';
import { Link } from 'react-router';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type { PaydayRunway } from './cashFlowPayday';
import type { SweepAdvisorResult } from './cashFlowReserve';
import type { SinkingSavingsPlan } from './cashFlowSavingsPlan';
import type { PaydayReview } from './derivePaydayReview';

export function CashFlowPaydayReview({
  review,
  runway,
  savingsPlan,
  advisor,
  planMonth,
}: {
  review: PaydayReview;
  runway: PaydayRunway | null;
  savingsPlan: SinkingSavingsPlan | null;
  advisor: SweepAdvisorResult | null;
  planMonth: string;
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
  const isTransfer = review.action === 'transfer';
  const color =
    review.action === 'hold'
      ? theme.warningText
      : isTransfer
        ? theme.reportsNumberPositive
        : theme.pageText;

  return (
    <View
      style={{
        border: `1px solid ${theme.tableBorder}`,
        padding: 14,
        gap: 10,
        minWidth: 0,
      }}
    >
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        <Trans>Payday Review</Trans>
      </Text>
      <Text style={{ color, fontWeight: 600, fontSize: 18 }}>
        {review.action === 'hold' ? (
          <Trans>Hold cash</Trans>
        ) : review.action === 'setup' ? (
          <Trans>Complete setup</Trans>
        ) : review.action === 'budget' ? (
          <Trans>Review budget funding</Trans>
        ) : isTransfer ? (
          <Trans>Review savings transfer</Trans>
        ) : (
          <Trans>No action needed</Trans>
        )}
      </Text>
      <Text>
        {review.reason === 'current-cash' ? (
          <Trans>Current Operating cash is below your safety buffer.</Trans>
        ) : review.reason === 'projected-cash' ? (
          <Trans>Operating cash may fall below your safety buffer.</Trans>
        ) : review.reason === 'setup' ? (
          <Trans>
            Complete the accounts, payday, and sinking category setup above.
          </Trans>
        ) : review.reason === 'unavailable' ? (
          <Trans>
            Wait for complete cash, Budget Burn, and savings data before
            considering a transfer.
          </Trans>
        ) : review.reason === 'planning-gap' ? (
          <Trans>
            Some planned sinking contributions are still unallocated in this
            budget month.
          </Trans>
        ) : review.reason === 'actual-cash' ? (
          <Trans>
            Current actual Operating cash cannot cover the Sweep amount plus
            your safety buffer.
          </Trans>
        ) : review.reason === 'transfer' ? (
          <Trans>
            The Savings Sweep reports transfer headroom that current cash can
            support.
          </Trans>
        ) : (
          <Trans>
            Funding is complete and no transfer is currently recommended.
          </Trans>
        )}
      </Text>
      {review.action === 'budget' && (
        <Link to="/budget">
          <Trans>Open Budget</Trans>
        </Link>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <View style={{ flex: '1 1 135px', minWidth: 0 }}>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>Next scheduled payday</Trans>
          </Text>
          <Text>
            {runway?.paydayDate ? (
              monthUtils.format(runway.paydayDate, 'PP', locale)
            ) : (
              <Trans>Unavailable</Trans>
            )}
          </Text>
        </View>
        <View style={{ flex: '1 1 135px', minWidth: 0 }}>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>Planned savings</Trans>
          </Text>
          <Text>{money(savingsPlan?.plannedTotal ?? null)}</Text>
        </View>
        <View style={{ flex: '1 1 135px', minWidth: 0 }}>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>Budgeted this month</Trans>
          </Text>
          <Text>{money(savingsPlan?.monthlyAllocationTotal ?? null)}</Text>
        </View>
        <View style={{ flex: '1 1 135px', minWidth: 0 }}>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>Planning gap</Trans>
          </Text>
          <Text>{money(savingsPlan?.planningGap ?? null)}</Text>
        </View>
        <View style={{ flex: '1 1 135px', minWidth: 0 }}>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>Savings Sweep</Trans>
          </Text>
          <Text>
            {isTransfer && advisor ? (
              money(advisor.safeToMove)
            ) : advisor?.status === 'funded' ||
              advisor?.status === 'unallocated' ? (
              <Trans>No transfer needed</Trans>
            ) : advisor?.status === 'setup' ||
              advisor?.status === 'incomplete' ||
              advisor == null ? (
              <Trans>Unavailable</Trans>
            ) : (
              <Trans>Hold transfer</Trans>
            )}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        <Trans>Budget month</Trans>:{' '}
        {monthUtils.format(planMonth, 'MMMM yyyy', locale)}.{' '}
        <Trans>The planning gap is not transfer headroom.</Trans>
      </Text>
    </View>
  );
}
