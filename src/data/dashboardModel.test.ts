import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardModel, roundPercent } from './dashboardModel';
import { toDateKey } from './today';
import {
  mockAttendanceRecords,
  mockAuditLogs,
  mockEmployees,
  mockJobOpenings,
  mockLeaveByTypeData,
  mockPayRuns,
} from './mockData';

const today = new Date(2026, 10, 20, 9, 30);
const todayKey = toDateKey(today);

function makeModel() {
  return createDashboardModel({
    employees: mockEmployees,
    attendanceRecords: mockAttendanceRecords.map((record) => ({ ...record, date: todayKey })),
    leaveRequests: [],
    jobOpenings: mockJobOpenings,
    payRuns: mockPayRuns,
    auditLogs: mockAuditLogs,
    today,
  });
}

function assertPercent(displayed: string, value: number, total: number) {
  assert.equal(displayed, `${roundPercent(value, total)}%`);
}

test('present today percentages agree with the computed data', () => {
  const model = makeModel();
  const todayBar = model.attendanceDays.find((day) => day.status === 'today');

  assert.equal(model.presentToday, 16);
  assert.equal(model.totalHeadcount, 47);
  assert.equal(model.presentLabel, '16/47');
  assertPercent(model.presentSubtitle.replace(' present', ''), model.presentToday, model.totalHeadcount);
  assert.equal(todayBar?.rate, model.presentPercent);
  assert.equal(todayBar?.count, model.presentLabel);
  assert.equal(model.todayAttendanceLegend, `Today (${model.presentPercent}%)`);
});

test('leave arcs, legend, and center value share one source', () => {
  const model = makeModel();
  const totalDays = mockLeaveByTypeData.reduce((sum, item) => sum + item.value, 0);

  assert.equal(model.leaveTotalDays, totalDays);
  assert.equal(model.leaveCenterLabel, `${totalDays} days taken`);
  for (const item of model.leaveDistribution) {
    assert.equal(item.value, item.sharePercent);
    assertPercent(`${item.sharePercent}%`, item.days, totalDays);
  }
  assert.equal(
    model.leaveDistribution.reduce((sum, item) => sum + item.sharePercent, 0),
    100,
  );
});

test('department shares agree with active headcount', () => {
  const model = makeModel();

  for (const department of model.departmentBreakdown) {
    assertPercent(`${department.sharePercent}%`, department.count, model.totalHeadcount);
  }
  assert.equal(
    model.departmentBreakdown.reduce((sum, department) => sum + department.count, 0),
    model.totalHeadcount,
  );
});

test('open roles value and chip use one definition', () => {
  const model = makeModel();

  assert.equal(model.openRolesCount, model.openRoles.length);
  assert.equal(model.openRolesChip.value, `${model.openRoles.length} open`);
  assert.equal(model.openRolesChip.label, 'across 3 depts');
});

test('displayed dates and ranges derive from the same today', () => {
  const model = makeModel();
  const todayCell = model.weekDays.find((day) => day.isToday);

  assert.equal(model.todayKey, '2026-11-20');
  assert.equal(todayCell?.key, model.todayKey);
  assert.match(model.milestones[0].date, /^Tomorrow, 21 Nov$/);
  assert.equal(model.headcountTrend.at(-1)?.month, 'Nov 26');
  assert.equal(model.currentPayRun.period_label, 'November 2026');
  assert.equal(model.payRunMonth, 'November 2026');
  const payRunActivity = model.recentActivity[1];
  assert.ok(payRunActivity);
  assert.ok(payRunActivity.details);
  assert.match(payRunActivity.details.after as string, /^November 2026 \(48 employees/);
  assert.equal(model.recentActivity[0].timeLabel, '2h ago');
});
