import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type { PaydayRunway } from './cashFlowPayday';

export function CashFlowPaydayCallout({ runway }: { runway: PaydayRunway }) {
  const format = useFormat();
  const locale = useLocale();
  const color =
    runway.status === 'negative'
      ? theme.errorText
      : runway.status === 'safe'
        ? theme.reportsNumberPositive
        : theme.warningText;
  const money = (amount: number) => (
    <PrivacyFilter>
      <FinancialText>{format(amount, 'financial')}</FinancialText>
    </PrivacyFilter>
  );
  return (
    <View style={{ border: `1px solid ${color}`, padding: 14, gap: 5 }}>
      <Text style={{ color, fontWeight: 600, fontSize: 16 }}>
        <Trans>Next Payday / Cash Runway</Trans>
      </Text>
      {runway.status === 'setup' ? (
        <Text>
          <Trans>
            Select employment income in Payday schedules under Cash Flow Setup.
          </Trans>
        </Text>
      ) : runway.status === 'unavailable' ? (
        <Text>
          <Trans>
            No eligible selected payday is forecast into Operating accounts
            within the horizon. Review the schedules and Operating account
            selection.
          </Trans>
        </Text>
      ) : (
        <>
          <Text style={{ color, fontWeight: 600 }}>
            {runway.status === 'negative' ? (
              <Trans>Operating cash is negative before payday</Trans>
            ) : runway.status === 'low' ? (
              <Trans>
                Operating cash falls below the safety buffer before payday
              </Trans>
            ) : runway.status === 'incomplete' ? (
              <Trans>Runway data is incomplete</Trans>
            ) : runway.status === 'scheduled-only' ? (
              <Trans>Scheduled cash runway only</Trans>
            ) : (
              <Trans>Cash survives until payday</Trans>
            )}
          </Text>
          {runway.paydayDate && (
            <Text>
              <Trans>Next planned payday</Trans>:{' '}
              {monthUtils.format(runway.paydayDate, 'PP', locale)} ·{' '}
              <Trans>Days until payday</Trans>: {runway.daysUntilPayday}
            </Text>
          )}
          {runway.scheduleNames.length > 0 && (
            <Text>
              <Trans>Selected income</Trans>: {runway.scheduleNames.join(', ')}
            </Text>
          )}
          {runway.expectedIncome != null && (
            <Text>
              <Trans>Expected scheduled income</Trans>:{' '}
              {money(runway.expectedIncome)}
            </Text>
          )}
          {runway.currentCash != null && (
            <Text>
              <Trans>Actual Operating cash now</Trans>:{' '}
              {money(runway.currentCash)}
            </Text>
          )}
          {runway.currentCashWarning === 'negative' && (
            <Text style={{ color: theme.errorText }}>
              <Trans>Actual Operating cash is negative now.</Trans>
            </Text>
          )}
          {runway.currentCashWarning === 'below-buffer' && (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                Actual Operating cash is below the safety buffer now.
              </Trans>
            </Text>
          )}
          {runway.todayClosingCash != null && (
            <Text>
              <Trans>Today's projected closing Operating cash</Trans>:{' '}
              {money(runway.todayClosingCash)}
            </Text>
          )}
          {runway.lowestCash != null && runway.lowestDate && (
            <Text>
              <Trans>
                Lowest projected closing Operating cash before payday
              </Trans>
              : {money(runway.lowestCash)} ·{' '}
              {monthUtils.format(runway.lowestDate, 'PP', locale)}
            </Text>
          )}
          {runway.firstNegativeCash != null && runway.firstNegativeDate && (
            <Text style={{ color: theme.errorText }}>
              <Trans>First negative projected closing day</Trans>:{' '}
              {monthUtils.format(runway.firstNegativeDate, 'PP', locale)} ·{' '}
              {money(runway.firstNegativeCash)}
            </Text>
          )}
          {runway.paydayClosingCash != null && (
            <Text>
              <Trans>Payday closing Operating cash</Trans>:{' '}
              {money(runway.paydayClosingCash)}
            </Text>
          )}
          {runway.isConfigurationIncomplete && (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                A selected payday schedule is unavailable or no longer eligible.
                Review Cash Flow Setup; the payday configuration is incomplete.
              </Trans>
            </Text>
          )}
          {runway.isScheduledOnly && (
            <Text style={{ color: theme.warningText }}>
              <Trans>
                This scheduled-only projection excludes unplanned variable
                spending. Enable Budget Burn and select Burn categories in an
                Envelope budget for a Burn-adjusted runway.
              </Trans>
            </Text>
          )}
          {runway.status === 'incomplete' &&
            !runway.isConfigurationIncomplete && (
              <Text>
                <Trans>
                  Budget Burn or daily forecast data is incomplete; no cash
                  safety conclusion is available.
                </Trans>
              </Text>
            )}
        </>
      )}
    </View>
  );
}
