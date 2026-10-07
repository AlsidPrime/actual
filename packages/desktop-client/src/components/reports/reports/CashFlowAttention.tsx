import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { getScheduledAmount } from '@actual-app/core/shared/schedules';

import { Link } from '#components/common/Link';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type {
  CashFlowAttentionItem,
  deriveCashFlowAttention,
} from './deriveCashFlowAttention';

type Attention = ReturnType<typeof deriveCashFlowAttention>;

export function CashFlowAttention({
  attention,
  upcomingCount,
  nextUpcoming,
  accountNames,
  payeeNames,
}: Attention & {
  accountNames: Readonly<Record<string, string>>;
  payeeNames: Readonly<Record<string, string>>;
}) {
  const format = useFormat();
  const locale = useLocale();
  const getName = (
    schedule: CashFlowAttentionItem | NonNullable<typeof nextUpcoming>,
  ) => schedule.name?.trim() || payeeNames[schedule._payee] || '';

  return (
    <View
      style={{
        borderLeft: `4px solid ${attention.length ? theme.warningText : theme.tableBorder}`,
        backgroundColor: theme.pageBackground,
        padding: 14,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Text style={{ fontWeight: 600 }}>
          <Trans>Needs Attention</Trans>
        </Text>
        <Link variant="internal" to="/schedules">
          <Trans>Review schedules</Trans>
        </Link>
      </View>
      {attention.length === 0 && (
        <Text style={{ color: theme.pageTextLight }}>
          <Trans>No manual schedules need attention.</Trans>
        </Text>
      )}
      {attention.map(schedule => (
        <View key={schedule.id} style={{ gap: 2 }}>
          <Text style={{ fontWeight: 600 }}>
            {getName(schedule) || <Trans>Unnamed schedule</Trans>}
          </Text>
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            {schedule.status === 'due' ? (
              <Trans>Due today</Trans>
            ) : (
              <>
                <Trans>Missed</Trans>{' '}
                {monthUtils.format(schedule.next_date, 'MMMM d', locale)}
              </>
            )}
          </Text>
          <Text>
            <PrivacyFilter>
              <FinancialText>
                {format(
                  Math.abs(getScheduledAmount(schedule._amount)),
                  'financial',
                )}
              </FinancialText>
            </PrivacyFilter>{' '}
            · {accountNames[schedule._account]}
          </Text>
        </View>
      ))}
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        {upcomingCount === 1 ? (
          <Trans>1 upcoming manual schedule</Trans>
        ) : (
          <Trans count={upcomingCount}>
            {{ count: upcomingCount }} upcoming manual schedules
          </Trans>
        )}
        {nextUpcoming && (
          <>
            {' · '}
            <Trans>Next</Trans>:{' '}
            {getName(nextUpcoming) || <Trans>Unnamed schedule</Trans>}
            {' · '}
            {monthUtils.format(nextUpcoming.next_date, 'MMMM d', locale)}
          </>
        )}
      </Text>
    </View>
  );
}
