import { useEffect, useState } from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { addDays, format as formatDate, startOfWeek } from 'date-fns';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import type { BudgetBurnProjection } from './budgetBurn';
import {
  buildCashFlowCalendarData,
  clampCashFlowCalendarMonth,
  getInitialCashFlowCalendarMonth,
  getWeekStartsOn,
  moveCashFlowCalendarMonth,
} from './cashFlowCalendarData';
import type { CashFlowCalendarDay } from './cashFlowCalendarData';

type CashFlowCalendarViewProps = {
  forecastData: ForecastResult | null;
  start: string;
  end: string;
  firstDayOfWeekIdx?: string;
  lowThreshold?: number;
  budgetBurn?: BudgetBurnProjection;
  selectedBurnCategoryCount?: number;
  manualScheduleIds?: ReadonlySet<string>;
  operatingAccountIds?: readonly string[];
};

function CalendarDay({
  day,
  isOperatingOnly,
}: {
  day: CashFlowCalendarDay;
  isOperatingOnly: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const locale = useLocale();
  const visibleEvents = day.scheduledEvents.slice(0, 3);
  const hiddenEventCount = day.scheduledEvents.length - visibleEvents.length;
  const isToday = day.date === monthUtils.currentDay();
  const isPast = day.isInMonth && day.date < monthUtils.currentDay();
  const negativeAccounts = day.accountBalances.filter(
    account => account.balance < 0,
  );
  const statusColor =
    day.status === 'negative'
      ? theme.errorText
      : day.status === 'low'
        ? theme.warningText
        : theme.pageText;

  return (
    <article
      aria-label={monthUtils.format(day.date, 'PPPP', locale)}
      aria-current={isToday ? 'date' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 128,
        minWidth: 0,
        padding: 8,
        gap: 6,
        border: `1px solid ${
          day.status === 'negative'
            ? theme.errorText
            : day.status === 'low'
              ? theme.warningText
              : isToday
                ? theme.reportsBlue
                : theme.tableBorder
        }`,
        backgroundColor:
          day.isInMonth && !isPast
            ? theme.calendarCellBackground
            : theme.pageBackground,
        color: day.isInMonth ? theme.pageText : theme.pageTextSubdued,
        opacity: day.isInMonth ? (isPast ? 0.62 : 1) : 0.4,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ fontWeight: isToday ? 700 : 500 }}>
            {day.dayOfMonth}
          </Text>
          {isToday && (
            <Text
              style={{
                color: theme.reportsBlue,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <Trans>Today</Trans>
            </Text>
          )}
        </View>
        {day.isInMonth && day.adjustedCombinedBalance != null && (
          <PrivacyFilter>
            <FinancialText
              style={{
                color: statusColor,
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'right',
              }}
            >
              {format(day.adjustedCombinedBalance, 'financial')}
            </FinancialText>
          </PrivacyFilter>
        )}
      </View>

      {day.isInMonth && day.status !== 'normal' && (
        <Text style={{ color: statusColor, fontSize: 11, fontWeight: 600 }}>
          {day.status === 'negative' ? (
            <Trans>Negative</Trans>
          ) : (
            <Trans>Low</Trans>
          )}
        </Text>
      )}

      {day.isInMonth && day.budgetBurn && day.combinedBalance != null && (
        <DialogTrigger>
          <Button
            variant="bare"
            aria-label={t('Cash flow details for {{date}}', {
              date: monthUtils.format(day.date, 'PP', locale),
            })}
            style={{ fontSize: 11, padding: 0 }}
          >
            <Trans>Details</Trans>
          </Button>
          <Popover>
            <Dialog
              aria-label={t('Cash flow details')}
              style={{ padding: 12, minWidth: 260 }}
            >
              <Text style={{ fontWeight: 600, marginBottom: 8 }}>
                {monthUtils.format(day.date, 'PPPP', locale)}
              </Text>
              {[
                [
                  isOperatingOnly
                    ? t('Native projected Operating cash')
                    : t('Native projected cash'),
                  day.combinedBalance,
                ],
                [t('Projected spending today'), -day.budgetBurn.dailyBurn],
                [
                  t('Projected spending this month'),
                  -day.budgetBurn.monthlyCumulativeBurn,
                ],
                [t('After projected spending'), day.adjustedCombinedBalance],
                [t('Remaining this month'), day.budgetBurn.remainingBurn],
              ].map(([label, amount]) => (
                <View
                  key={label}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <Text>{label}</Text>
                  <PrivacyFilter>
                    <FinancialText>{format(amount, 'financial')}</FinancialText>
                  </PrivacyFilter>
                </View>
              ))}
              {day.budgetBurn.categories.length > 0 && (
                <View style={{ marginTop: 10, gap: 3 }}>
                  <Text style={{ fontWeight: 600 }}>
                    <Trans>Today's burn</Trans>
                  </Text>
                  {day.budgetBurn.categories.map(category => (
                    <View
                      key={category.categoryId}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <Text>{category.categoryName}</Text>
                      <PrivacyFilter>
                        <FinancialText>
                          {format(category.amount, 'financial')}
                        </FinancialText>
                      </PrivacyFilter>
                    </View>
                  ))}
                </View>
              )}
            </Dialog>
          </Popover>
        </DialogTrigger>
      )}

      {day.isInMonth && negativeAccounts.length > 0 && (
        <DialogTrigger>
          <Button
            variant="bare"
            style={{ color: theme.warningText, fontSize: 11, padding: 0 }}
          >
            <Trans count={negativeAccounts.length}>
              {{ count: negativeAccounts.length }} account below zero
            </Trans>
          </Button>
          <Popover>
            <Dialog
              aria-label={t('Accounts below zero')}
              style={{ padding: 8 }}
            >
              <View style={{ gap: 3 }}>
                {negativeAccounts.map(account => (
                  <View
                    key={account.accountId}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <Text>{account.accountName}</Text>
                    <PrivacyFilter>
                      <FinancialText>
                        {format(account.balance, 'financial')}
                      </FinancialText>
                    </PrivacyFilter>
                  </View>
                ))}
              </View>
            </Dialog>
          </Popover>
        </DialogTrigger>
      )}

      {day.isInMonth && visibleEvents.length > 0 && (
        <View style={{ gap: 3 }}>
          {visibleEvents.map(event => (
            <View
              key={event.id}
              title={`${event.label} (${event.accountNames.join(', ')})`}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 4,
                minWidth: 0,
                fontSize: 11,
              }}
            >
              <Text
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {event.isTransfer ? t('Transfer') : event.label}
              </Text>
              {event.isManual && (
                <Text
                  title={t(
                    'Manual schedule — Actual will not automatically add this transaction.',
                  )}
                  aria-label={t(
                    'Manual schedule — Actual will not automatically add this transaction.',
                  )}
                  style={{
                    flexShrink: 0,
                    color: theme.pageTextSubdued,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  <Trans>Manual</Trans>
                </Text>
              )}
              <PrivacyFilter>
                <FinancialText
                  style={{
                    flexShrink: 0,
                    color:
                      event.amount < 0
                        ? theme.reportsNumberNegative
                        : event.amount > 0
                          ? theme.reportsNumberPositive
                          : theme.pageTextSubdued,
                  }}
                >
                  {format(event.amount, 'financial')}
                </FinancialText>
              </PrivacyFilter>
            </View>
          ))}
          {hiddenEventCount > 0 && (
            <Text style={{ color: theme.pageTextSubdued, fontSize: 11 }}>
              <Trans count={hiddenEventCount}>
                +{{ count: hiddenEventCount }} more
              </Trans>
            </Text>
          )}
        </View>
      )}
    </article>
  );
}

export function CashFlowCalendarView({
  forecastData,
  start,
  end,
  firstDayOfWeekIdx,
  lowThreshold,
  budgetBurn,
  selectedBurnCategoryCount = 0,
  manualScheduleIds,
  operatingAccountIds,
}: CashFlowCalendarViewProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const formatAmount = useFormat();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getInitialCashFlowCalendarMonth({ start, end }),
  );

  useEffect(() => {
    setVisibleMonth(month => clampCashFlowCalendarMonth({ month, start, end }));
  }, [start, end]);

  const weekStartsOn = getWeekStartsOn(firstDayOfWeekIdx);
  const firstWeekday = startOfWeek(new Date(), { weekStartsOn });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    formatDate(addDays(firstWeekday, index), 'EEE', { locale }),
  );
  const [month] = buildCashFlowCalendarData({
    forecastData,
    start: visibleMonth,
    end: visibleMonth,
    firstDayOfWeekIdx,
    lowThreshold,
    budgetBurn,
    manualScheduleIds,
    operatingAccountIds,
  });
  const visibleBurnMonth = budgetBurn?.months.find(
    burnMonth => burnMonth.month === visibleMonth,
  );
  const startMonth = monthUtils.getMonth(start);
  const endMonth = monthUtils.getMonth(end);

  return (
    <View style={{ gap: 20 }}>
      <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
        {operatingAccountIds ? (
          <Trans>
            Projected Operating cash is shown at the end of each day, after
            Budget Burn when enabled. Sinking Savings is excluded. Transactions
            within a day are not ordered.
          </Trans>
        ) : (
          <Trans>
            Balances are projected at the end of each day. Transactions within a
            day are not ordered.
          </Trans>
        )}
      </Text>
      {budgetBurn && (
        <View
          style={{
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Text>
            <Trans>Budget Burn on</Trans> ·{' '}
            <Trans count={selectedBurnCategoryCount}>
              {{ count: selectedBurnCategoryCount }} categories
            </Trans>{' '}
            · {monthUtils.format(visibleMonth, 'MMMM', locale)}{' '}
            <Trans>remaining burn</Trans>:
          </Text>
          <PrivacyFilter>
            <FinancialText>
              {formatAmount(visibleBurnMonth?.totalBurn ?? 0, 'financial')}
            </FinancialText>
          </PrivacyFilter>
          {visibleBurnMonth && visibleBurnMonth.categories.length > 0 && (
            <DialogTrigger>
              <Button variant="bare">
                <Trans>Category details</Trans>
              </Button>
              <Popover>
                <Dialog
                  aria-label={t('Budget Burn categories')}
                  style={{ padding: 12, minWidth: 360 }}
                >
                  <Text
                    style={{
                      marginBottom: 8,
                      color: theme.pageTextLight,
                      fontSize: 12,
                    }}
                  >
                    {monthUtils.format(visibleMonth, 'MMMM yyyy', locale)}
                  </Text>
                  {visibleBurnMonth.categories.map(category => (
                    <View key={category.categoryId} style={{ marginBottom: 8 }}>
                      <Text style={{ fontWeight: 600 }}>
                        {category.categoryName}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Text>
                          {category.planSource === 'automation' ? (
                            <Trans>Plan after spending</Trans>
                          ) : (
                            <Trans>Available</Trans>
                          )}
                          :
                        </Text>
                        <PrivacyFilter>
                          <FinancialText>
                            {formatAmount(category.available, 'financial')}
                          </FinancialText>
                        </PrivacyFilter>
                        <Text>
                          <Trans>Scheduled</Trans>:
                        </Text>
                        <PrivacyFilter>
                          <FinancialText>
                            {formatAmount(
                              category.scheduledExpense,
                              'financial',
                            )}
                          </FinancialText>
                        </PrivacyFilter>
                        <Text>
                          <Trans>Remaining</Trans>:
                        </Text>
                        <PrivacyFilter>
                          <FinancialText>
                            {formatAmount(category.remainingBurn, 'financial')}
                          </FinancialText>
                        </PrivacyFilter>
                      </View>
                    </View>
                  ))}
                </Dialog>
              </Popover>
            </DialogTrigger>
          )}
        </View>
      )}
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <Button
            variant="bare"
            aria-label={t('Previous month')}
            isDisabled={visibleMonth <= startMonth}
            onPress={() =>
              setVisibleMonth(month =>
                moveCashFlowCalendarMonth({
                  month,
                  offset: -1,
                  start,
                  end,
                }),
              )
            }
          >
            <SvgCheveronLeft width={16} height={16} />
          </Button>
          <Text
            style={{
              minWidth: 150,
              fontSize: 16,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {monthUtils.format(month.month, 'MMMM yyyy', locale)}
          </Text>
          <Button
            variant="bare"
            aria-label={t('Next month')}
            isDisabled={visibleMonth >= endMonth}
            onPress={() =>
              setVisibleMonth(month =>
                moveCashFlowCalendarMonth({
                  month,
                  offset: 1,
                  start,
                  end,
                }),
              )
            }
          >
            <SvgCheveronRight width={16} height={16} />
          </Button>
        </View>
        <div style={{ overflowX: 'auto' }}>
          <section
            aria-label={monthUtils.format(month.month, 'MMMM yyyy', locale)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 700,
              gap: 2,
            }}
          >
            <View
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 2,
              }}
            >
              {weekdays.map(weekday => (
                <Text
                  key={weekday}
                  style={{
                    padding: '4px 8px',
                    color: theme.pageTextSubdued,
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  {weekday}
                </Text>
              ))}
            </View>
            <View
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 2,
              }}
            >
              {month.days.map(day => (
                <CalendarDay
                  key={day.date}
                  day={day}
                  isOperatingOnly={operatingAccountIds != null}
                />
              ))}
            </View>
          </section>
        </div>
      </View>
    </View>
  );
}
