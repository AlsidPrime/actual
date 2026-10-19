import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { usePrivacyMode } from '#hooks/usePrivacyMode';

import type { SinkingBacking } from './cashFlowBacking';

export function CashFlowBackingCallout({
  backing,
}: {
  backing: SinkingBacking;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const isPrivacyMode = usePrivacyMode();
  const money = (amount: number) => (
    <PrivacyFilter>
      <FinancialText>{format(amount, 'financial')}</FinancialText>
    </PrivacyFilter>
  );
  return (
    <View
      style={{ border: `1px solid ${theme.tableBorder}`, padding: 14, gap: 6 }}
    >
      <Text style={{ fontWeight: 600, fontSize: 16 }}>
        <Trans>Sinking Savings backing</Trans>
      </Text>
      {backing.status === 'setup' ? (
        <Text>
          <Trans>
            Select Sinking Savings accounts and sinking categories to see
            physical backing.
          </Trans>
        </Text>
      ) : backing.status === 'incomplete' ? (
        <Text>
          <Trans>Sinking Savings backing data is unavailable.</Trans>
        </Text>
      ) : (
        <>
          <Text
            style={{
              color:
                backing.status === 'partial'
                  ? theme.warningText
                  : backing.status === 'unallocated'
                    ? theme.pageText
                    : theme.reportsNumberPositive,
              fontWeight: 600,
            }}
          >
            {backing.status === 'partial' ? (
              <Trans>Partially backed</Trans>
            ) : backing.status === 'unallocated' ? (
              <Trans>No sinking funds allocated yet</Trans>
            ) : (
              <Trans>Fully backed</Trans>
            )}
          </Text>
          {backing.status === 'unallocated' && (
            <Text>
              <Trans>
                Your Budget Automations may define savings goals, but no money
                has been earmarked in these envelopes.
              </Trans>
            </Text>
          )}
          <Text>
            <Trans>Earmarked category balances</Trans>: {money(backing.target)}
          </Text>
          <Text>
            <Trans>Physical Sinking Savings cash</Trans>:{' '}
            {money(backing.backing)}
          </Text>
          {backing.shortfall > 0 && (
            <Text>
              <Trans>Backing shortfall</Trans>: {money(backing.shortfall)}
            </Text>
          )}
          {backing.excess > 0 && (
            <>
              <Text>
                {backing.status === 'unallocated' ? (
                  <Trans>
                    Physical savings cash without envelope allocations
                  </Trans>
                ) : (
                  <Trans>
                    Physical backing above selected category targets
                  </Trans>
                )}
                : {money(backing.excess)}
              </Text>
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                <Trans>
                  This cash is not automatically available to spend or a
                  recommended transfer. Use Savings Sweep for transfer advice.
                </Trans>
              </Text>
            </>
          )}
          {backing.percent != null && (
            <progress
              aria-label={t('Sinking Savings backing progress')}
              value={isPrivacyMode ? undefined : Math.min(backing.percent, 100)}
              max={100}
              style={{ width: '100%' }}
            />
          )}
          {backing.percent != null && (
            <Text>
              <PrivacyFilter>
                <FinancialText>{Math.min(backing.percent, 100)}%</FinancialText>
              </PrivacyFilter>{' '}
              <Trans>backed</Trans>
            </Text>
          )}
          {backing.categories.map(category => (
            <Text key={category.id}>
              {category.name}: {money(category.balance)}
            </Text>
          ))}
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>
              Negative sinking category balances are excluded from the positive
              funding target.
            </Trans>{' '}
            <Trans>
              Future scheduled transfers are excluded from cash already held.
            </Trans>
          </Text>
        </>
      )}
    </View>
  );
}
