import React from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';

import { PredictiveCalendar } from './PredictiveCalendar';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

export function PredictiveCalendarPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('predictive-calendar');

  return (
    <Page header={t('Calendar')}>
      {enabled ? (
        <PredictiveCalendar />
      ) : (
        <Text style={{ color: theme.pageTextSubdued }}>
          {t('Enable the calendar in Settings -> Experimental.')}
        </Text>
      )}
    </Page>
  );
}




