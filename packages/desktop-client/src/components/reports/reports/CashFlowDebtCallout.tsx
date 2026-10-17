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

import type { ScheduledDebtPayment } from './cashFlowDebt';

export function CashFlowDebtCallout({
  payments,
  hasDebtAccounts,
}: {
  payments: ScheduledDebtPayment[];
  hasDebtAccounts: boolean;
}) {
  const format = useFormat();
  const locale = useLocale();
  return (
    <View
      style={{ border: `1px solid ${theme.tableBorder}`, padding: 14, gap: 6 }}
    >
      <Text style={{ fontWeight: 600, fontSize: 16 }}>
        <Trans>Scheduled debt service</Trans>
      </Text>
      {!hasDebtAccounts ? (
        <Text>
          <Trans>
            Select debt and credit accounts in Cash Flow Setup to show their
            scheduled Operating payments.
          </Trans>
        </Text>
      ) : payments.length === 0 ? (
        <Text>
          <Trans>
            No matching scheduled Operating-to-debt transfers are forecast in
            this horizon.
          </Trans>
        </Text>
      ) : (
        payments.map(payment => (
          <View
            key={`${payment.date}:${payment.scheduleId}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text>
              {monthUtils.format(payment.date, 'PP', locale)} ·{' '}
              {payment.scheduleName} · {payment.operatingAccountName} →{' '}
              {payment.debtAccountName}
            </Text>
            <PrivacyFilter>
              <FinancialText>
                {format(-payment.amount, 'financial')}
              </FinancialText>
            </PrivacyFilter>
          </View>
        ))
      )}
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        <Trans>
          These scheduled transfers are already included in Operating cash
          projections.
        </Trans>
      </Text>
      <Link to="/schedules">
        <Trans>Review debt schedules</Trans>
      </Link>
    </View>
  );
}
