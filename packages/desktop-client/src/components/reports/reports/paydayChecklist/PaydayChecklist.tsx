import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { PrivacyFilter } from '#components/PrivacyFilter';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import { useSpreadsheet } from '#hooks/useSpreadsheet';

import { derivePaydayChecklist } from './derivePaydayChecklist';
import type { PaydayChecklistResult } from './derivePaydayChecklist';

export type PaydayChecklistProps = {
  month: string;
}

export function PaydayChecklist({ month }: PaydayChecklistProps) {
  const { t } = useTranslation();
  const {
    data: { list: categories, grouped: categoryGroups } = {
      list: [],
      grouped: [],
    },
  } = useCategories();
  const format = useFormat();

  const toBudgetCell = useSheetValue({
    name: monthUtils.sheetForMonth(month),
    value: 'to-budget',
  } as any);
  const toBudget = toBudgetCell ?? 0;

  const [checklist, setChecklist] =
    useState<PaydayChecklistResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const getGroupName = useCallback(
    (groupId: string | null) => {
      if (!groupId) return 'Unknown';
      const group = categoryGroups.find(g => g.id === groupId);
      return group?.name ?? 'Unknown';
    },
    [categoryGroups],
  );

  const sheetName = monthUtils.sheetForMonth(month);

  // Note: we'd ideally read all budgets dynamically. For a quick implementation
  // within the constraints, we can use the `SpreadsheetContext` to read cached
  // values or re-derive when the component mounts/updates.

  const spreadsheet = useSpreadsheet();

  useEffect(() => {
    let canceled = false;
    async function load() {
      if (!categories || categories.length === 0 || toBudget == null) {
        return;
      }

      setLoading(true);

      const getBudgeted = (categoryId: string) => {
        const node = (spreadsheet as unknown as { get: (a: string, b: string) => { value?: number } | number | null })?.get(
          sheetName,
          `budget-${categoryId}`,
        );
        const value =
          node != null && typeof node === 'object' && 'value' in node
            ? node.value
            : node;
        return typeof value === 'number' ? value : 0;
      };

      const result = await derivePaydayChecklist(
        month,
        categories,
        getBudgeted,
        toBudget,
        getGroupName,
      );
      if (!canceled) {
        setChecklist(result);
        setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [month, categories, toBudget, spreadsheet, getGroupName, sheetName]);

  if (loading) {
    return (
      <View
        style={{
          padding: 15,
          backgroundColor: theme.pageBackground,
          borderRadius: 6,
          border: `1px solid ${theme.tableBorder}`,
        }}
      >
        <LoadingIndicator message={t('Loading checklist...')} />
      </View>
    );
  }

  if (!checklist) {
    return null;
  }

  const hasShortfall =
    checklist.availableToBudget < checklist.totalRemainingRequirements;

  return (
    <View
      style={{
        padding: 15,
        backgroundColor: theme.pageBackground,
        borderRadius: 6,
        border: `1px solid ${theme.tableBorder}`,
      }}
    >
      <Text style={{ fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
        <Trans>Payday Funding Checklist</Trans>
      </Text>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 5,
        }}
      >
        <Text>
          <Trans>Available to Budget:</Trans>
        </Text>
        <Text
          style={{
            color:
              checklist.availableToBudget < 0
                ? theme.errorText
                : theme.formLabelText,
            fontWeight: 600,
          }}
        >
          <PrivacyFilter>
            {format(checklist.availableToBudget, 'financial')}
          </PrivacyFilter>
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 15,
        }}
      >
        <Text>
          <Trans>Remaining Funding Required:</Trans>
        </Text>
        <Text style={{ fontWeight: 600 }}>
          <PrivacyFilter>
            {format(checklist.totalRemainingRequirements, 'financial')}
          </PrivacyFilter>
        </Text>
      </View>

      {checklist.availableToBudget < 0 ? (
        <Text style={{ color: theme.errorText, marginBottom: 10 }}>
          <Trans>
            Available to Budget is negative. Review your budget to resolve the
            overbudgeted amount before funding more categories.
          </Trans>
        </Text>
      ) : hasShortfall ? (
        <Text style={{ color: theme.warningText, marginBottom: 10 }}>
          <Trans>Insufficient funds available to complete the plan.</Trans>
        </Text>
      ) : checklist.totalRemainingRequirements > 0 ? (
        <Text style={{ color: theme.noticeText, marginBottom: 10 }}>
          <Trans>Review funding for these categories.</Trans>
        </Text>
      ) : checklist.isComplete ? (
        <Text style={{ color: theme.noticeText, marginBottom: 10 }}>
          <Trans>All known categories are fully funded!</Trans>
        </Text>
      ) : (
        <Text style={{ color: theme.noticeText, marginBottom: 10 }}>
          <Trans>Some requirements could not be calculated.</Trans>
        </Text>
      )}

      {checklist.items.length > 0 && (
        <Button
          variant="bare"
          onPress={() => setExpanded(!expanded)}
          style={{ alignSelf: 'flex-start', padding: 0 }}
        >
          {expanded ? (
            <SvgCheveronDown
              width={12}
              height={12}
              style={{ marginRight: 5 }}
            />
          ) : (
            <SvgCheveronRight
              width={12}
              height={12}
              style={{ marginRight: 5 }}
            />
          )}
          <Trans>{expanded ? 'Hide Details' : 'Show Details'}</Trans>
        </Button>
      )}

      {expanded && (
        <View style={{ marginTop: 10 }}>
          {checklist.items.map(item => (
            <View
              key={item.categoryId}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 5,
                borderBottom: `1px solid ${theme.tableBorder}`,
              }}
            >
              <View>
                <Text style={{ fontWeight: 500 }}>{item.categoryName}</Text>
                <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                  {item.priority != null ? (
                    t('Priority {{priority}}', { priority: item.priority })
                  ) : (
                    <Trans>No Priority</Trans>
                  )}
                  {' • '}
                  {item.status === 'funded' ? (
                    <Trans>Funded</Trans>
                  ) : (
                    <Trans>Needs Funding</Trans>
                  )}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: 600 }}>
                  <PrivacyFilter>
                    {format(item.remainingAmount, 'financial')}
                  </PrivacyFilter>
                </Text>
                <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                  <Trans>of</Trans>{' '}
                  <PrivacyFilter>
                    {format(item.plannedAmount, 'financial')}
                  </PrivacyFilter>
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
