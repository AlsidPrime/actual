// oxlint-disable typescript-paths/absolute-parent-import
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import { SvgExpandArrow } from '@actual-app/components/icons/v0';
import { Popover } from '@actual-app/components/popover';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  BalanceForecastWidget,
  RuleConditionEntity,
  TimeFrame,
} from '@actual-app/core/types/models';
import type { ForecastSource } from '@actual-app/core/types/models/forecast';
import { useQuery } from '@tanstack/react-query';
import * as d from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Page, PageHeader } from '#components/Page';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { AccountSelector } from '#components/reports/AccountSelector';
import { CategorySelector } from '#components/reports/CategorySelector';
import { Container } from '#components/reports/Container';
import { getCustomTick } from '#components/reports/getCustomTick';
import { computePadding } from '#components/reports/graphs/util/computePadding';
import { Header } from '#components/reports/Header';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { useAccounts } from '#hooks/useAccounts';
import { useBalanceForecast } from '#hooks/useBalanceForecast';
import { useCategories } from '#hooks/useCategories';
import { useDashboardWidget } from '#hooks/useDashboardWidget';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { usePrivacyMode } from '#hooks/usePrivacyMode';
import { useRuleConditionFilters } from '#hooks/useRuleConditionFilters';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import {
  buildBalanceForecastChartData,
  countForecastScheduledOccurrences,
  getLowestChartDataPoint,
  getZeroCrossingGradientOffset,
} from './balanceForecastChartData';
import { buildBudgetBurnProjection } from './budgetBurn';
import { CashFlowCalendarView } from './CashFlowCalendarView';

export function BalanceForecast() {
  const params = useParams();
  const { data: widget, isLoading } = useDashboardWidget<BalanceForecastWidget>(
    {
      id: params.id,
      type: 'balance-forecast-card',
    },
  );

  if (isLoading) {
    return <LoadingIndicator />;
  }

  return <BalanceForecastInner key={widget?.id ?? 'new'} widget={widget} />;
}

type BalanceForecastInnerProps = {
  widget?: BalanceForecastWidget;
};

