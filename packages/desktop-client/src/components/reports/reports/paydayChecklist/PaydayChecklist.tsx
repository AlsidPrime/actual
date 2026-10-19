import React, { useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { Text } from '@actual-app/components/text';
import { useFormat } from '../../../../hooks/useFormat';

import { useSheetValue } from '../../../../hooks/useSheetValue';
import { useCategories } from '../../../../hooks/useCategories';
import * as monthUtils from '@actual-app/core/shared/months';
import { derivePaydayChecklist } from './derivePaydayChecklist';
import type { PaydayChecklistResult, PaydayChecklistItem } from './derivePaydayChecklist';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { SvgCheveronRight, SvgCheveronDown } from '@actual-app/components/icons/v1';
import { Button } from '@actual-app/components/button';
import { useSpreadsheet } from '../../../../hooks/useSpreadsheet';

export interface PaydayChecklistProps {
  month: string;
}

export function PaydayChecklist({ month }: PaydayChecklistProps) {
  const { t } = useTranslation();
  const { data: { list: categories, grouped: categoryGroups } = { list: [], grouped: [] } } = useCategories();
  const format = useFormat();

  const toBudget = useSheetValue({
    name: monthUtils.sheetForMonth(month) as any,
    value: 'to-budget' as any,
  });

  const [checklist, setChecklist] = React.useState<PaydayChecklistResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  const getGroupName = React.useCallback(
    (groupId: string | null) => {
      if (!groupId) return 'Unknown';
      const group = categoryGroups.find(g => g.id === groupId);
      return group?.name ?? 'Unknown';
    },
    [categoryGroups]
  );

  const sheetName = monthUtils.sheetForMonth(month);

  // Note: we'd ideally read all budgets dynamically. For a quick implementation
  // within the constraints, we can use the `SpreadsheetContext` to read cached
  // values or re-derive when the component mounts/updates.

  const spreadsheet = useSpreadsheet();

  React.useEffect(() => {
    let canceled = false;
    async function load() {
      if (!categories || categories.length === 0 || toBudget == null) {
        return;
      }

      setLoading(true);

      const getBudgeted = (categoryId: string) => {
         const node = (spreadsheet as any)?.getCellValue(sheetName, `budget-${categoryId}`) as unknown as { value: number } | number | null;
         const value = node != null && typeof node === 'object' && 'value' in node ? node.value : node;
         return (typeof value === 'number' ? value : 0);
      };

      const result = await derivePaydayChecklist(month, categories, getBudgeted, toBudget, getGroupName);
      if (!canceled) {
        setChecklist(result);
        setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, [month, categories, toBudget, spreadsheet, getGroupName, sheetName]);


  if (loading) {
    return (
      <View style={{ padding: 15, backgroundColor: theme.pageBackground, borderRadius: 6, border: `1px solid ${theme.tableBorder}` }}>
        <LoadingIndicator message={t('Loading checklist...')} />
      </View>
    );
  }

  if (!checklist) {
    return null;
  }

  const hasShortfall = checklist.availableToBudget < checklist.totalRemainingRequirements;

  return (
    <View style={{ padding: 15, backgroundColor: theme.pageBackground, borderRadius: 6, border: `1px solid ${theme.tableBorder}` }}>
      <Text style={{ fontWeight: 600, fontSize: 16, marginBottom: 10 }}>
        <Trans>Payday Funding Checklist</Trans>
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
         <Text><Trans>Available to Budget:</Trans></Text>
         <Text style={{ color: checklist.availableToBudget < 0 ? theme.errorText : theme.formLabelText, fontWeight: 600 }}>
            {format(checklist.availableToBudget, 'financial')}
         </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
         <Text><Trans>Remaining Funding Required:</Trans></Text>
         <Text style={{ fontWeight: 600 }}>
            {format(checklist.totalRemainingRequirements, 'financial')}
         </Text>
      </View>

      {checklist.availableToBudget < 0 ? (
        <Text style={{ color: theme.errorText, marginBottom: 10 }}>
           <Trans>Available to Budget is negative. Review your budget to resolve the overbudgeted amount before funding more categories.</Trans>
        </Text>
      ) : hasShortfall ? (
        <Text style={{ color: theme.warningText, marginBottom: 10 }}>
           <Trans>Insufficient funds available to complete the plan.</Trans>
        </Text>
      ) : checklist.totalRemainingRequirements > 0 ? (
         <Text style={{ color: theme.noticeText, marginBottom: 10 }}>
           <Trans>Review funding for these categories.</Trans>
        </Text>
      ) : (
         <Text style={{ color: theme.noticeText, marginBottom: 10 }}>
           <Trans>All known categories are fully funded!</Trans>
        </Text>
      )}

      {checklist.items.length > 0 && (
         <Button
            variant="bare"
            onPress={() => setExpanded(!expanded)}
            style={{ alignSelf: 'flex-start', padding: 0 }}
         >
            {expanded ? <SvgCheveronDown width={12} height={12} style={{ marginRight: 5 }} /> : <SvgCheveronRight width={12} height={12} style={{ marginRight: 5 }} />}
            <Trans>{expanded ? 'Hide Details' : 'Show Details'}</Trans>
         </Button>
      )}

      {expanded && (
        <View style={{ marginTop: 10 }}>
           {checklist.items.map(item => (
              <View key={item.categoryId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottom: `1px solid ${theme.tableBorder}` }}>
                 <View>
                   <Text style={{ fontWeight: 500 }}>{item.categoryName}</Text>
                   <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                     {item.priority != null ? `Priority ${item.priority}` : <Trans>No Priority</Trans>}
                     {' • '}{item.status === 'funded' ? <Trans>Funded</Trans> : <Trans>Needs Funding</Trans>}
                   </Text>
                 </View>
                 <View style={{ alignItems: 'flex-end' }}>
                   <Text style={{ fontWeight: 600 }}>{format(item.remainingAmount, 'financial')}</Text>
                   <Text style={{ fontSize: 12, color: theme.pageTextLight }}>
                     <Trans>of</Trans> {format(item.plannedAmount, 'financial')}
                   </Text>
                 </View>
              </View>
           ))}
        </View>
      )}

    </View>
  );
}
