import assert from 'node:assert/strict';
import { filterFocusHistory, focusFilterError, FocusHistoryFilters } from '../src/app/focus-history-filter';
import { FocusHistoryEntry } from '../src/app/models';

const history: FocusHistoryEntry[] = [
  { id: 1, user_id: 1, user_name: 'Ana', duration_minutes: 10, logged_date: '2026-10-14T02:59:59.999Z' },
  { id: 2, user_id: 1, user_name: 'Ana', duration_minutes: 20, logged_date: '2026-10-14T03:00:00.000Z' },
  { id: 3, user_id: 2, user_name: 'Bruno', duration_minutes: 30, logged_date: '2026-10-15T02:59:59.999Z' },
  { id: 4, user_id: 1, user_name: 'Ana', duration_minutes: 40, logged_date: '2026-10-15T03:00:00.000Z' },
];
const empty: FocusHistoryFilters = { user_id: null, start_date: '', end_date: '' };
const day = { ...empty, start_date: '2026-10-14', end_date: '2026-10-14' };
const ids = (filters: FocusHistoryFilters) => filterFocusHistory(history, filters).map(session => session.id);

assert.deepEqual(ids(empty), [1, 2, 3, 4]);
assert.deepEqual(ids(day), [2, 3]);
assert.deepEqual(ids({ ...day, user_id: 1 }), [2]);
assert.deepEqual(ids({ ...empty, user_id: 1 }), [1, 2, 4]);
assert.deepEqual(ids({ ...empty, start_date: '2026-10-14' }), [2, 3, 4]);
assert.deepEqual(ids({ ...empty, end_date: '2026-10-14' }), [1, 2, 3]);
assert.deepEqual(ids({ ...day, user_id: 99 }), []);
assert.deepEqual(ids({ ...day, start_date: '2026-10-15' }), []);
assert.ok(focusFilterError({ ...day, start_date: '2026-10-15' }));
assert.ok(focusFilterError({ ...empty, start_date: '2026-02-30' }));
assert.ok(focusFilterError({ ...empty, start_date: 'data inválida' }));
assert.equal(filterFocusHistory(history, day).reduce((total, session) => total + session.duration_minutes, 0), 50);
assert.equal(history.length, 4);
console.log('PASS: usuário, período inclusivo em UTC−3, limites abertos, datas inválidas, resultado vazio e soma filtrada.');
