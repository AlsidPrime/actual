import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import {
  SvgCheveronDown,
  SvgCheveronRight,
  SvgCog,
  SvgCreditCard,
  SvgReports,
  SvgStoreFront,
  SvgTag,
  SvgTuning,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar, SvgCalendar3 } from '@actual-app/components/icons/v2';
import { View } from '@actual-app/components/view';

import { Item } from './Item';
import { SecondaryItem } from './SecondaryItem';

import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const onToggle = useCallback(() => setOpen(open => !open), []);
  const location = useLocation();

  const syncServerStatus = useSyncServerStatus();
  const isUsingServer = syncServerStatus !== 'no-server';
  const predictiveCalendarEnabled = useFeatureFlag('predictive-calendar');

  const isActive = [
    '/payees',
    '/rules',
    '/bank-sync',
    '/settings',
    '/tools',
  ].some(route => location.pathname.startsWith(route));

  useEffect(() => {
    if (isActive) {
      setOpen(true);
    }
  }, [isActive, location.pathname]);

  return (
    <View style={{ flexShrink: 0 }}>
      <Item title={t('Budget')} Icon={SvgWallet} to="/budget" />
      {predictiveCalendarEnabled && (
        <Item title={t('Calendar')} Icon={SvgCalendar} to="/budget/calendar" />
      )}
      <Item title={t('Reports')} Icon={SvgReports} to="/reports" />
      <Item title={t('Schedules')} Icon={SvgCalendar3} to="/schedules" />
      <Item
        title={t('More')}
        Icon={isOpen ? SvgCheveronDown : SvgCheveronRight}
        onClick={onToggle}
        style={{ marginBottom: isOpen ? 8 : 0 }}
        forceActive={!isOpen && isActive}
      />
      {isOpen && (
        <>
          <SecondaryItem
            title={t('Payees')}
            Icon={SvgStoreFront}
            to="/payees"
            indent={15}
          />
          <SecondaryItem
            title={t('Rules')}
            Icon={SvgTuning}
            to="/rules"
            indent={15}
          />
          {isUsingServer && (
            <SecondaryItem
              title={t('Bank Sync')}
              Icon={SvgCreditCard}
              to="/bank-sync"
              indent={15}
            />
          )}
          <SecondaryItem
            title={t('Tags')}
            Icon={SvgTag}
            to="/tags"
            indent={15}
          />
          <SecondaryItem
            title={t('Settings')}
            Icon={SvgCog}
            to="/settings"
            indent={15}
          />
        </>
      )}
    </View>
  );
}
