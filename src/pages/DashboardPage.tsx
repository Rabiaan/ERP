import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  Clock3,
  Plane,
  Plus,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createDashboardModel } from '../data/dashboardModel';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';

const DAY_LABELS: Record<string, string> = {
  Mo: 'Mon',
  Tu: 'Tue',
  We: 'Wed',
  Th: 'Thu',
  Fr: 'Fri',
  Sa: 'Sat',
  Su: 'Sun',
};

function initial(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function DashboardPage(): React.ReactElement {
  const {
    role,
    employees,
    attendanceRecords,
    leaveRequests,
    jobOpenings,
    payRuns,
    auditLogs,
    setIsAddEmployeeDrawerOpen,
  } = useApp();

  const model = useMemo(
    () =>
      createDashboardModel({
        employees,
        attendanceRecords,
        leaveRequests,
        jobOpenings,
        payRuns,
        auditLogs,
      }),
    [employees, attendanceRecords, leaveRequests, jobOpenings, payRuns, auditLogs]
  );

  const isManager = role === 'Super Admin' || role === 'HR Admin' || role === 'Manager';
  const dateLabel = model.today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const maxAttendance = Math.max(...model.attendanceDays.map((day) => day.rate), 100);
  const maxTrend = Math.max(...model.headcountTrend.map((point) => point.count), 1);
  const leaveGradient = model.leaveDistribution
    .map((item, index) => {
      const start = model.leaveDistribution
        .slice(0, index)
        .reduce((sum, current) => sum + current.sharePercent, 0);
      return `${item.color} ${start}% ${start + item.sharePercent}%`;
    })
    .join(', ');

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[24px] border border-[#ECEBF3] bg-white/75 px-5 py-4 shadow-[0_1px_2px_rgba(30,25,80,0.03),0_8px_24px_rgba(30,25,80,0.03)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-[#6B6A85]">
            <Sparkles className="h-3.5 w-3.5 text-[#8D86EA]" />
            {dateLabel}
          </div>
          <h1 className="mt-1 truncate font-display text-[22px] font-semibold tracking-tight text-[#0E0E12] sm:text-[26px]">
            Good morning, Alex
          </h1>
          <p className="mt-0.5 truncate text-xs text-[#6B6A85]">
            Here's what's happening across your people workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#ECEBF3] bg-[#F8F7FC] px-3 py-1.5 text-[11px] text-[#6B6A85]">
            {role}
          </span>
          {isManager && (
            <button
              type="button"
              onClick={() => setIsAddEmployeeDrawerOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#5F57C4] px-3.5 text-[11px] font-medium text-white shadow-[0_8px_18px_rgba(95,87,196,0.22)] transition-colors hover:bg-[#4B44A3]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add employee
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total headcount"
          value={model.totalHeadcount}
          icon={<Users className="h-4 w-4" />}
          subtext={`${model.onLeaveToday} on leave today`}
          delta={{
            value: model.headcountDeltaLabel,
            trend: model.netChangeLabel.startsWith('Net +') ? 'up' : 'down',
            label: 'vs last year',
          }}
        />
        <KpiCard
          label="Present today"
          value={model.presentLabel}
          icon={<CalendarClock className="h-4 w-4" />}
          subtext={model.checkedAtLabel}
          delta={{ value: `${model.presentPercent}%`, trend: 'up', label: 'attendance' }}
        />
        <KpiCard
          label="Open roles"
          value={model.openRolesChip.value}
          icon={<Sparkles className="h-4 w-4" />}
          subtext={model.openRolesChip.label}
          delta={{ value: `${model.openRolesCount}`, trend: 'neutral', label: 'active reqs' }}
        />
        <KpiCard
          label="Payroll"
          value={model.payrollValue}
          icon={<Wallet className="h-4 w-4" />}
          subtext={model.payRunMonth}
          delta={{ value: model.payrollDeltaLabel, trend: 'up', label: 'vs last month' }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="min-w-0 p-5 xl:col-span-7" frosted>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">
                Attendance this week
              </h2>
              <p className="mt-0.5 text-[11px] text-[#6B6A85]">
                {model.todayAttendanceLegend} · {model.checkedAtLabel}
              </p>
            </div>
            <Badge variant="purple" size="sm">
              {model.presentSubtitle}
            </Badge>
          </div>

          <div className="mt-6 flex h-[150px] items-end justify-between gap-2 sm:gap-3">
            {model.attendanceDays.map((day) => {
              const height = Math.max((day.rate / maxAttendance) * 100, day.status === 'off' ? 4 : 8);
              return (
                <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="relative flex h-[120px] w-full items-end justify-center">
                    <div
                      title={day.label}
                      className={[
                        'w-full max-w-[42px] rounded-t-xl transition-all',
                        day.status === 'today'
                          ? 'bg-[#5F57C4]'
                          : day.status === 'off'
                            ? 'bg-[#EFEDF7]'
                            : day.status === 'future'
                              ? 'bg-[#E4E0FB]'
                              : 'bg-[#BDB1FB]',
                      ].join(' ')}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[#6B6A85]">{DAY_LABELS[day.day] ?? day.day}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 border-t border-[#ECEBF3] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-medium text-[#0E0E12]">Department mix</h3>
              <Link to="/employees" className="text-[11px] text-[#5F57C4] hover:underline">
                View directory
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {model.departmentBreakdown.slice(0, 6).map((item) => (
                <div key={item.name} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#6B6A85]">
                    <span className="truncate">{item.name}</span>
                    <span className="tabular-nums">{item.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F1EFF8]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.sharePercent}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-5 xl:col-span-5" frosted>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">
                Needs your attention
              </h2>
              <p className="mt-0.5 text-[11px] text-[#6B6A85]">
                {model.pendingApprovals.length} leave requests pending
              </p>
            </div>
            {model.pendingApprovals.length > 0 && (
              <Badge variant="warning" size="sm" icon={<CircleAlert className="h-3 w-3" />}>
                Action needed
              </Badge>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {model.pendingApprovals.slice(0, 4).map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 rounded-2xl border border-[#ECEBF3] bg-[#FBFBFE] p-3"
              >
                <Avatar name={request.employee_name} src={request.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-[#0E0E12]">
                    {request.employee_name}
                  </div>
                  <div className="truncate text-[10px] text-[#6B6A85]">
                    {request.leave_type_name} · {request.days}d
                  </div>
                </div>
                <Link
                  to="/leave"
                  className="shrink-0 rounded-full border border-[#D5D1F8] px-2.5 py-1 text-[10px] font-medium text-[#5F57C4] hover:bg-[#F0EEFC]"
                >
                  Review
                </Link>
              </div>
            ))}
            {model.pendingApprovals.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#ECEBF3] p-6 text-center">
                <CheckCheck className="mx-auto h-5 w-5 text-[#2FA36B]" />
                <p className="mt-2 text-[11px] text-[#6B6A85]">All caught up</p>
              </div>
            )}
          </div>

          <Link
            to="/leave"
            className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-[#5F57C4] hover:underline"
          >
            Open leave management
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="min-w-0 p-5" frosted>
          <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">Leave distribution</h2>
          <p className="mt-0.5 text-[11px] text-[#6B6A85]">{model.leaveCenterLabel}</p>
          <div className="mt-5 flex items-center gap-6">
            <div
              className="h-32 w-32 shrink-0 rounded-full"
              style={{ background: `conic-gradient(${leaveGradient})` }}
              role="img"
              aria-label={model.leaveCenterLabel}
            >
              <div className="grid h-full w-full place-items-center rounded-full bg-white">
                <span className="text-xs font-medium text-[#0E0E12]">{model.leaveTotalDays}d</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {model.leaveDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-[10px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[#6B6A85]">{item.name}</span>
                  <span className="tabular-nums text-[#0E0E12]">{item.sharePercent}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-5" frosted>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">Headcount trend</h2>
              <p className="mt-0.5 text-[11px] text-[#6B6A85]">{model.trendRange}</p>
            </div>
            <Badge variant="purple" size="sm">
              {model.headcountDeltaLabel}
            </Badge>
          </div>
          <div className="mt-5 flex h-[120px] items-end gap-1.5">
            {model.headcountTrend.map((point) => (
              <div
                key={point.month}
                title={`${point.month}: ${point.count}`}
                className="min-w-0 flex-1 rounded-t-md bg-[#C7C0F8] transition-colors hover:bg-[#5F57C4]"
                style={{ height: `${(point.count / maxTrend) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-[#6B6A85]">
            <span>{model.headcountTrend[0]?.month}</span>
            <span>{model.headcountTrend[model.headcountTrend.length - 1]?.month}</span>
          </div>
          <p className="mt-3 text-[10px] text-[#6B6A85]">{model.netChangeLabel}</p>
        </Card>

        <Card className="min-w-0 p-5 lg:col-span-2 xl:col-span-1" frosted>
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-[#8D86EA]" />
            <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">Milestones</h2>
          </div>
          <div className="mt-4 space-y-3">
            {model.milestones.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#F0EEFC] text-[10px] font-semibold text-[#5F57C4]">
                  {initial(item.employee_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-[#0E0E12]">
                    {item.milestone ?? item.type}
                  </div>
                  <div className="truncate text-[10px] text-[#6B6A85]">
                    {item.employee_name} · {item.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 p-5" frosted>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">Open roles</h2>
            <Link to="/recruitment" className="text-[11px] text-[#5F57C4] hover:underline">
              View pipeline
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {model.openRoles.slice(0, 4).map((roleItem) => (
              <div
                key={roleItem.id}
                className="flex items-center gap-3 rounded-2xl border border-[#ECEBF3] bg-[#FBFBFE] p-3"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#F0EEFC] text-[10px] font-semibold text-[#5F57C4]">
                  {initial(roleItem.title)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-[#0E0E12]">
                    {roleItem.title}
                  </div>
                  <div className="truncate text-[10px] text-[#6B6A85]">
                    {roleItem.department_name} · {roleItem.location_name}
                  </div>
                </div>
                <Badge variant={roleItem.status === 'Open' ? 'open' : 'purple'} size="sm">
                  {roleItem.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="min-w-0 p-5" frosted>
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-[#8D86EA]" />
            <h2 className="font-display text-[15px] font-medium text-[#0E0E12]">Recent activity</h2>
          </div>
          <div className="mt-4 space-y-3">
            {model.recentActivity.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F0EEFC] text-[9px] font-semibold text-[#5F57C4]">
                  {initial(item.actor_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-[#0E0E12]">
                    {item.actor_name} {item.action}
                  </div>
                  <div className="truncate text-[10px] text-[#6B6A85]">{item.details?.after}</div>
                  <div className="mt-0.5 text-[9px] text-[#6B6A85]" title={item.timeTitle}>
                    {item.timeLabel}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default DashboardPage;
