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
  hasPaydaySelection,
}: {
  risk: CashFlowRiskResult;
  endDate: string;
  hasPaydaySelection: boolean;
}) {
  const format = useFormat();
  const locale = useLocale();
  const color =
    risk.status === 'danger'
      ? theme.errorText
      : risk.status === 'warning'
        ? theme.warningText
        : risk.status === 'safe'
          ? theme.reportsNumberPositive
          : theme.pageTextLight;

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
        ) : risk.firstNegativeDate ? (
          <>
            <Trans>Operating cash shortfall projected</Trans>{' '}
            {monthUtils.format(risk.firstNegativeDate, 'PP', locale)}.
          </>
        ) : risk.firstBelowBufferDate ? (
          <>
            <Trans>Operating cash falls below the safety buffer</Trans>{' '}
            {monthUtils.format(risk.firstBelowBufferDate, 'PP', locale)}.
          </>
        ) : risk.coverage === 'complete' ? (
          <Trans>
            No Operating shortfall among modeled transactions and spending.
          </Trans>
        ) : (
          <>
            <Trans>
              No Operating shortfall among scheduled transactions through
            </Trans>{' '}
            {monthUtils.format(endDate, 'PP', locale)}.
          </>
        )}
      </Text>
      {risk.firstNegativeBalance !== null && (
        <Text>
          <Trans>Projected Operating cash on that date</Trans>:{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(risk.firstNegativeBalance, 'financial')}
            </FinancialText>
          </PrivacyFilter>
        </Text>
      )}
      {risk.firstNegativeDate === null &&
        risk.firstBelowBufferBalance !== null && (
          <Text style={{ color: theme.warningText }}>
            <Trans>Projected cash on that date</Trans>:{' '}
            <PrivacyFilter>
              <FinancialText>
                {format(risk.firstBelowBufferBalance, 'financial')}
              </FinancialText>
            </PrivacyFilter>{' '}
            · <Trans>Safety buffer</Trans>:{' '}
            <PrivacyFilter>
              <FinancialText>
                {format(risk.safetyBuffer, 'financial')}
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
      {risk.coverage !== 'complete' && (
        <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
          {risk.coverage === 'incomplete' ? (
            <Trans>
              Budget Burn data is incomplete. Unplanned variable spending is
              excluded from this scheduled forecast.
            </Trans>
          ) : (
            <Trans>
              Unplanned variable spending is excluded from this scheduled
              forecast.
            </Trans>
          )}
        </Text>
      )}
      {!hasPaydaySelection && (
        <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
          <Trans>
            No payday schedule selected; a future payday is not verified.
          </Trans>
        </Text>
      )}
      {risk.nextOperatingInflow && (
        <Text>
          <Trans>Next forecasted Operating inflow</Trans>:{' '}
          {monthUtils.format(risk.nextOperatingInflow.date, 'PP', locale)} ·{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(risk.nextOperatingInflow.amount, 'financial')}
            </FinancialText>
          </PrivacyFilter>
        </Text>
      )}
    </View>
  );
}
