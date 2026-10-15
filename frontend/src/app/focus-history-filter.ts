import { FocusHistoryEntry } from './models';

export interface FocusHistoryFilters {
  user_id: number | null;
  start_date: string;
  end_date: string;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function focusFilterError(filters: FocusHistoryFilters): string {
  if ((filters.start_date && !validDate(filters.start_date)) || (filters.end_date && !validDate(filters.end_date))) {
    return 'Informe datas válidas.';
  }
  if (filters.start_date && filters.end_date && filters.start_date > filters.end_date) {
    return 'A data inicial não pode ser posterior à data final.';
  }
  return '';
}

export function filterFocusHistory(history: FocusHistoryEntry[], filters: FocusHistoryFilters): FocusHistoryEntry[] {
  if (focusFilterError(filters)) return [];
  const start = filters.start_date ? Date.parse(`${filters.start_date}T00:00:00-03:00`) : -Infinity;
  const end = filters.end_date ? Date.parse(`${filters.end_date}T00:00:00-03:00`) + 86400000 : Infinity;
  return history.filter(session => {
    const timestamp = Date.parse(session.logged_date);
    return (filters.user_id === null || session.user_id === filters.user_id) && timestamp >= start && timestamp < end;
  });
}
