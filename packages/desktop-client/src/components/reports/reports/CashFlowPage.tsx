import { useEffect, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { listen, send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { FinancialText } from '#components/FinancialText';
import { Page, PageHeader } from '#components/Page';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { useAccountBalances } from '#hooks/useAccountBalances';
import { useAccounts } from '#hooks/useAccounts';
import { useBalanceForecast } from '#hooks/useBalanceForecast';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { usePayeesById } from '#hooks/usePayees';
import { getSchedulesQuery, useSchedules } from '#hooks/useSchedules';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { buildBudgetBurnProjection } from './budgetBurn';
import { loadAutomationBurnPlans } from './budgetBurnAutomation';
import { CashFlowAttention } from './CashFlowAttention';
import { calculateSinkingBacking } from './cashFlowBacking';
import { CashFlowBackingCallout } from './CashFlowBackingCallout';
import { CashFlowCalendarView } from './CashFlowCalendarView';
import { parseCashFlowConfig } from './cashFlowConfig';
import type { CashFlowCalendarConfig } from './cashFlowConfig';
import { deriveScheduledDebtPayments } from './cashFlowDebt';
import { CashFlowDebtCallout } from './CashFlowDebtCallout';
import { calculatePaydayRunway } from './cashFlowPayday';
import { CashFlowPaydayCallout } from './CashFlowPaydayCallout';
import { CashFlowPaydayReview } from './CashFlowPaydayReview';
import { calculateSweepAdvisor } from './cashFlowReserve';
import type { SweepAdvisorResult } from './cashFlowReserve';
import { calculateCashFlowRisk } from './cashFlowRisk';
import { CashFlowRiskCallout } from './CashFlowRiskCallout';
import {
  buildSinkingSavingsPlan,
  loadSinkingAutomationPlans,
} from './cashFlowSavingsPlan';
import { CashFlowSetup } from './CashFlowSetup';
import { deriveCashFlowAttention } from './deriveCashFlowAttention';
import { loadPaydayChecklist } from './derivePaydayChecklist';
import { derivePaydayReview } from './derivePaydayReview';
import { PaydayChecklist } from './PaydayChecklist';
import { SinkingSavingsPlanCallout } from './SinkingSavingsPlanCallout';

function SweepCallout({
  advisor,
  safetyBuffer,
}: {
  advisor: SweepAdvisorResult;
  safetyBuffer: number;
}) {
  const format = useFormat();
  const locale = useLocale();
  const color =
    advisor.status === 'danger'
      ? theme.errorText
      : advisor.status === 'hold' ||
          advisor.status === 'setup' ||
          advisor.status === 'incomplete'
        ? theme.warningText
        : advisor.status === 'unallocated'
          ? theme.pageText
          : theme.reportsNumberPositive;
  return (
    <View style={{ border: `1px solid ${color}`, padding: 14, gap: 6 }}>
      <Text style={{ color, fontWeight: 600, fontSize: 16 }}>
        {advisor.status === 'safe' ? (
          <>
            <Trans>Safe to move</Trans>{' '}
            <PrivacyFilter>
              <FinancialText>
                {format(advisor.safeToMove, 'financial')}
              </FinancialText>
            </PrivacyFilter>{' '}
            <Trans>to Sinking Savings today</Trans>
          </>
        ) : advisor.status === 'incomplete' ? (
          <Trans>Sinking Savings advice is incomplete</Trans>
        ) : advisor.status === 'unallocated' ? (
          <Trans>No funded sinking transfer is currently recommended</Trans>
        ) : advisor.status === 'danger' ? (
          <Trans>Do not transfer to Sinking Savings</Trans>
        ) : advisor.status === 'hold' ? (
          <Trans>Hold cash for now</Trans>
        ) : advisor.status === 'funded' ? (
          advisor.reserveFundingGap > 0 ? (
            <Trans>Sinking Savings is covered by scheduled funding</Trans>
          ) : (
            <Trans>Sinking Savings is fully funded</Trans>
          )
        ) : (
          <Trans>
            Configure Sinking Savings accounts and sinking categories to see
            savings advice.
          </Trans>
        )}
      </Text>
      {advisor.status === 'incomplete' && (
        <Text>
          <Trans>
            Check selected category balances and Budget Burn before relying on a
            savings transfer recommendation.
          </Trans>
        </Text>
      )}
      {advisor.status === 'unallocated' && (
        <Text>
          <Trans>
            No money has been earmarked in the selected sinking envelopes.
          </Trans>
        </Text>
      )}
      {advisor.status === 'safe' && advisor.minimumOperatingCash != null && (
        <Text>
          <Trans>
            After moving it, the lowest projected Operating cash over the
            forecast horizon is
          </Trans>{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(
                advisor.minimumOperatingCash - advisor.safeToMove,
                'financial',
              )}
            </FinancialText>
          </PrivacyFilter>
          . <Trans>Safety buffer</Trans>:{' '}
          <PrivacyFilter>
            <FinancialText>{format(safetyBuffer, 'financial')}</FinancialText>
          </PrivacyFilter>
          .
        </Text>
      )}
      {advisor.status === 'hold' &&
        advisor.effectiveReserveFundingGap === 0 &&
        advisor.protectedTarget > 0 && (
          <Text>
            <Trans>
              Sinking Savings may be fully funded, but projected Operating cash
              falls below your safety buffer.
            </Trans>
          </Text>
        )}
      {advisor.status === 'hold' && advisor.protectedTarget === 0 && (
        <Text>
          <Trans>
            No sinking funds are allocated, and projected Operating cash falls
            below your safety buffer.
          </Trans>
        </Text>
      )}
      {advisor.status === 'hold' && advisor.effectiveReserveFundingGap > 0 && (
        <Text>
          <PrivacyFilter>
            <FinancialText>
              {format(advisor.effectiveReserveFundingGap, 'financial')}
            </FinancialText>
          </PrivacyFilter>{' '}
          <Trans>
            remains earmarked for Sinking Savings, but moving it now would
            breach your safety buffer.
          </Trans>
        </Text>
      )}
      {advisor.status === 'danger' && advisor.minimumOperatingCash != null && (
        <Text>
          <Trans>Operating cash is projected to fall</Trans>{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(-advisor.minimumOperatingCash, 'financial')}
            </FinancialText>
          </PrivacyFilter>{' '}
          <Trans>below zero over the forecast horizon.</Trans>
        </Text>
      )}
      {advisor.nextInflowDate &&
        (advisor.status === 'hold' || advisor.status === 'danger') && (
          <Text>
            <Trans>Next forecasted inflow</Trans>:{' '}
            {monthUtils.format(advisor.nextInflowDate, 'PP', locale)}.
          </Text>
        )}
      {advisor.status !== 'setup' && advisor.status !== 'incomplete' && (
        <Text>
          <Trans>Sinking savings funding gap</Trans>:{' '}
          <PrivacyFilter>
            <FinancialText>
              {format(advisor.reserveFundingGap, 'financial')}
            </FinancialText>
          </PrivacyFilter>
        </Text>
      )}
      {advisor.status !== 'setup' && advisor.scheduledReserveFunding > 0 && (
        <>
          <Text>
            <Trans>Already scheduled to Sinking Savings</Trans>:{' '}
            <PrivacyFilter>
              <FinancialText>
                {format(advisor.scheduledReserveFunding, 'financial')}
              </FinancialText>
            </PrivacyFilter>
          </Text>
          {advisor.status !== 'unallocated' &&
            advisor.status !== 'incomplete' && (
              <Text>
                <Trans>Remaining funding need</Trans>:{' '}
                <PrivacyFilter>
                  <FinancialText>
                    {format(advisor.effectiveReserveFundingGap, 'financial')}
                  </FinancialText>
                </PrivacyFilter>
              </Text>
            )}
        </>
      )}
      {advisor.status !== 'setup' && (
        <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
          <Trans>
            Advice uses end-of-day projections and does not move money.
          </Trans>
        </Text>
      )}
    </View>
  );
}

export function CashFlowPage() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unlistenSync = listen('sync-event', event => {
      if (event.type !== 'success' && event.type !== 'applied') {
        return;
      }
      const budgetChanged = event.tables.some(table =>
        [
          'transactions',
          'schedules',
          'accounts',
          'categories',
          'category_mapping',
          'zero_budgets',
          'zero_budget_months',
          'reflect_budgets',
        ].includes(table),
      );
      const automationsChanged = event.tables.some(table =>
        ['categories', 'preferences'].includes(table),
      );
      if (budgetChanged) {
        void queryClient.invalidateQueries({ queryKey: ['balance-forecast'] });
        void queryClient.invalidateQueries({
          queryKey: ['cash-flow-calendar-budget'],
        });
        void queryClient.invalidateQueries({
          queryKey: ['cash-flow-sinking-plan-automations'],
        });
      }
      if (automationsChanged) {
        void queryClient.invalidateQueries({
          queryKey: ['cash-flow-calendar-automation-plans'],
        });
      }
      if (budgetChanged || automationsChanged) {
        void queryClient.invalidateQueries({
          queryKey: ['cash-flow-payday-checklist'],
        });
      }
    });
    const unlistenCells = listen('cells-changed', cells => {
      if (cells.some(cell => /^budget\d{6}!/.test(cell.name))) {
        void queryClient.invalidateQueries({
          queryKey: ['cash-flow-payday-checklist'],
        });
      }
    });
    return () => {
      unlistenSync();
      unlistenCells();
    };
  }, [queryClient]);
  const [rawConfig, saveRawConfig] = useSyncedPref('cash-flow-calendar-config');
  const [config, setConfig] = useState(() => parseCashFlowConfig(rawConfig));
  useEffect(() => setConfig(parseCashFlowConfig(rawConfig)), [rawConfig]);
  function updateConfig(next: CashFlowCalendarConfig) {
    setConfig(next);
    saveRawConfig(JSON.stringify(next));
  }

  const [budgetType] = useSyncedPref('budgetType');
  const [firstDayOfWeekIdx] = useSyncedPref('firstDayOfWeekIdx');
  const isEnvelope = budgetType !== 'tracking';
  const { data: accounts = [] } = useAccounts();
  const availableAccounts = accounts.filter(
    account => !account.closed && !account.tombstone,
  );
  const availableAccountIds = new Set(
    availableAccounts.map(account => account.id),
  );
  const operatingAccountIds = config.operatingAccountIds.filter(id =>
    availableAccountIds.has(id),
  );
  const reserveAccountIds = config.reserveAccountIds.filter(id =>
    availableAccountIds.has(id),
  );
  const accountBalances = useAccountBalances([
    ...operatingAccountIds,
    ...reserveAccountIds,
  ]);
  const currentOperatingCash = operatingAccountIds.every(
    id => accountBalances[id] != null && Number.isFinite(accountBalances[id]),
  )
    ? operatingAccountIds.reduce(
        (sum, id) => sum + (accountBalances[id] ?? 0),
        0,
      )
    : null;
  const debtAccountIds = config.debtAccountIds.filter(id =>
    availableAccountIds.has(id),
  );
  const { data: categoryData, error: categoriesError } =
    useCategories(isEnvelope);
  const expenseGroups =
    categoryData?.grouped.filter(group => !group.is_income) ?? [];
  const expenseCategories =
    categoryData?.list.filter(category => !category.is_income) ?? [];
  const selectedBurnCategories = expenseCategories.filter(category =>
    config.burnCategoryIds.includes(category.id),
  );
  const selectedReserveCategories = expenseCategories.filter(category =>
    config.reserveCategoryIds.includes(category.id),
  );
  const forecastAccountIds = [
    ...new Set([
      ...operatingAccountIds,
      ...reserveAccountIds,
      ...debtAccountIds,
    ]),
  ];
  const schedulesQuery = useMemo(() => getSchedulesQuery(), []);
  const {
    schedules,
    statuses,
    isLoading: schedulesLoading,
    error: schedulesError,
  } = useSchedules({
    query: operatingAccountIds.length > 0 ? schedulesQuery : undefined,
  });
  const { data: payeesById, isLoading: payeesLoading } = usePayeesById();
  const transferPayeeIds = new Set(
    Object.entries(payeesById ?? {})
      .filter(([, payee]) => payee.transfer_acct != null)
      .map(([id]) => id),
  );
  const attention = deriveCashFlowAttention(
    schedules,
    statuses,
    new Set(forecastAccountIds),
  );
  const accountNames = Object.fromEntries(
    availableAccounts.map(account => [account.id, account.name]),
  );
  const payeeNames = Object.fromEntries(
    Object.entries(payeesById ?? {}).map(([id, payee]) => [id, payee.name]),
  );
  const manualScheduleIds = new Set(
    schedules
      .filter(schedule => schedule.posts_transaction === false)
      .map(schedule => schedule.id),
  );
  const today = monthUtils.currentDay();
  const currentMonth = monthUtils.currentMonth();
  const nextMonth = monthUtils.addMonths(currentMonth, 1);
  const [selectedPlanMonth, setSelectedPlanMonth] = useState<string | null>(
    null,
  );
  const planMonth = selectedPlanMonth === nextMonth ? nextMonth : currentMonth;
  const { data: paydayChecklist, isFetching: isChecklistFetching } = useQuery({
    queryKey: [
      'cash-flow-payday-checklist',
      planMonth,
      expenseCategories.map(category => [
        category.id,
        category.name,
        category.hidden,
        category.tombstone,
      ]),
    ],
    queryFn: () => loadPaydayChecklist(planMonth, expenseCategories),
    enabled: isEnvelope && expenseCategories.length > 0,
  });
  const endMonth = monthUtils.addMonths(
    currentMonth,
    config.forecastMonths - 1,
  );
  const endDate = monthUtils.lastDayOfMonth(endMonth);
  const forecast = useBalanceForecast({
    accountIds: forecastAccountIds,
    startDate: today,
    endDate,
    includeAccountlessSchedules: false,
    source: 'schedules',
    enabled: operatingAccountIds.length > 0,
  });
  const forecastData = forecast.isPlaceholderData
    ? null
    : (forecast.data ?? null);
  const needsBurn =
    isEnvelope && config.budgetBurnEnabled && selectedBurnCategories.length > 0;
  const needsReserve = isEnvelope && selectedReserveCategories.length > 0;
  const monthsToLoad = needsBurn
    ? monthUtils.rangeInclusive(currentMonth, endMonth)
    : config.reserveCategoryIds.length > 0
      ? [currentMonth, nextMonth]
      : [currentMonth];
  const { data: budgetData, error: budgetError } = useQuery({
    queryKey: [
      'cash-flow-calendar-budget',
      currentMonth,
      endMonth,
      needsBurn,
      config.reserveCategoryIds.length > 0,
    ],
    queryFn: () =>
      Promise.all(
        monthsToLoad.map(async month => ({
          month,
          cells: await send('envelope-budget-month', { month }),
        })),
      ),
    enabled:
      operatingAccountIds.length > 0 &&
      (needsBurn || (isEnvelope && config.reserveCategoryIds.length > 0)),
  });
  const { data: sinkingAutomationPlans, isPending: isPlanPending } = useQuery({
    queryKey: [
      'cash-flow-sinking-plan-automations',
      currentMonth,
      nextMonth,
      selectedReserveCategories.map(category => category.id),
    ],
    queryFn: () =>
      loadSinkingAutomationPlans(
        selectedReserveCategories.map(category => category.id),
        [currentMonth, nextMonth],
      ),
    enabled:
      isEnvelope &&
      operatingAccountIds.length > 0 &&
      selectedReserveCategories.length > 0,
  });
  const { data: automationPlans, error: automationError } = useQuery({
    queryKey: [
      'cash-flow-calendar-automation-plans',
      currentMonth,
      endMonth,
      selectedBurnCategories.map(category => category.id),
    ],
    queryFn: () =>
      loadAutomationBurnPlans(
        selectedBurnCategories.map(category => category.id),
        monthsToLoad,
      ),
    enabled: operatingAccountIds.length > 0 && needsBurn,
  });
  const currentCells = budgetData?.find(
    item => item.month === currentMonth,
  )?.cells;
  const leftoverFor = (categoryId: string) =>
    Number(
      currentCells?.find(cell => cell.name.endsWith(`leftover-${categoryId}`))
        ?.value ?? 0,
    );
  const reserveLeftoverFor = (categoryId: string) => {
    if (
      !selectedReserveCategories.some(category => category.id === categoryId)
    ) {
      return null;
    }
    const value = currentCells?.find(cell =>
      cell.name.endsWith(`leftover-${categoryId}`),
    )?.value;
    const balance = value == null ? null : Number(value);
    return balance != null && Number.isFinite(balance) ? balance : null;
  };
  const monthBudgets: Record<string, Record<string, number>> = {};
  for (const item of budgetData ?? []) {
    monthBudgets[item.month] = {};
    for (const category of selectedBurnCategories) {
      monthBudgets[item.month][category.id] = Number(
        item.cells.find(cell => cell.name.endsWith(`budget-${category.id}`))
          ?.value ?? 0,
      );
    }
  }
  const monthSpending: Record<string, Record<string, number>> = {
    [currentMonth]: {},
  };
  for (const category of selectedBurnCategories) {
    monthSpending[currentMonth][category.id] = Number(
      currentCells?.find(cell =>
        cell.name.endsWith(`sum-amount-${category.id}`),
      )?.value ?? 0,
    );
  }
  const hasFundedFallback =
    automationPlans != null &&
    selectedBurnCategories.some(category =>
      monthsToLoad.some(month => automationPlans[month]?.[category.id] == null),
    );
  const budgetBurn =
    needsBurn &&
    budgetData &&
    !budgetError &&
    automationPlans &&
    !automationError &&
    forecastData
      ? buildBudgetBurnProjection({
          enabled: true,
          categories: selectedBurnCategories.map(category => ({
            categoryId: category.id,
            categoryName: category.name,
            leftover: leftoverFor(category.id),
          })),
          forecastData:
            debtAccountIds.length > 0
              ? {
                  ...forecastData,
                  dataPoints: forecastData.dataPoints.filter(
                    point => !debtAccountIds.includes(point.accountId),
                  ),
                }
              : forecastData,
          today,
          endDate,
          monthBudgets,
          automationPlans,
          monthSpending,
        })
      : null;
  const isCalendarReady = !needsBurn || (budgetBurn != null && !budgetError);
  const risk = forecastData
    ? calculateCashFlowRisk({
        forecastData,
        budgetBurn,
        isBurnRequired: needsBurn,
        safetyBuffer: config.safetyBuffer,
        operatingAccountIds,
        today,
        endDate,
      })
    : null;
  const runway =
    !schedulesLoading && !schedulesError && !payeesLoading && payeesById != null
      ? calculatePaydayRunway({
          forecastData,
          schedules,
          selectedScheduleIds: config.paydayScheduleIds,
          transferPayeeIds,
          operatingAccountIds,
          budgetBurn,
          isBurnComplete: isCalendarReady,
          isVariableSpendingIncluded: needsBurn,
          safetyBuffer: config.safetyBuffer,
          currentOperatingCash,
          today,
          endDate,
        })
      : null;
  const backing = isEnvelope
    ? calculateSinkingBacking({
        categories: config.reserveCategoryIds.map(id => ({
          id,
          name:
            selectedReserveCategories.find(category => category.id === id)
              ?.name ?? id,
          balance: reserveLeftoverFor(id),
        })),
        accountIds: reserveAccountIds,
        balances: accountBalances,
      })
    : null;
  const savingsPlan = isEnvelope
    ? buildSinkingSavingsPlan({
        month: planMonth,
        categories: config.reserveCategoryIds.map(id => ({
          id,
          name:
            selectedReserveCategories.find(category => category.id === id)
              ?.name ?? id,
        })),
        monthCells: budgetData?.find(item => item.month === planMonth)?.cells,
        currentCells,
        contributions: sinkingAutomationPlans?.[planMonth],
        reserveAccountIds,
        accountBalances,
      })
    : null;
  const debtPayments = deriveScheduledDebtPayments({
    forecastData,
    operatingAccountIds,
    debtAccountIds,
    today,
    endDate,
  });
  const advisor =
    isEnvelope &&
    forecastData &&
    (budgetData || !needsReserve) &&
    (!needsBurn || (automationPlans && !automationError))
      ? calculateSweepAdvisor({
          forecastData,
          budgetBurn,
          isBudgetBurnComplete: budgetBurn != null,
          operatingAccountIds,
          reserveAccountIds,
          reserveCategoryLeftovers: config.reserveCategoryIds.map(id =>
            reserveLeftoverFor(id),
          ),
          safetyBuffer: config.safetyBuffer,
          today,
          endDate,
        })
      : null;
  const paydayReview = derivePaydayReview({
    runway,
    risk,
    savingsPlan,
    advisor,
    currentOperatingCash,
    safetyBuffer: config.safetyBuffer,
    hasOperatingAccounts: operatingAccountIds.length > 0,
    hasReserveAccounts: reserveAccountIds.length > 0,
    hasPaydaySelection: config.paydayScheduleIds.length > 0,
    hasReserveCategories: selectedReserveCategories.length > 0,
    isEnvelope,
  });

  return (
    <Page
      header={<PageHeader title={<Trans>Cash Flow Calendar</Trans>} />}
      padding={0}
    >
      <View
        style={{
          backgroundColor: theme.tableBackground,
          padding: 20,
          gap: 18,
          flex: '1 0 auto',
          overflowY: 'auto',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <CashFlowSetup
            config={config}
            accounts={availableAccounts}
            expenseGroups={expenseGroups}
            expenseCategories={expenseCategories}
            schedules={payeesById == null ? [] : schedules}
            transferPayeeIds={transferPayeeIds}
            onChange={updateConfig}
          />
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>Operating accounts</Trans>: {operatingAccountIds.length} ·{' '}
            <Trans>Sinking Savings accounts</Trans>: {reserveAccountIds.length}{' '}
            · <Trans>Budget Burn</Trans>:{' '}
            {config.budgetBurnEnabled ? <Trans>On</Trans> : <Trans>Off</Trans>}{' '}
            · <Trans>Burn categories</Trans>: {selectedBurnCategories.length} ·{' '}
            <Trans>Sinking categories</Trans>:{' '}
            {selectedReserveCategories.length}
          </Text>
        </View>
        {!isEnvelope && (
          <Text style={{ color: theme.warningText }}>
            <Trans>
              Budget Burn and Sinking Savings advice require Envelope budgeting.
              Native scheduled cash forecasting remains available.
            </Trans>
          </Text>
        )}
        <CashFlowPaydayReview
          review={paydayReview}
          runway={runway}
          savingsPlan={savingsPlan}
          advisor={advisor}
          planMonth={planMonth}
        />
        <PaydayChecklist
          month={planMonth}
          checklist={paydayChecklist}
          isLoading={
            isChecklistFetching ||
            (isEnvelope && categoryData == null && !categoriesError)
          }
          isEnvelope={isEnvelope}
          hasCategoryData={categoryData != null}
          hasCategories={expenseCategories.length > 0}
        />
        {operatingAccountIds.length === 0 ? (
          <View style={{ padding: 20, color: theme.pageTextLight }}>
            <Trans>
              Select at least one Operating account in Cash Flow Setup to start
              forecasting.
            </Trans>
          </View>
        ) : (
          <>
            {forecast.isPending && <LoadingIndicator />}
            {forecast.error && (
              <Text style={{ color: theme.errorText }}>
                <Trans>Failed to load cash forecast.</Trans>
              </Text>
            )}
            {budgetError && (
              <Text style={{ color: theme.errorText }}>
                <Trans>Failed to load budget data.</Trans>
              </Text>
            )}
            {automationError && (
              <Text style={{ color: theme.errorText }}>
                <Trans>Failed to load Budget Automation plans.</Trans>
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {runway && forecastData && (
                <View style={{ flex: '1 1 330px', minWidth: 0 }}>
                  <CashFlowPaydayCallout runway={runway} />
                </View>
              )}
              {risk && (
                <View style={{ flex: '1 1 330px', minWidth: 0 }}>
                  <CashFlowRiskCallout
                    risk={risk}
                    endDate={endDate}
                    hasPaydaySelection={config.paydayScheduleIds.length > 0}
                  />
                </View>
              )}
            </View>
            {schedulesError && (
              <Text style={{ color: theme.errorText }}>
                <Trans>Failed to load schedules.</Trans>
              </Text>
            )}
            {!schedulesLoading &&
              !schedulesError &&
              (attention.attention.length > 0 ||
                attention.upcomingCount > 0) && (
                <CashFlowAttention
                  {...attention}
                  accountNames={accountNames}
                  payeeNames={payeeNames}
                />
              )}
            {isCalendarReady && (
              <CashFlowCalendarView
                forecastData={forecastData}
                start={currentMonth}
                end={endMonth}
                firstDayOfWeekIdx={firstDayOfWeekIdx}
                budgetBurn={budgetBurn ?? undefined}
                selectedBurnCategoryCount={selectedBurnCategories.length}
                manualScheduleIds={manualScheduleIds}
                operatingAccountIds={operatingAccountIds}
                enableDayDetails
              />
            )}
            {savingsPlan && (
              <SinkingSavingsPlanCallout
                plan={savingsPlan}
                currentMonth={currentMonth}
                nextMonth={nextMonth}
                selectedMonth={planMonth}
                onMonthChange={setSelectedPlanMonth}
                isLoading={
                  config.reserveCategoryIds.length > 0 &&
                  ((budgetData == null && !budgetError) ||
                    (selectedReserveCategories.length > 0 && isPlanPending))
                }
              />
            )}
            {backing && <CashFlowBackingCallout backing={backing} />}
            {isEnvelope && advisor && (
              <SweepCallout
                advisor={advisor}
                safetyBuffer={config.safetyBuffer}
              />
            )}
            {isEnvelope &&
              !advisor &&
              !forecast.isPending &&
              (needsReserve || !isCalendarReady) &&
              !budgetError &&
              !automationError && <LoadingIndicator />}
            {forecastData && (
              <CashFlowDebtCallout
                payments={debtPayments}
                hasDebtAccounts={debtAccountIds.length > 0}
              />
            )}
            <details style={{ color: theme.pageTextLight, fontSize: 12 }}>
              <summary>
                <Trans>Forecast notes</Trans>
              </summary>
              {needsBurn && automationPlans && !automationError && (
                <Text>
                  {hasFundedFallback ? (
                    <Trans>
                      Fixed Budget Automations provide spending plans
                      independent of envelope funding. Categories without a
                      usable fixed automation use funded-budget amounts; future
                      months without a positive budget repeat the current
                      monthly budget.
                    </Trans>
                  ) : (
                    <Trans>
                      Budget Burn uses fixed Budget Automation plans independent
                      of envelope funding.
                    </Trans>
                  )}
                </Text>
              )}
              <Text>
                <Trans>
                  Manual: Actual will not automatically add this transaction.
                </Trans>{' '}
                ·{' '}
                <Trans>Negative: projected Operating cash is below zero.</Trans>
                {budgetBurn && (
                  <>
                    {' · '}
                    <Trans>
                      Budget Burn: expected variable spending not already
                      represented by scheduled expenses.
                    </Trans>
                  </>
                )}
              </Text>
            </details>
          </>
        )}
      </View>
    </Page>
  );
}
