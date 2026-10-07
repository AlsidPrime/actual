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
} from '@actual-app/core/types/models';

import { AccountSelector } from '#components/reports/AccountSelector';
import { CategorySelector } from '#components/reports/CategorySelector';
import { FinancialInput } from '#components/util/FinancialInput';

import { selectAccountRole, selectCategoryRole } from './cashFlowConfig';
import type { CashFlowCalendarConfig } from './cashFlowConfig';

type SetupSection =
  | 'operating'
  | 'reserve-accounts'
  | 'burn'
  | 'reserve-categories';

export function CashFlowSetup({
  config,
  accounts,
  expenseGroups,
  expenseCategories,
  onChange,
}: {
  config: CashFlowCalendarConfig;
  accounts: AccountEntity[];
  expenseGroups: CategoryGroupEntity[];
  expenseCategories: CategoryEntity[];
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
    section === 'operating' || section === 'reserve-accounts';
  const selectedAccountIds =
    section === 'operating'
      ? config.operatingAccountIds
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
                ordinary spending cash. Leave long-term or emergency savings,
                debt, and credit accounts unselected.
              </Trans>
            </Text>
            <Select
              value={section}
              onChange={setSection}
              options={[
                ['operating', t('Operating accounts')],
                ['reserve-accounts', t('Sinking Savings accounts')],
                ['burn', t('Burn categories')],
                ['reserve-categories', t('Sinking categories')],
              ]}
            />
            <View style={{ maxHeight: 260, overflowY: 'auto' }}>
              {isAccountSection ? (
                <AccountSelector
                  accounts={accounts}
                  selectedAccountIds={selectedAccountIds}
                  setSelectedAccountIds={ids =>
                    onChange(
                      selectAccountRole(
                        config,
                        section === 'operating' ? 'operating' : 'reserve',
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
