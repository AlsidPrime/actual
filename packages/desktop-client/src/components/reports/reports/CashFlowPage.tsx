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
import { CashFlowCalendarView } from './CashFlowCalendarView';
import { parseCashFlowConfig } from './cashFlowConfig';
import type { CashFlowCalendarConfig } from './cashFlowConfig';
import { calculateSweepAdvisor } from './cashFlowReserve';
import type { SweepAdvisorResult } from './cashFlowReserve';
import { calculateCashFlowRisk } from './cashFlowRisk';
import { CashFlowRiskCallout } from './CashFlowRiskCallout';
import { CashFlowSetup } from './CashFlowSetup';
import { deriveCashFlowAttention } from './deriveCashFlowAttention';

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
            Enable Budget Burn and select variable spending categories before
            relying on a savings transfer recommendation.
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
        advisor.effectiveReserveFundingGap === 0 && (
          <Text>
            <Trans>
              Sinking Savings may be fully funded, but projected Operating cash
              falls below your safety buffer.
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
      {advisor.status !== 'setup' && (
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
          <Text>
            <Trans>Remaining funding need</Trans>:{' '}
            <PrivacyFilter>
              <FinancialText>
                {format(advisor.effectiveReserveFundingGap, 'financial')}
              </FinancialText>
            </PrivacyFilter>
          </Text>
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
  useEffect(
    () =>
      listen('sync-event', event => {
        if (
          (event.type === 'success' || event.type === 'applied') &&
          event.tables.some(table =>
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
          )
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['balance-forecast'],
          });
          void queryClient.invalidateQueries({
            queryKey: ['cash-flow-calendar-budget'],
          });
        }
        if (
          (event.type === 'success' || event.type === 'applied') &&
          event.tables.some(table =>
            ['categories', 'preferences'].includes(table),
          )
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['cash-flow-calendar-automation-plans'],
          });
        }
      }),
    [queryClient],
  );
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
  const { data: categoryData } = useCategories(isEnvelope);
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
    ...new Set([...operatingAccountIds, ...reserveAccountIds]),
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
  const { data: payeesById = {} } = usePayeesById();
  const attention = deriveCashFlowAttention(
    schedules,
    statuses,
    new Set(forecastAccountIds),
  );
  const accountNames = Object.fromEntries(
    availableAccounts.map(account => [account.id, account.name]),
  );
  const payeeNames = Object.fromEntries(
    Object.entries(payeesById).map(([id, payee]) => [id, payee.name]),
  );
  const manualScheduleIds = new Set(
    schedules
      .filter(schedule => schedule.posts_transaction === false)
      .map(schedule => schedule.id),
  );
  const today = monthUtils.currentDay();
  const currentMonth = monthUtils.currentMonth();
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
    : [currentMonth];
  const { data: budgetData, error: budgetError } = useQuery({
    queryKey: ['cash-flow-calendar-budget', currentMonth, endMonth, needsBurn],
    queryFn: () =>
      Promise.all(
        monthsToLoad.map(async month => ({
          month,
          cells: await send('envelope-budget-month', { month }),
        })),
      ),
    enabled: operatingAccountIds.length > 0 && (needsBurn || needsReserve),
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
          forecastData,
          today,
          endDate,
          monthBudgets,
          automationPlans,
          monthSpending,
        })
      : null;
  const risk =
    forecastData && (!needsBurn || budgetBurn)
      ? calculateCashFlowRisk({
          forecastData,
          budgetBurn,
          operatingAccountIds,
          today,
          endDate,
        })
      : null;
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
          reserveCategoryLeftovers: selectedReserveCategories.map(category =>
            leftoverFor(category.id),
          ),
          safetyBuffer: config.safetyBuffer,
          today,
          endDate,
        })
      : null;

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
            {risk && <CashFlowRiskCallout risk={risk} endDate={endDate} />}
            {schedulesError && (
              <Text style={{ color: theme.errorText }}>
                <Trans>Failed to load schedules.</Trans>
              </Text>
            )}
            {!schedulesLoading && !schedulesError && (
              <CashFlowAttention
                {...attention}
                accountNames={accountNames}
                payeeNames={payeeNames}
              />
            )}
            {isEnvelope && advisor && (
              <SweepCallout
                advisor={advisor}
                safetyBuffer={config.safetyBuffer}
              />
            )}
            {isEnvelope &&
              !advisor &&
              !forecast.isPending &&
              needsReserve &&
              !budgetError &&
              !automationError && <LoadingIndicator />}
            {needsBurn && automationPlans && !automationError && (
              <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                {hasFundedFallback ? (
                  <Trans>
                    Fixed Budget Automations provide spending plans independent
                    of envelope funding. Categories without a usable fixed
                    automation use funded-budget amounts; future months without
                    a positive budget repeat the current monthly budget.
                  </Trans>
                ) : (
                  <Trans>
                    Budget Burn uses fixed Budget Automation plans independent
                    of envelope funding.
                  </Trans>
                )}
              </Text>
            )}
            <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
              <Trans>
                Manual: Actual will not automatically add this transaction.
              </Trans>{' '}
              · <Trans>Negative: projected Operating cash is below zero.</Trans>
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
            <CashFlowCalendarView
              forecastData={forecastData}
              start={currentMonth}
              end={endMonth}
              firstDayOfWeekIdx={firstDayOfWeekIdx}
              budgetBurn={budgetBurn ?? undefined}
              selectedBurnCategoryCount={selectedBurnCategories.length}
              manualScheduleIds={manualScheduleIds}
              operatingAccountIds={operatingAccountIds}
            />
          </>
        )}
      </View>
    </Page>
  );
}
