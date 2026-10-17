import { useState } from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Popover } from '@actual-app/components/popover';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  AccountEntity,
  CategoryEntity,
  CategoryGroupEntity,
  ScheduleEntity,
} from '@actual-app/core/types/models';

import { Checkbox } from '#components/forms';
import { AccountSelector } from '#components/reports/AccountSelector';
import { CategorySelector } from '#components/reports/CategorySelector';
import { FinancialInput } from '#components/util/FinancialInput';

import { selectAccountRole, selectCategoryRole } from './cashFlowConfig';
import type { CashFlowCalendarConfig } from './cashFlowConfig';
import { isEligiblePaydaySchedule } from './cashFlowPayday';

type SetupSection =
  | 'operating'
  | 'reserve-accounts'
  | 'debt-accounts'
  | 'burn'
  | 'reserve-categories'
  | 'payday';

export function CashFlowSetup({
  config,
  accounts,
  expenseGroups,
  expenseCategories,
  schedules,
  transferPayeeIds,
  onChange,
}: {
  config: CashFlowCalendarConfig;
  accounts: AccountEntity[];
  expenseGroups: CategoryGroupEntity[];
  expenseCategories: CategoryEntity[];
  schedules: readonly ScheduleEntity[];
  transferPayeeIds: ReadonlySet<string>;
  onChange: (config: CashFlowCalendarConfig) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SetupSection>('operating');
  const selectedCategories = expenseCategories.filter(category =>
    (section === 'burn'
      ? config.burnCategoryIds
      : config.reserveCategoryIds
    ).includes(category.id),
  );
  const isAccountSection =
    section === 'operating' ||
    section === 'reserve-accounts' ||
    section === 'debt-accounts';
  const selectedAccountIds =
    section === 'operating'
      ? config.operatingAccountIds
      : section === 'debt-accounts'
        ? config.debtAccountIds
        : config.reserveAccountIds;

  return (
    <DialogTrigger>
      <Button variant="primary">
        <Trans>Cash Flow Setup</Trans>
      </Button>
      <Popover
        placement="bottom end"
        style={{
          width: 460,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <Dialog
          aria-label={t('Cash Flow Setup')}
          style={{ padding: 16, outline: 'none' }}
        >
          <View style={{ gap: 12 }}>
            <Text style={{ fontWeight: 600 }}>
              <Trans>Cash Flow Setup</Trans>
            </Text>
            <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
              <Trans>
                Select Operating accounts for day-to-day spending. Sinking
                Savings accounts back sinking categories and do not count as
                ordinary spending cash. Leave long-term and emergency savings
                unselected. Select debt and credit accounts only in the Debt and
                credit accounts section.
              </Trans>
            </Text>
            <Select
              value={section}
              onChange={setSection}
              options={[
                ['operating', t('Operating accounts')],
                ['reserve-accounts', t('Sinking Savings accounts')],
                ['debt-accounts', t('Debt and credit accounts')],
                ['burn', t('Burn categories')],
                ['reserve-categories', t('Sinking categories')],
                ['payday', t('Payday schedules')],
              ]}
            />
            <View style={{ maxHeight: 260, overflowY: 'auto' }}>
              {section === 'payday' ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
                    <Trans>
                      Select recurring employment income schedules. Only income
                      forecast into Operating accounts establishes a funded
                      payday.
                    </Trans>
                  </Text>
                  {schedules.every(
                    schedule =>
                      !isEligiblePaydaySchedule(schedule) ||
                      transferPayeeIds.has(schedule._payee),
                  ) && (
                    <Text>
                      <Trans>
                        No eligible recurring income schedules were found.
                      </Trans>
                    </Text>
                  )}
                  {schedules
                    .filter(
                      schedule =>
                        isEligiblePaydaySchedule(schedule) &&
                        !transferPayeeIds.has(schedule._payee),
                    )
                    .map(schedule => (
                      <label
                        key={schedule.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Checkbox
                          checked={config.paydayScheduleIds.includes(
                            schedule.id,
                          )}
                          onChange={() =>
                            onChange({
                              ...config,
                              paydayScheduleIds:
                                config.paydayScheduleIds.includes(schedule.id)
                                  ? config.paydayScheduleIds.filter(
                                      id => id !== schedule.id,
                                    )
                                  : [...config.paydayScheduleIds, schedule.id],
                            })
                          }
                        />
                        {schedule.name || t('Unnamed schedule')}
                      </label>
                    ))}
                  {config.paydayScheduleIds.some(
                    id =>
                      !schedules.some(
                        schedule =>
                          schedule.id === id &&
                          isEligiblePaydaySchedule(schedule) &&
                          !transferPayeeIds.has(schedule._payee),
                      ),
                  ) && (
                    <Text style={{ color: theme.warningText }}>
                      <Trans>
                        A selected payday schedule is missing or no longer
                        eligible. Review your selection.
                      </Trans>
                    </Text>
                  )}
                </View>
              ) : isAccountSection ? (
                <AccountSelector
                  accounts={accounts}
                  selectedAccountIds={selectedAccountIds}
                  setSelectedAccountIds={ids =>
                    onChange(
                      selectAccountRole(
                        config,
                        section === 'operating'
                          ? 'operating'
                          : section === 'debt-accounts'
                            ? 'debt'
                            : 'reserve',
                        ids,
                      ),
                    )
                  }
                />
              ) : (
                <CategorySelector
                  categoryGroups={expenseGroups}
                  selectedCategories={selectedCategories}
                  setSelectedCategories={categories =>
                    onChange(
                      selectCategoryRole(
                        config,
                        section === 'burn' ? 'burn' : 'reserve',
                        categories.map(category => category.id),
                      ),
                    )
                  }
                />
              )}
            </View>
            <Button
              onPress={() =>
                onChange({
                  ...config,
                  budgetBurnEnabled: !config.budgetBurnEnabled,
                })
              }
            >
              {config.budgetBurnEnabled ? (
                <Trans>Budget Burn enabled</Trans>
              ) : (
                <Trans>Budget Burn disabled</Trans>
              )}
            </Button>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <label htmlFor="cash-flow-safety-buffer">
                <Trans>Safety buffer</Trans>
              </label>
              <FinancialInput
                id="cash-flow-safety-buffer"
                aria-label={t('Safety buffer')}
                value={config.safetyBuffer}
                onUpdate={amount =>
                  onChange({ ...config, safetyBuffer: Math.max(0, amount) })
                }
                style={{ width: 120 }}
              />
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <Text>
                <Trans>Forecast horizon</Trans>
              </Text>
              <Select
                value={String(config.forecastMonths)}
                onChange={value =>
                  onChange({
                    ...config,
                    forecastMonths: value === '3' ? 3 : value === '6' ? 6 : 12,
                  })
                }
                options={[
                  ['3', t('3 months')],
                  ['6', t('6 months')],
                  ['12', t('12 months')],
                ]}
              />
            </View>
            <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
              <Trans>
                Changes save automatically. Forecasts use end-of-day balances.
              </Trans>
            </Text>
          </View>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
