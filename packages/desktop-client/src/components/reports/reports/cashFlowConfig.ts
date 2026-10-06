export type CashFlowCalendarConfig = {
  version: 1;
  operatingAccountIds: string[];
  reserveAccountIds: string[];
  budgetBurnEnabled: boolean;
  burnCategoryIds: string[];
  reserveCategoryIds: string[];
  safetyBuffer: number;
  forecastMonths: 3 | 6 | 12;
};

export const DEFAULT_CASH_FLOW_CONFIG: CashFlowCalendarConfig = {
  version: 1,
  operatingAccountIds: [],
  reserveAccountIds: [],
  budgetBurnEnabled: false,
  burnCategoryIds: [],
  reserveCategoryIds: [],
  safetyBuffer: 0,
  forecastMonths: 12,
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function parseCashFlowConfig(
  raw: string | undefined,
): CashFlowCalendarConfig {
  if (!raw) {
    return { ...DEFAULT_CASH_FLOW_CONFIG };
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 1 ||
      !('operatingAccountIds' in value) ||
      !isStringArray(value.operatingAccountIds) ||
      !('reserveAccountIds' in value) ||
      !isStringArray(value.reserveAccountIds) ||
      !('budgetBurnEnabled' in value) ||
      typeof value.budgetBurnEnabled !== 'boolean' ||
      !('burnCategoryIds' in value) ||
      !isStringArray(value.burnCategoryIds) ||
      !('reserveCategoryIds' in value) ||
      !isStringArray(value.reserveCategoryIds) ||
      !('safetyBuffer' in value) ||
      typeof value.safetyBuffer !== 'number' ||
      !Number.isInteger(value.safetyBuffer) ||
      value.safetyBuffer < 0 ||
      !('forecastMonths' in value) ||
      (value.forecastMonths !== 3 &&
        value.forecastMonths !== 6 &&
        value.forecastMonths !== 12)
    ) {
      return { ...DEFAULT_CASH_FLOW_CONFIG };
    }
    const operatingIds = [...new Set(value.operatingAccountIds)];
    const burnIds = [...new Set(value.burnCategoryIds)];
    return {
      version: 1,
      operatingAccountIds: operatingIds,
      reserveAccountIds: [...new Set(value.reserveAccountIds)].filter(
        id => !operatingIds.includes(id),
      ),
      budgetBurnEnabled: value.budgetBurnEnabled,
      burnCategoryIds: burnIds,
      reserveCategoryIds: [...new Set(value.reserveCategoryIds)].filter(
        id => !burnIds.includes(id),
      ),
      safetyBuffer: value.safetyBuffer,
      forecastMonths: value.forecastMonths,
    };
  } catch {
    return { ...DEFAULT_CASH_FLOW_CONFIG };
  }
}

export function selectAccountRole(
  config: CashFlowCalendarConfig,
  role: 'operating' | 'reserve',
  selectedIds: string[],
): CashFlowCalendarConfig {
  const ids = [...new Set(selectedIds)];
  return role === 'operating'
    ? {
        ...config,
        operatingAccountIds: ids,
        reserveAccountIds: config.reserveAccountIds.filter(
          id => !ids.includes(id),
        ),
      }
    : {
        ...config,
        reserveAccountIds: ids,
        operatingAccountIds: config.operatingAccountIds.filter(
          id => !ids.includes(id),
        ),
      };
}

export function selectCategoryRole(
  config: CashFlowCalendarConfig,
  role: 'burn' | 'reserve',
  selectedIds: string[],
): CashFlowCalendarConfig {
  const ids = [...new Set(selectedIds)];
  return role === 'burn'
    ? {
        ...config,
        burnCategoryIds: ids,
        reserveCategoryIds: config.reserveCategoryIds.filter(
          id => !ids.includes(id),
        ),
      }
    : {
        ...config,
        reserveCategoryIds: ids,
        burnCategoryIds: config.burnCategoryIds.filter(id => !ids.includes(id)),
      };
}
