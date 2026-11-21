import type {
  AttendanceRecord,
  AuditLogEntry,
  Employee,
  JobOpening,
  LeaveRequest,
  PayRun,
} from '../types';
import {
  mockAttendanceLast7Days,
  mockDepartmentDistribution,
  mockHeadcountTrend,
  mockLeaveByTypeData,
  mockPayRuns,
  mockUpcomingEvents,
} from './mockData';
import { TODAY, toDateKey } from './today';

export interface DashboardInputs {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  jobOpenings: JobOpening[];
  payRuns: PayRun[];
  auditLogs: AuditLogEntry[];
  today?: Date;
}

export function roundPercent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dayDifference(a: Date, b: Date): number {
  const first = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const second = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((first - second) / 86_400_000);
}

function formatMonthShortYear(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(date);
}

function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function formatWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
}

function formatFullTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${toDateKey(date)} ${hours}:${minutes}`;
}

function formatEventDate(date: Date, today: Date): string {
  const offset = dayDifference(date, today);
  if (offset === 0) return `Today, ${formatDayMonth(date)}`;
  if (offset === 1) return `Tomorrow, ${formatDayMonth(date)}`;
  return `${formatWeekdayShort(date)}, ${formatDayMonth(date)}`;
}

function formatRelativeTime(minutesAgo: number): string {
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  if (minutesAgo < 24 * 60) return `${Math.round(minutesAgo / 60)}h ago`;
  return `${Math.round(minutesAgo / (24 * 60))}d ago`;
}

function signedNumber(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function createDashboardModel(inputs: DashboardInputs) {
  const reference = inputs.today ?? TODAY;
  const today = startOfDay(reference);
  const todayKey = toDateKey(today);
  const todayWeekdayIndex = (today.getDay() + 6) % 7;
  const weekStart = addDays(today, -todayWeekdayIndex);

  const activeEmployees = inputs.employees.filter((employee) => employee.status !== 'Exited');
  const totalHeadcount = activeEmployees.length;
  const onLeaveToday = activeEmployees.filter((employee) => employee.status === 'On leave').length;
  const exitedEmployees = inputs.employees.filter((employee) => employee.status === 'Exited').length;
  const attritionPercent = roundPercent(exitedEmployees, inputs.employees.length);
  const checkedAtLabel = `Checked at ${String(reference.getHours()).padStart(2, '0')}:${String(
    reference.getMinutes(),
  ).padStart(2, '0')}`;

  const todayAttendance = inputs.attendanceRecords.filter((record) => record.date === todayKey);
  const presentToday = todayAttendance.filter(
    (record) => record.status === 'Present' || record.status === 'Remote',
  ).length;
  const presentPercent = roundPercent(presentToday, totalHeadcount);
  const presentLabel = `${presentToday}/${totalHeadcount}`;

  const openRoles = inputs.jobOpenings.filter(
    (role) => role.status === 'Open' || role.status === 'Interviewing',
  );
  const openRoleDepartments = new Set(openRoles.map((role) => role.department_name)).size;
  const openRolesChip = {
    value: `${openRoles.length} open`,
    label: `across ${openRoleDepartments} ${openRoleDepartments === 1 ? 'dept' : 'depts'}`,
  };

  const pendingApprovals = inputs.leaveRequests.filter((request) => request.status === 'Pending');

  const weekdayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const weekDays = weekdayNames.map((day, index) => {
    const date = addDays(weekStart, index);
    return {
      key: toDateKey(date),
      day,
      date: date.getDate(),
      isToday: index === todayWeekdayIndex,
    };
  });

  const attendanceDays = weekDays.map((day, index) => {
    const isToday = index === todayWeekdayIndex;
    const isWeekend = index > 4;
    if (isToday) {
      return {
        day: day.day,
        rate: presentPercent,
        status: 'today' as const,
        count: presentLabel,
        label: `Today: ${presentLabel}`,
      };
    }
    if (isWeekend) {
      return {
        day: day.day,
        rate: 0,
        status: 'off' as const,
        count: undefined,
        label: 'Weekend',
      };
    }
    if (index < todayWeekdayIndex) {
      const historic = mockAttendanceLast7Days[index % mockAttendanceLast7Days.length];
      const historicCount = Math.round((historic.rate / 100) * totalHeadcount);
      return {
        day: day.day,
        rate: historic.rate,
        status: 'past' as const,
        count: `${historicCount}/${totalHeadcount}`,
        label: `${day.day}: ${historicCount}/${totalHeadcount}`,
      };
    }
    return {
      day: day.day,
      rate: 92,
      status: 'future' as const,
      count: undefined,
      label: 'Projected',
    };
  });

  const leaveTotalDays = mockLeaveByTypeData.reduce((sum, item) => sum + item.value, 0);
  const leaveDistribution = mockLeaveByTypeData.map((item) => {
    const sharePercent = roundPercent(item.value, leaveTotalDays);
    return {
      name: item.name,
      color: item.color,
      days: item.value,
      sharePercent,
      value: sharePercent,
    };
  });

  const departmentColors = new Map(mockDepartmentDistribution.map((item) => [item.name, item.color]));
  const departmentCounts = new Map<string, number>();
  activeEmployees.forEach((employee) => {
    departmentCounts.set(
      employee.department_name,
      (departmentCounts.get(employee.department_name) ?? 0) + 1,
    );
  });
  const departmentBreakdown = Array.from(departmentCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      color: departmentColors.get(name) ?? '#8B5CF6',
      sharePercent: roundPercent(count, totalHeadcount),
    }))
    .sort((a, b) => b.count - a.count);

  const firstMonth = addMonths(today, -(mockHeadcountTrend.length - 1));
  const headcountTrend = mockHeadcountTrend.map((point, index) => ({
    ...point,
    month: formatMonthShortYear(addMonths(firstMonth, index)),
  }));
  const trendRange = `${headcountTrend[0]?.month ?? ''} to ${
    headcountTrend[headcountTrend.length - 1]?.month ?? ''
  }`;
  const netChange =
    (headcountTrend[headcountTrend.length - 1]?.count ?? 0) - (headcountTrend[0]?.count ?? 0);
  const netChangeLabel = `Net ${signedNumber(netChange)} over 12 months`;
  const headcountBaseline = headcountTrend[0]?.count ?? 0;
  const headcountDeltaLabel = `${signedNumber(roundPercent(netChange, headcountBaseline))}%`;

  const payRunSource = inputs.payRuns[0] ?? mockPayRuns[0];
  const currentPayRun = {
    ...payRunSource,
    period_label: formatMonthYear(today),
    period_start: toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
    period_end: toDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
  const previousPayRun = inputs.payRuns[1] ?? mockPayRuns[1] ?? currentPayRun;
  const payrollDeltaPercent = roundPercent(
    currentPayRun.gross_total - previousPayRun.gross_total,
    previousPayRun.gross_total,
  );
  const payrollDeltaLabel = `${signedNumber(payrollDeltaPercent)}%`;
  const payrollValue = `Rs ${(currentPayRun.gross_total / 1_000_000).toFixed(2)}M`;
  const payrollSubtext = `${currentPayRun.period_label} gross: ${currentPayRun.gross_total.toLocaleString(
    'en-US',
  )}`;

  const milestoneOffsets = [1, 3, 5, 8];
  const milestones = mockUpcomingEvents.slice(0, 4).map((event, index) => {
    const date = addDays(today, milestoneOffsets[index] ?? index + 1);
    return {
      ...event,
      date: formatEventDate(date, today),
      dateKey: toDateKey(date),
    };
  });

  const activityOffsetsMinutes = [120, 300, 1560, 3000];
  const recentActivity = inputs.auditLogs.slice(0, 4).map((log, index) => {
    const minutesAgo = activityOffsetsMinutes[index] ?? (index + 1) * 1440;
    const timestamp = formatFullTimestamp(new Date(today.getTime() - minutesAgo * 60_000));
    const details =
      log.entity === 'PayRun'
        ? {
            ...log.details,
            after: `${currentPayRun.period_label} (${inputs.employees.length} employees, Gross ${payrollValue})`,
          }
        : log.details;
    return {
      ...log,
      details,
      timestamp,
      timeLabel: formatRelativeTime(minutesAgo),
      timeTitle: timestamp,
    };
  });

  return {
    today,
    todayKey,
    todayWeekdayIndex,
    weekDays,
    selectedDayIndex: todayWeekdayIndex,
    attendanceDays,
    totalHeadcount,
    onLeaveToday,
    exitedEmployees,
    attritionPercent,
    attritionValue: `${attritionPercent}%`,
    checkedAtLabel,
    presentToday,
    presentPercent,
    presentLabel,
    presentSubtitle: `${presentPercent}% present`,
    todayAttendanceLegend: `Today (${presentPercent}%)`,
    openRoles,
    openRolesCount: openRoles.length,
    openRolesChip,
    pendingApprovals,
    leaveDistribution,
    leaveTotalDays,
    leaveCenterLabel: `${leaveTotalDays} days taken`,
    departmentBreakdown,
    headcountTrend,
    trendRange,
    netChangeLabel,
    headcountDeltaLabel,
    currentPayRun,
    payRunMonth: currentPayRun.period_label,
    payrollValue,
    payrollSubtext,
    payrollDeltaLabel,
    milestones,
    recentActivity,
  };
}

export type DashboardModel = ReturnType<typeof createDashboardModel>;
