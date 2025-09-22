// @ts-strict-ignore
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import FullCalendar from '@fullcalendar/react';
import { CalendarApi, type DatesSetArg, type EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import * as d from 'date-fns';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { SvgArrowButtonLeft1, SvgArrowButtonRight1 } from '@actual-app/components/icons/v2';
import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { send } from 'loot-core/platform/client/fetch';
import * as monthUtils from 'loot-core/shared/months';
import {
  type ForecastCalendarResponse,
  type ForecastDailyStrategy,
} from 'loot-core/types/forecast';

import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useCategories } from '@desktop-client/hooks/useCategories';
import { useLocalPref } from '@desktop-client/hooks/useLocalPref';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useDispatch } from '@desktop-client/redux';

type ForecastRange = {
  start: string;
  end: string;
};

function createInitialRange(): ForecastRange {
  const today = new Date();
  return {
    start: monthUtils.dayFromDate(d.startOfMonth(today)),
    end: monthUtils.dayFromDate(d.endOfMonth(today)),
  };
}

function normalizeRange(start: Date, exclusiveEnd: Date): ForecastRange {
  const normalizedStart = monthUtils.dayFromDate(start);
  const inclusiveEnd = d.addDays(exclusiveEnd, -1);
  const normalizedEnd = monthUtils.dayFromDate(inclusiveEnd);
  return { start: normalizedStart, end: normalizedEnd };
}

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
  extendedProps: ForecastCalendarResponse['events'][number];
};

