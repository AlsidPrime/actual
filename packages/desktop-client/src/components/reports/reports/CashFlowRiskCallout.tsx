import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type { CashFlowRiskResult } from './cashFlowRisk';

export function CashFlowRiskCallout({
  risk,
  endDate,
}: {
  risk: CashFlowRiskResult;
  endDate: string;
}) {
  const format = useFormat();
  const locale = useLocale();
  const color =
    risk.status === 'danger'
      ? theme.errorText
      : risk.status === 'warning'
        ? theme.warningText
        : theme.reportsNumberPositive;

  return (
    <View
      style={{
        borderLeft: `4px solid ${color}`,
        backgroundColor: theme.pageBackground,
        padding: 14,
        gap: 6,
      }}
    >
      <Text style={{ color, fontWeight: 600 }}>
        <Trans>Cash Flow Risk</Trans>
      </Text>
      <Text style={{ fontWeight: 600 }}>
        {risk.status === 'danger' ? (
          <Trans>Operating cash is projected below zero today.</Trans>
        ) : risk.status === 'warning' && risk.firstNegativeDate ? (
          <>
            <Trans>Operating cash shortfall projected</Trans>{' '}
            {monthUtils.format(risk.firstNegativeDate, 'PP', locale)}.
          </>
        ) : (
          <>
            <Trans>No Operating cash shortfall projected through</Trans>{' '}
            {monthUtils.format(endDate, 'PP', locale)}.
          </>
        )}
      </Text>
      {risk.status === 'warning' && risk.firstNegativeBalance !== null && (
        <Text>
          <Trans>Projected Operating cash on that date</Trans>:{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(risk.firstNegativeBalance, 'financial')}
            </FinancialText>
          </PrivacyFilter>
        </Text>
      )}
      <Text>
        <Trans>Lowest projected Operating cash</Trans>:{' '}
        <PrivacyFilter>
          <FinancialText>
            {format(risk.lowestBalance, 'financial')}
          </FinancialText>
        </PrivacyFilter>{' '}
        <Trans>on</Trans>{' '}
        {monthUtils.format(risk.lowestBalanceDate, 'PP', locale)}.
      </Text>
      {risk.nextOperatingInflow ? (
        <Text>
          <Trans>Next forecasted Operating inflow</Trans>:{' '}
          {monthUtils.format(risk.nextOperatingInflow.date, 'PP', locale)} ·{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(risk.nextOperatingInflow.amount, 'financial')}
            </FinancialText>
          </PrivacyFilter>
        </Text>
      ) : (
        <Text>
          <Trans>
            No future Operating inflow is scheduled within the forecast horizon.
          </Trans>
        </Text>
      )}
    </View>
  );
}