function BalanceForecastInner({ widget }: BalanceForecastInnerProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const privacyMode = usePrivacyMode();
  const locale = useLocale();
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();
  const [budgetTypePref] = useSyncedPref('budgetType');
  const [firstDayOfWeekIdxPref] = useSyncedPref('firstDayOfWeekIdx');
  const budgetType = budgetTypePref === 'tracking' ? 'tracking' : 'envelope';

  const {
    conditions,
    conditionsOp,
    onApply: onApplyFilter,
    onDelete: onDeleteFilter,
    onUpdate: onUpdateFilter,
    onConditionsOpChange,
  } = useRuleConditionFilters<RuleConditionEntity>(
    widget?.meta?.conditions,
    widget?.meta?.conditionsOp,
  );

  const [allMonths, setAllMonths] = useState<Array<{
    name: string;
    pretty: string;
  }> | null>(null);

  const currentMonth = monthUtils.currentMonth();
  const [start, setStart] = useState(
    widget?.meta?.timeFrame?.start ?? widget?.meta?.startDate ?? currentMonth,
  );
  const [end, setEnd] = useState(
    widget?.meta?.timeFrame?.end ??
      widget?.meta?.endDate ??
      monthUtils.addMonths(currentMonth, 11),
  );
  const [mode, setMode] = useState<TimeFrame['mode']>(
    widget?.meta?.timeFrame?.mode ?? 'static',
  );
  const [granularity, setGranularity] = useState<'Daily' | 'Monthly'>(
    widget?.meta?.granularity ?? 'Monthly',
  );
  const [visualization, setVisualization] = useState<'chart' | 'calendar'>(
    'chart',
  );
  const [source, setSource] = useState<ForecastSource>(
    widget?.meta?.source === 'tracking-budget' && budgetType === 'tracking'
      ? 'tracking-budget'
      : 'schedules',
  );
  const isCalendarView = visualization === 'calendar';
  const { data: categoryData } = useCategories(
    isCalendarView && budgetType === 'envelope',
  );
  const expenseGroups =
    categoryData?.grouped.filter(group => !group.is_income) ?? [];
  const expenseCategories =
    categoryData?.list.filter(category => !category.is_income) ?? [];
  const isTrackingBudgetForecast = source === 'tracking-budget';

  const [budgetBurn, setBudgetBurn] = useState(
    widget?.meta?.budgetBurn ?? { enabled: false, categoryIds: [] },
  );
  const selectedBurnCategories = expenseCategories.filter(category =>
    budgetBurn.categoryIds.includes(category.id),
  );
  const [selectedCalendarAccountIds, setCalendarAccountIds] = useState<
    string[]
  >(widget?.meta?.calendarAccounts ?? []);

  useEffect(() => {
    setCalendarAccountIds(widget?.meta?.calendarAccounts ?? []);
  }, [widget?.meta?.calendarAccounts]);

  useEffect(() => {
    if (budgetType !== 'tracking' && source === 'tracking-budget') {
      setSource('schedules');
    }
  }, [budgetType, source]);

  const selectedAccountIds = useMemo(
    () => widget?.meta?.accounts ?? accounts.map(a => a.id),
    [accounts, widget?.meta?.accounts],
  );
  const hasMonthOptions = allMonths != null;
  // `start` may be `yyyy-MM` or `yyyy-MM-dd`; `firstDayOfMonth` handles both.
  const startDate = monthUtils.firstDayOfMonth(start);
  const endDate = monthUtils.lastDayOfMonth(end);
  const {
    data: forecastData,
    error,
    isFetching,
    isPlaceholderData,
    isPending: isLoading,
  } = useBalanceForecast({
    accountIds: isTrackingBudgetForecast
      ? undefined
      : widget
        ? selectedAccountIds
        : undefined,
    conditions: isTrackingBudgetForecast ? undefined : conditions,
    conditionsOp: isTrackingBudgetForecast ? undefined : conditionsOp,
    startDate,
    endDate,
    includeAccountlessSchedules: isTrackingBudgetForecast
      ? undefined
      : widget?.meta?.accounts === undefined,
    source,
    enabled: hasMonthOptions && !isCalendarView,
  });
  const calendarForecast = useBalanceForecast({
    accountIds: selectedCalendarAccountIds,
    startDate,
    endDate,
    includeAccountlessSchedules: false,
    source: 'schedules',
    enabled:
      hasMonthOptions &&
      isCalendarView &&
      selectedCalendarAccountIds.length > 0,
  });
  const burnIsActive =
    isCalendarView &&
    budgetType === 'envelope' &&
    budgetBurn.enabled &&
    budgetBurn.categoryIds.length > 0 &&
    selectedCalendarAccountIds.length > 0;
  const { data: burnLeftovers, error: burnError } = useQuery({
    queryKey: ['balance-forecast-budget-burn', currentMonth],
    queryFn: () => send('envelope-budget-month', { month: currentMonth }),
    enabled: burnIsActive,
  });
  const today = monthUtils.currentDay();
  const burnProjection = isCalendarView
    ? buildBudgetBurnProjection({
        enabled:
          burnIsActive &&
          burnLeftovers != null &&
          calendarForecast.data != null &&
          !calendarForecast.isPlaceholderData,
        categories: selectedBurnCategories.map(category => ({
          categoryId: category.id,
          categoryName: category.name,
          leftover: Number(
            burnLeftovers?.find(cell =>
              cell.name.endsWith(`leftover-${category.id}`),
            )?.value ?? 0,
          ),
        })),
        forecastData: calendarForecast.data ?? null,
        today,
        endDate: endDate < today ? today : endDate,
      })
    : null;
  const activeError = isCalendarView ? calendarForecast.error : error;
  const errorMessage =
    activeError instanceof Error
      ? activeError.message
      : activeError
        ? t('Failed to load forecast')
        : null;
  const normalizedForecastData = forecastData ?? null;
  const hasFilters = !isTrackingBudgetForecast && conditions.length > 0;
  const committedChartRange = useRef({ start, end });

  async function onSaveWidget() {
    if (!widget) {
      throw new Error('No widget that could be saved.');
    }

    await send('dashboard-update-widget', {
      id: widget.id,
      meta: {
        ...widget.meta,
        conditions,
        conditionsOp,
        startDate: start,
        endDate: end,
        granularity: isTrackingBudgetForecast ? 'Monthly' : granularity,
        calendarAccounts: selectedCalendarAccountIds,
        budgetBurn,
        source,
        timeFrame: {
          start,
          end,
          mode,
        },
      },
    });
    dispatch(
      addNotification({
        notification: {
          type: 'message',
          message: t('Dashboard widget successfully saved.'),
        },
      }),
    );
  }

  const earliestTransaction =
    !allMonths || allMonths.length === 0
      ? currentMonth
      : (allMonths[allMonths.length - 1]?.name ?? currentMonth);

  useEffect(() => {
    let cancelled = false;

    async function loadMonths() {
      const currentMonthLocal = monthUtils.currentMonth();

      const earliestTransactionResponse = await send(
        'get-earliest-transaction',
      );

      const earliestMonth = earliestTransactionResponse
        ? monthUtils.monthFromDate(d.parseISO(earliestTransactionResponse.date))
        : monthUtils.subMonths(currentMonthLocal, 12);

      let futureEndMonth = monthUtils.addMonths(currentMonthLocal, 24);
      if (end > futureEndMonth) {
        futureEndMonth = end;
      }
      if (normalizedForecastData?.forecastEndDate) {
        const forecastEndMonth = monthUtils.monthFromDate(
          normalizedForecastData.forecastEndDate,
        );
        if (forecastEndMonth > futureEndMonth) {
          futureEndMonth = forecastEndMonth;
        }
      }

      const allMonthsArray = monthUtils
        .rangeInclusive(earliestMonth, futureEndMonth)
        .map(month => ({
          name: month,
          pretty: monthUtils.format(month, 'MMMM, yyyy', locale),
        }))
        .reverse();

      if (cancelled) {
        return;
      }

      setAllMonths(prev => {
        if (
          prev &&
          prev.length === allMonthsArray.length &&
          prev.every(
            (p, i) =>
              p.name === allMonthsArray[i]?.name &&
              p.pretty === allMonthsArray[i]?.pretty,
          )
        ) {
          return prev;
        }
        return allMonthsArray;
      });
    }
    void loadMonths();

    return () => {
      cancelled = true;
    };
  }, [locale, end, normalizedForecastData?.forecastEndDate]);

  const onChangeDates = (
    newStart: string,
    newEnd: string,
    newMode?: TimeFrame['mode'],
  ) => {
    setStart(newStart);
    setEnd(newEnd);
    if (newMode) {
      setMode(newMode);
    }
  };

  function onSourceChange(newSource: ForecastSource) {
    setSource(newSource);
    if (newSource === 'tracking-budget') {
      setGranularity('Monthly');
    }
  }

  const chartRange = isPlaceholderData
    ? committedChartRange.current
    : { start, end };
  useEffect(() => {
    if (normalizedForecastData && !isPlaceholderData) {
      committedChartRange.current = { start, end };
    }
  }, [end, isPlaceholderData, normalizedForecastData, start]);

  const chartData = buildBalanceForecastChartData({
    forecastData: normalizedForecastData,
    start: chartRange.start,
    end: chartRange.end,
    granularity,
  });
  const formatYTick = (value: number) =>
    getCustomTick(format(value, 'financial-no-decimals'), privacyMode);
  const yAxisLeftPadding = computePadding(
    chartData.map(point => point.balance),
    formatYTick,
  );
  const isUpdatingForecast = isFetching && isPlaceholderData;

  const scheduledOccurrenceCount = countForecastScheduledOccurrences({
    forecastData: normalizedForecastData,
    start: chartRange.start,
    end: chartRange.end,
    granularity,
  });

  if (!allMonths) {
    return <LoadingIndicator />;
  }

  if (!isCalendarView && isLoading && !normalizedForecastData) {
    return <LoadingIndicator />;
  }

  const endingPoint = chartData.at(-1);
  const lowestPoint = getLowestChartDataPoint(chartData);
  const hasNegativeBalance = chartData.some(d => d.balance < 0);
  const zeroCrossingGradientOffset = getZeroCrossingGradientOffset(chartData);
  const todayReferenceDate =
    granularity === 'Daily'
      ? monthUtils.currentDay()
      : monthUtils.currentMonth();
  const showsTodayReferenceLine = chartData.some(
    dataPoint => dataPoint.date === todayReferenceDate,
  );
  const headerInlineContent = (
    <>
      <Select
        value={visualization}
        onChange={setVisualization}
        options={[
          ['chart', t('Chart')],
          ['calendar', t('Calendar')],
        ]}
      />
      {isCalendarView && (
        <DialogTrigger>
          <Button
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Trans count={selectedCalendarAccountIds.length}>
              {{ count: selectedCalendarAccountIds.length }} accounts
            </Trans>
            <SvgExpandArrow width={8} height={8} />
          </Button>
          <Popover
            placement="bottom start"
            style={{
              width: 380,
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: 420,
            }}
          >
            <Dialog
              aria-label={t('Select accounts')}
              style={{ outline: 'none' }}
            >
              <View style={{ padding: 12 }}>
                <View style={{ marginBottom: 8, fontWeight: 600 }}>
                  <Trans>Accounts</Trans>
                </View>
                <View
                  style={{
                    marginBottom: 8,
                    color: theme.pageTextLight,
                    fontSize: 12,
                  }}
                >
                  <Trans>
                    Select the accounts whose available cash you want to
                    forecast.
                  </Trans>
                </View>
                <View style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <AccountSelector
                    accounts={accounts}
                    selectedAccountIds={selectedCalendarAccountIds}
                    setSelectedAccountIds={setCalendarAccountIds}
                  />
                </View>
              </View>
            </Dialog>
          </Popover>
        </DialogTrigger>
      )}
      {isCalendarView && budgetType === 'envelope' && (
        <DialogTrigger>
          <Button>
            <Trans>Budget Burn</Trans>:{' '}
            {budgetBurn.enabled ? t('On') : t('Off')}
            {' · '}
            {selectedBurnCategories.length}
          </Button>
          <Popover
            placement="bottom start"
            style={{ width: 380, maxHeight: 440 }}
          >
            <Dialog
              aria-label={t('Budget Burn settings')}
              style={{ padding: 12 }}
            >
              <Button
                onPress={() =>
                  setBudgetBurn(current => ({
                    ...current,
                    enabled: !current.enabled,
                  }))
                }
              >
                {budgetBurn.enabled ? (
                  <Trans>Disable Budget Burn</Trans>
                ) : (
                  <Trans>Enable Budget Burn</Trans>
                )}
              </Button>
              <View
                style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}
              >
                <CategorySelector
                  categoryGroups={expenseGroups}
                  selectedCategories={selectedBurnCategories}
                  setSelectedCategories={selected =>
                    setBudgetBurn(current => ({
                      ...current,
                      categoryIds: selected.map(category => category.id),
                    }))
                  }
                />
              </View>
            </Dialog>
          </Popover>
        </DialogTrigger>
      )}
      {!isCalendarView && budgetType === 'tracking' && (
        <Select
          value={source}
          onChange={onSourceChange}
          options={[
            ['schedules', t('Scheduled transactions')],
            ['tracking-budget', t('Tracking budget')],
          ]}
        />
      )}
      {!isCalendarView && (
        <Select
          value={granularity}
          onChange={setGranularity}
          disabled={isTrackingBudgetForecast}
          options={[
            ['Monthly', t('Monthly')],
            ['Daily', t('Daily')],
          ]}
        />
      )}
    </>
  );
  const headerChildren = widget ? (
    <Button variant="primary" onPress={onSaveWidget}>
      <Trans>Save widget</Trans>
    </Button>
  ) : null;

  return (
    <Page
      header={<PageHeader title={<Trans>Balance Forecast</Trans>} />}
      padding={0}
    >
      {!isCalendarView && isTrackingBudgetForecast ? (
        <Header
          allMonths={allMonths}
          start={start}
          end={end}
          earliestTransaction={earliestTransaction}
          latestTransaction={
            forecastData?.forecastEndDate
              ? monthUtils.monthFromDate(forecastData.forecastEndDate)
              : (allMonths[0]?.name ?? monthUtils.addMonths(currentMonth, 24))
          }
          mode={mode}
          onChangeDates={onChangeDates}
          showFutureRange
          hideModeToggle
          inlineContent={headerInlineContent}
        >
          {headerChildren}
        </Header>
      ) : (
        <Header
          allMonths={allMonths}
          start={start}
          end={end}
          earliestTransaction={earliestTransaction}
          latestTransaction={
            forecastData?.forecastEndDate
              ? monthUtils.monthFromDate(forecastData.forecastEndDate)
              : (allMonths[0]?.name ?? monthUtils.addMonths(currentMonth, 24))
          }
          granularities={['month', 'day']}
          mode={mode}
          onChangeDates={onChangeDates}
          {...(isCalendarView
            ? {
                filters: undefined,
                onApply: undefined,
                onUpdateFilter: undefined,
                onDeleteFilter: undefined,
                conditionsOp: undefined,
                onConditionsOpChange: undefined,
              }
            : {
                filters: conditions,
                onApply: onApplyFilter,
                onUpdateFilter,
                onDeleteFilter,
                conditionsOp,
                onConditionsOpChange,
              })}
          showFutureRange
          hideModeToggle
          inlineContent={headerInlineContent}
        >
          {headerChildren}
        </Header>
      )}

      <View
        style={{
          backgroundColor: theme.tableBackground,
          padding: 20,
          paddingTop: 0,
          flex: '1 0 auto',
          overflowY: 'auto',
        }}
      >
        {errorMessage ? (
          <div style={{ color: theme.errorText, marginBottom: 20 }}>
            {errorMessage}
          </div>
        ) : !isCalendarView && endingPoint ? (
          <View
            style={{
              textAlign: 'right',
              paddingTop: 20,
              marginBottom: 20,
            }}
          >
            <View
              style={{
                ...styles.largeText,
                fontWeight: 400,
                marginBottom: 5,
                color:
                  endingPoint.balance < 0 ? theme.errorText : theme.pageText,
              }}
            >
              <PrivacyFilter>
                {format(endingPoint.balance, 'financial')}
              </PrivacyFilter>
            </View>
            <View style={{ color: theme.pageTextLight }}>
              <Trans>Ending Balance</Trans>: {endingPoint.date}
            </View>
            {lowestPoint && lowestPoint.date !== endingPoint.date ? (
              <View
                style={{
                  color: theme.pageTextLight,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                <Trans>Lowest visible point</Trans>:{' '}
                <PrivacyFilter>
                  {format(lowestPoint.balance, 'financial')}
                </PrivacyFilter>{' '}
                ({lowestPoint.date})
              </View>
            ) : null}
          </View>
        ) : null}

        <div style={{ flex: 1, minHeight: 300 }}>
          {errorMessage ? null : isCalendarView ? (
            <View style={{ gap: 20, paddingTop: 20 }}>
              {burnIsActive && burnError && (
                <View style={{ color: theme.errorText }}>
                  <Trans>Failed to load Budget Burn data.</Trans>
                </View>
              )}
              {selectedCalendarAccountIds.length > 0 ? (
                <>
                  {(calendarForecast.isPending ||
                    calendarForecast.isPlaceholderData) && <LoadingIndicator />}
                  <CashFlowCalendarView
                    forecastData={
                      calendarForecast.isPlaceholderData
                        ? null
                        : (calendarForecast.data ?? null)
                    }
                    start={start}
                    end={end}
                    firstDayOfWeekIdx={firstDayOfWeekIdxPref}
                    budgetBurn={
                      burnProjection && burnProjection.days.length > 0
                        ? burnProjection
                        : undefined
                    }
                    selectedBurnCategoryCount={selectedBurnCategories.length}
                  />
                </>
              ) : (
                <View
                  style={{
                    minHeight: 200,
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: theme.pageTextLight,
                  }}
                >
                  <Trans>
                    Select the accounts whose available cash you want to
                    forecast.
                  </Trans>
                </View>
              )}
            </View>
          ) : chartData.length > 0 ? (
            <>
              <Container>
                {(width, height) => (
                  <ResponsiveContainer>
                    <LineChart
                      width={width}
                      height={height}
                      data={chartData}
                      margin={{
                        top: 10,
                        right: 10,
                        left: 5 + yAxisLeftPadding,
                        bottom: 10,
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="balance-forecast-line-gradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          {zeroCrossingGradientOffset == null ? (
                            <stop
                              offset="0%"
                              stopColor={
                                hasNegativeBalance
                                  ? theme.reportsNumberNegative
                                  : theme.reportsChartFill
                              }
                            />
                          ) : (
                            <>
                              <stop
                                offset={`${zeroCrossingGradientOffset}%`}
                                stopColor={theme.reportsChartFill}
                              />
                              <stop
                                offset={`${zeroCrossingGradientOffset}%`}
                                stopColor={theme.reportsNumberNegative}
                              />
                            </>
                          )}
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: theme.pageText }}
                        tickLine={{ stroke: theme.pageText }}
                        interval={
                          granularity === 'Daily'
                            ? Math.ceil(chartData.length / 10)
                            : 0
                        }
                        tickFormatter={value => {
                          if (granularity === 'Daily') {
                            return d.format(
                              monthUtils.parseDate(value),
                              'MMM d',
                            );
                          }
                          return value;
                        }}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tickFormatter={formatYTick}
                        tick={{ fill: theme.pageText }}
                        tickLine={{ stroke: theme.pageText }}
                        tickSize={0}
                      />
                      <Tooltip
                        isAnimationActive={false}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div
                                style={{
                                  zIndex: 1000,
                                  pointerEvents: 'none',
                                  borderRadius: 2,
                                  boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
                                  backgroundColor: theme.menuBackground,
                                  color: theme.menuItemText,
                                  padding: 10,
                                }}
                              >
                                <div style={{ marginBottom: 5 }}>
                                  <strong>{payload[0].payload.date}</strong>
                                </div>
                                <div>
                                  {format(
                                    payload[0].value as number,
                                    'financial',
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {showsTodayReferenceLine && (
                        <ReferenceLine
                          x={todayReferenceDate}
                          stroke={theme.reportsBlue}
                          strokeDasharray="4 4"
                          label={{
                            value: t('Today'),
                            fill: theme.reportsBlue,
                            fontSize: 12,
                            position: 'insideTop',
                            offset: 8,
                          }}
                        />
                      )}
                      {hasNegativeBalance && (
                        <ReferenceLine y={0} stroke={theme.pageTextSubdued} />
                      )}
                      <Line
                        type="monotone"
                        dataKey="balance"
                        stroke="url(#balance-forecast-line-gradient)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6 }}
                        opacity={isUpdatingForecast ? 0.45 : 1}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Container>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: theme.pageTextLight,
                }}
              >
                {isTrackingBudgetForecast ? (
                  <Trans>
                    Tracking budget forecast uses on-budget balance plus monthly
                    budgeted income minus budgeted expenses.
                  </Trans>
                ) : scheduledOccurrenceCount === 0 ? (
                  <Trans>
                    This range shows posted transactions only; no scheduled
                    occurrences fall in it.
                  </Trans>
                ) : (
                  <Trans count={scheduledOccurrenceCount}>
                    {{ count: scheduledOccurrenceCount }} scheduled transactions
                    included in this date range
                  </Trans>
                )}
                {isUpdatingForecast ? (
                  <>
                    {' '}
                    <Trans>Updating...</Trans>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                display: 'flex',
                minHeight: 200,
              }}
            >
              <div style={{ color: theme.pageTextLight }}>
                <Trans>
                  No transactions are included in this report. Adjust your
                  filters, accounts, or date range to see a balance projection.
                </Trans>
              </div>
            </div>
          )}
        </div>

        {!errorMessage && !isTrackingBudgetForecast && !isCalendarView && (
          <div
            style={{ marginTop: 20, fontSize: 12, color: theme.pageTextLight }}
          >
            {hasFilters ? (
              <Trans>
                This forecast shows the running total of matching posted
                transactions, plus upcoming scheduled transactions in the
                future.
              </Trans>
            ) : (
              <Trans>
                This forecast shows your running balance from posted
                transactions, plus upcoming scheduled transactions in the
                future.
              </Trans>
            )}
          </div>
        )}
      </View>
    </Page>
  );
}
