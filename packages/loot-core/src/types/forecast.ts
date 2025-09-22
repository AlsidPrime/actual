export type ForecastDailyStrategy = {
  mode: 'daily';
  accountId: string | null;
};

export type ForecastGroupStrategy =
  | 'scheduled'
  | 'daily'
  | ForecastDailyStrategy
  | {
      mode: 'scheduled';
    };

export type ForecastCalendarRequest = {
  accountId: string;
  startDate: string;
  endDate: string;
  groupStrategies?: Record<string, ForecastGroupStrategy>;
};

export type ForecastCalendarEvent = {
  id: string;
  scheduleId?: string;
  name: string;
  date: string;
  amount: number;
  payee: string | null;
  postsTransaction: boolean;
  type: 'scheduled' | 'actual' | 'allocation';
  transactionId?: string;
  groupId?: string;
};

export type ForecastCalendarResponse = {
  accountId: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  dailyBalances: Record<string, number>;
  events: ForecastCalendarEvent[];
};