export function PredictiveCalendar() {
  const { t } = useTranslation();
  const format = useFormat();
  const accounts = useAccounts();
  const { grouped: categoryGroups } = useCategories();
  const [firstDayPref] = useSyncedPref('firstDayOfWeekIdx');
  const [storedStrategies, setStoredStrategies] = useLocalPref(
    'predictiveCalendar.groupStrategies',
  );

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [range, setRange] = useState<ForecastRange>(createInitialRange);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastCalendarResponse | null>(
    null,
  );
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<
    ForecastCalendarResponse['events'][number] | null
  >(null);
  const [calendarTitle, setCalendarTitle] = useState('');
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const calendarRef = useRef<CalendarApi | null>(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { normalizedStrategies, hasUnassignedDaily } = useMemo(() => {
    const normalized: Record<string, ForecastDailyStrategy> = {};
    let needsAssignment = false;

    Object.entries(storedStrategies ?? {}).forEach(([groupId, value]) => {
      if (!value) {
        return;
      }

      if (typeof value === 'string') {
        if (value === 'daily') {
          normalized[groupId] = { mode: 'daily', accountId: null };
          needsAssignment = true;
        }
        return;
      }

      if (value.mode === 'daily') {
        const accountId = value.accountId ?? null;
        if (!accountId) {
          needsAssignment = true;
        }
        normalized[groupId] = { mode: 'daily', accountId };
      }
    });

    return { normalizedStrategies: normalized, hasUnassignedDaily: needsAssignment };
  }, [storedStrategies]);

  const requestStrategies = useMemo(() => {
    const filtered: Record<string, ForecastDailyStrategy> = {};

    Object.entries(normalizedStrategies).forEach(([groupId, strategy]) => {
      if (strategy.accountId) {
        filtered[groupId] = strategy;
      }
    });

    return filtered;
  }, [normalizedStrategies]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    categoryGroups.forEach(group => {
      if (!group.hidden) {
        map.set(group.id, group.name);
      }
    });
    return map;
  }, [categoryGroups]);


  const strategyOptions = useMemo(
    () =>
      [
        ['scheduled', t('Use schedules')],
        ['daily', t('Daily allotment')],
      ] as Array<['scheduled' | 'daily', string]>,
    [t],
  );

  const calendarClassName = useMemo(
    () =>
      css({
        '--fc-page-bg-color': theme.tableBackground,
        '--fc-neutral-bg-color': theme.tableBackground,
        '--fc-neutral-text-color': theme.pageTextSubdued,
        '--fc-border-color': theme.tableBorder,
        '--fc-button-text-color': theme.buttonMenuText,
        '--fc-button-bg-color': theme.buttonMenuBackground,
        '--fc-button-border-color': theme.buttonMenuBorder,
        '--fc-button-hover-bg-color': theme.buttonMenuBackgroundHover,
        '--fc-button-hover-border-color': theme.buttonMenuBorder,
        '--fc-button-active-bg-color': theme.sidebarItemBackgroundPositive,
        '--fc-button-active-border-color': theme.sidebarItemBackgroundPositive,
        '--fc-event-bg-color': theme.noticeBackground,
        '--fc-event-border-color': 'transparent',
        '--fc-event-text-color': theme.tableText,
        '--fc-today-bg-color': theme.tableRowBackgroundHighlight,
        '--fc-now-indicator-color': theme.noticeBorder,

        '.fc': {
          color: theme.tableText,
        },

        '.fc .fc-scrollgrid': {
          border: `1px solid ${theme.tableBorder}`,
        },

        '.fc-theme-standard td, .fc-theme-standard th': {
          borderColor: theme.tableBorder,
        },

        '.fc .fc-daygrid-day-top': {
          color: theme.pageTextSubdued,
        },

        '.predictive-calendar-balance': {
          fontSize: '0.7rem',
          fontWeight: 600,
        },

        '.predictive-calendar-event': {
          borderRadius: 6,
          padding: '2px 6px',
          boxShadow: 'none',
        },

        '.predictive-calendar-event--income': {
          backgroundColor: theme.noticeBackground,
          border: `1px solid ${theme.noticeBorder}`,
          color: theme.noticeTextDark,
        },

        '.predictive-calendar-event--expense': {
          backgroundColor: theme.errorBackground,
          color: theme.errorText,
        },

        '.predictive-calendar-event--actual': {
          border: `1px solid ${theme.sidebarItemAccentSelected}`,
        },

        '.predictive-calendar-event--allocation': {
          backgroundColor: theme.upcomingBackground,
          color: theme.tableText,
        },

        '.predictive-calendar-day-number': {
          fontWeight: 600,
        },
      }),
    [],
  );

  const openAccounts = useMemo(
    () => (accounts || []).filter(account => account.closed === 0),
    [accounts],
  );
  const accountOptions = useMemo(
    () => openAccounts.map(account => [account.id, account.name] as [string, string]),
    [openAccounts],
  );

  const handleStrategyChange = useCallback(
    (groupId: string, value: 'scheduled' | 'daily') => {
      const base = storedStrategies ? { ...storedStrategies } : {};

      if (value === 'scheduled') {
        delete base[groupId];
        setStoredStrategies(base);
        return;
      }

      const fallbackAccountId =
        normalizedStrategies[groupId]?.accountId ??
        selectedAccountId ??
        openAccounts[0]?.id ??
        null;

      base[groupId] = { mode: 'daily', accountId: fallbackAccountId };

      setStoredStrategies(base);
    },
    [
      requestStrategies,
      openAccounts,
      selectedAccountId,
      setStoredStrategies,
      storedStrategies,
    ],
  );

  const handleDailyAccountChange = useCallback(
    (groupId: string, accountId: string) => {
      const base = storedStrategies ? { ...storedStrategies } : {};
      base[groupId] = { mode: 'daily', accountId };
      setStoredStrategies(base);
    },
    [setStoredStrategies, storedStrategies],
  );

  useEffect(() => {
    if (openAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }

    if (!selectedAccountId) {
      setSelectedAccountId(openAccounts[0].id);
      return;
    }

    if (!openAccounts.some(acc => acc.id === selectedAccountId)) {
      setSelectedAccountId(openAccounts[0].id);
    }
  }, [openAccounts, selectedAccountId]);
  useEffect(() => {
    if (!hasUnassignedDaily) {
      return;
    }

    const defaultAccountId =
      selectedAccountId ?? openAccounts[0]?.id ?? null;

    if (!defaultAccountId || !storedStrategies) {
      return;
    }

    const updated = { ...storedStrategies };
    let changed = false;

    Object.entries(storedStrategies).forEach(([groupId, value]) => {
      if (!value) {
        return;
      }

      if (typeof value === 'string') {
        if (value === 'daily') {
          updated[groupId] = { mode: 'daily', accountId: defaultAccountId };
          changed = true;
        } else if (value === 'scheduled') {
          delete updated[groupId];
          changed = true;
        }
        return;
      }

      if (value.mode === 'daily' && !value.accountId) {
        updated[groupId] = { mode: 'daily', accountId: defaultAccountId };
        changed = true;
      }
    });

    if (changed) {
      setStoredStrategies(updated);
    }
  }, [
    hasUnassignedDaily,
    openAccounts,
    selectedAccountId,
    setStoredStrategies,
    storedStrategies,
  ]);

  useEffect(() => {
    if (!selectedAccountId) {
      setForecast(null);
      return;
    }

    if (hasUnassignedDaily) {
      return;
    }

    let cancelled = false;

    async function loadForecast() {
      setIsLoading(true);
      setError(null);
      setForecast(null);

      try {
        const response = await (send('forecast/get-calendar-data', {
          accountId: selectedAccountId,
          startDate: range.start,
          endDate: range.end,
          groupStrategies: requestStrategies,
        }) as Promise<ForecastCalendarResponse>);

        if (!cancelled) {
          setForecast(response);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : t('Unable to load calendar data.');
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadForecast();

    return () => {
      cancelled = true;
    };
  }, [
    hasUnassignedDaily,
    requestStrategies,
    range.end,
    range.start,
    selectedAccountId,
    t,
  ]);

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    if (!forecast) {
      return [];
    }

    return forecast.events.map(event => ({
      id: event.id,
      title: event.name || t('Scheduled transaction'),
      start: event.date,
      allDay: true,
      extendedProps: event,
    }));
  }, [forecast, t]);

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const normalized = normalizeRange(arg.start, arg.end);
      setRange(normalized);
      setCalendarTitle(arg.view.title);
      const monthSource = arg.view.currentStart ?? arg.start;
      setCurrentMonth(monthUtils.monthFromDate(monthSource));
    },
    [],
  );

  const onEventContent = useCallback(
    (
      arg: {
        event: {
          extendedProps: {
            amount?: number;
            name?: string;
            type?: 'scheduled' | 'actual' | 'allocation';
          };
        };
      },
    ) => {
      const amount = arg.event.extendedProps.amount;
      const name = arg.event.extendedProps.name;
      const type = arg.event.extendedProps.type;
      const amountLabel =
        amount != null ? format(amount, 'financial-with-sign') : '';
      const displayName = (() => {
        if (type === 'allocation') {
          return t('Daily allotment: {{group}}', {
            group: name || t('Variable spending'),
          });
        }
        if (type === 'actual' && (!name || name === 'Transaction')) {
          return t('Transaction');
        }
        return name;
      })();

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color:
                amount != null && amount < 0
                  ? theme.errorText
                  : theme.noticeTextDark,
            }}
          >
            {amountLabel}
          </Text>
          {displayName ? (
            <Text
              style={{
                fontSize: '0.7rem',
                lineHeight: '1rem',
                color: theme.tableText,
              }}
            >
              {displayName}
            </Text>
          ) : null}
        </div>
      );
    },
    [format, t],
  );

  const onEventDidMount = useCallback((arg: { el: HTMLElement }) => {
    arg.el.style.whiteSpace = 'normal';
  }, []);

  const loadingOverlayClass = useMemo(
    () =>
      css({
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
      }),
    [],
  );

  const eventClassNames = useCallback(
    (
      arg: {
        event: {
          extendedProps: {
            amount?: number;
            type?: 'scheduled' | 'actual' | 'allocation';
          };
        };
      },
    ) => {
      const classes = ['predictive-calendar-event'];
      const { amount, type } = arg.event.extendedProps;
      if (amount != null) {
        if (amount < 0) {
          classes.push('predictive-calendar-event--expense');
        } else if (amount > 0) {
          classes.push('predictive-calendar-event--income');
        }
      }
      if (type === 'actual') {
        classes.push('predictive-calendar-event--actual');
      } else if (type === 'allocation') {
        classes.push('predictive-calendar-event--allocation');
      }
      return classes;
    },
    [],
  );

  const onEventClick = useCallback(
    (info: EventClickArg) => {
      info.jsEvent.preventDefault();
      if (typeof info.jsEvent.stopPropagation === 'function') {
        info.jsEvent.stopPropagation();
      }

      const event = info.event.extendedProps as ForecastCalendarResponse['events'][number];

      if (event.type === 'scheduled' && event.scheduleId) {
        dispatch(
          pushModal({
            modal: { name: 'schedule-edit', options: { id: event.scheduleId } },
          }),
        );
        return;
      }

      if (event.type === 'actual') {
        setDetailEvent(event);
        return;
      }

      if (event.type === 'allocation' && event.groupId) {
        setIsGroupModalOpen(true);
      }
    },
    [dispatch],
  );

  const onDateClick = useCallback(
    (_info: DateClickArg) => {
      dispatch(
        pushModal({
          modal: { name: 'schedule-edit', options: null },
        }),
      );
    },
    [dispatch],
  );

  const renderDayCell = useCallback(
    (arg: { date: Date; dayNumberText: string }) => {
      const dateKey = monthUtils.dayFromDate(arg.date);
      const balance = forecast?.dailyBalances[dateKey];
      const dateMonth = monthUtils.monthFromDate(arg.date);
      const isCurrentMonthDay =
        currentMonth == null || dateMonth === currentMonth;
      const balanceLabel =
        isCurrentMonthDay && balance != null
          ? format(balance, 'financial-with-sign')
          : null;

      return (
        <div className="fc-daygrid-day-frame">
          <div
            className="fc-daygrid-day-top"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span className="fc-daygrid-day-number predictive-calendar-day-number">
              {arg.dayNumberText}
            </span>
            {balanceLabel ? (
              <span
                className="predictive-calendar-balance"
                style={{
                  color:
                    balance != null && balance < 0
                      ? theme.errorText
                      : theme.pageTextPositive,
                }}
              >
                {balanceLabel}
              </span>
            ) : null}
          </div>
          <div className="fc-daygrid-day-events" style={{ marginTop: 4 }} />
          <div className="fc-daygrid-day-bg" />
        </div>
      );
    },
    [currentMonth, forecast, format],
  );

  const firstDayOfWeek = useMemo(() => {
    if (typeof firstDayPref === 'string' && firstDayPref.trim() !== '') {
      const parsed = parseInt(firstDayPref, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return 0;
  }, [firstDayPref]);

  const hasAccounts = openAccounts.length > 0;

  useEffect(() => {
    if (!calendarTitle && calendarRef.current) {
      setCalendarTitle(calendarRef.current.view?.title ?? '');
    }
    if (!currentMonth && calendarRef.current?.view?.currentStart) {
      setCurrentMonth(
        monthUtils.monthFromDate(calendarRef.current.view.currentStart),
      );
    }
  }, [calendarTitle, currentMonth]);

  return (
    <View
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flex: 1,
        minHeight: 0,
      }}
    >
      <View
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <View
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 10,
          }}
        >
          <View
            style={{
              minWidth: 220,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: theme.formLabelText,
                marginBottom: 2,
              }}
            >
              {t('Account')}
            </Text>
            <select
            value={selectedAccountId ?? ''}
            onChange={event => setSelectedAccountId(event.target.value)}
            disabled={!hasAccounts}
            style={{
              width: '100%',
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${theme.formInputBorder}`,
              backgroundColor: theme.formInputBackground,
              color: theme.formInputText,
              fontSize: 14,
            }}
          >
            {openAccounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          </View>

        </View>

        <View
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
            <Button
              onPress={() => calendarRef.current?.prev()}
              aria-label={t('Previous period')}
              style={{ padding: '3px 9px' }}
            >
              <SvgArrowButtonLeft1 style={{ width: 14, height: 14 }} />
            </Button>
            <Button
              onPress={() => calendarRef.current?.today()}
              aria-label={t('Today')}
              style={{ padding: '3px 9px' }}
            >
              {t('today')}
            </Button>
            <Button
              onPress={() => calendarRef.current?.next()}
              aria-label={t('Next period')}
              style={{ padding: '3px 9px' }}
            >
              <SvgArrowButtonRight1 style={{ width: 14, height: 14 }} />
            </Button>
          </View>

          <Text
            style={{
              fontWeight: 600,
              textAlign: 'center',
              flexGrow: 1,
              minWidth: 180,
            }}
          >
            {calendarTitle}
          </Text>

          <View style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
            <Button
              onPress={() =>
                dispatch(pushModal({ modal: { name: 'schedule-edit', options: null } }))
              }
            >
              {t('New schedule')}
            </Button>

            <Button onPress={() => setIsGroupModalOpen(true)}>
              {t('Configure group handling')}
            </Button>
          </View>
        </View>
      </View>

      {isGroupModalOpen && (
        <Modal
          name="predictive-calendar-group-settings"
          onClose={() => setIsGroupModalOpen(false)}
          containerProps={{ style: { width: '32rem' } }}
        >
          {({ state: { close } }) => (
            <>
              <ModalHeader
                title={t('Budget group handling')}
                rightContent={<ModalCloseButton onPress={close} />}
              />
              <View style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {categoryGroups
                  .filter(group => !group.is_income && !group.hidden)
                  .map(group => (
                    <View
                      key={group.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <Text style={{ fontWeight: 500 }}>{group.name}</Text>
                      <View
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Select
                          value={normalizedStrategies[group.id] ? 'daily' : 'scheduled'}
                          options={strategyOptions}
                          onChange={value =>
                            handleStrategyChange(
                              group.id,
                              value as 'scheduled' | 'daily',
                            )
                          }
                          style={{ minWidth: 160 }}
                        />
                        {normalizedStrategies[group.id] ? (
                          <Select
                            value={
                              normalizedStrategies[group.id].accountId ??
                              selectedAccountId ??
                              openAccounts[0]?.id ??
                              ''
                            }
                            options={accountOptions}
                            onChange={accountId =>
                              handleDailyAccountChange(
                                group.id,
                                accountId as string,
                              )
                            }
                            disabled={accountOptions.length === 0}
                            style={{ minWidth: 200 }}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
                {categoryGroups.filter(g => !g.is_income && !g.hidden).length === 0 && (
                  <Block style={{ color: theme.pageTextSubdued }}>
                    {t('No budget groups available.')}
                  </Block>
                )}
              </View>
            </>
          )}
        </Modal>
      )}

      {!hasAccounts && (
        <Text style={{ color: theme.pageTextSubdued }}>
          {t('Add an account to view the calendar.')}
        </Text>
      )}

      {error && (
        <Text style={{ color: theme.errorText }}>{error}</Text>
      )}

      {hasAccounts ? (
        <div
          className={calendarClassName}
          style={{ position: 'relative', flex: '1 1 auto', minHeight: '36rem', minWidth: 0 }}
        >
          {isLoading ? (
            <div className={loadingOverlayClass}>
              <LoadingIndicator message={t('Loading forecastâ€¦')} />
            </div>
          ) : null}
          <FullCalendar
            ref={calendar => {
              calendarRef.current = calendar ? calendar.getApi() : null;
            }}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: '', center: '', right: '' }}
            height="100%"
            firstDay={firstDayOfWeek}
            dayMaxEventRows={3}
            events={calendarEvents}
            eventContent={onEventContent}
            eventDidMount={onEventDidMount}
            eventClassNames={eventClassNames}
            dayCellContent={renderDayCell}
            datesSet={onDatesSet}
            eventClick={onEventClick}
            dateClick={onDateClick}
          />
        </div>
      ) : null}

      {detailEvent && (
        <Modal
          name="predictive-calendar-transaction-details"
          onClose={() => setDetailEvent(null)}
          containerProps={{ style: { width: '28rem' } }}
        >
          {({ state: { close } }) => (
            <>
              <ModalHeader
                title={t('Transaction details')}
                rightContent={<ModalCloseButton onPress={close} />}
              />
              <View style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Block>
                  <strong>{t('Date')}:</strong> {detailEvent.date}
                </Block>
                <Block>
                  <strong>{t('Amount')}:</strong>{' '}
                  {format(detailEvent.amount, 'financial-with-sign')}
                </Block>
                {detailEvent.payee ? (
                  <Block>
                    <strong>{t('Payee')}:</strong> {detailEvent.payee}
                  </Block>
                ) : null}
                {detailEvent.name ? (
                  <Block>
                    <strong>{t('Description')}:</strong> {detailEvent.name}
                  </Block>
                ) : null}
                {detailEvent.groupId ? (
                  <Block>
                    <strong>{t('Group')}:</strong>{' '}
                    {groupNameById.get(detailEvent.groupId) ?? t('Unassigned')}
                  </Block>
                ) : null}
                <View style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button
                    onPress={() => {
                      close();
                      setDetailEvent(null);
                      if (selectedAccountId) {
                        navigate(`/accounts/${selectedAccountId}`);
                      }
                    }}
                  >
                    {t('Open account')}
                  </Button>
                  <Button
                    onPress={() => {
                      close();
                      setDetailEvent(null);
                    }}
                  >
                    {t('Close')}
                  </Button>
                </View>
              </View>
            </>
          )}
        </Modal>
      )}
    </View>
  );
}















