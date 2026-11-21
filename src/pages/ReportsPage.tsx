import React, { useState } from 'react';
import {
  BarChart3,
  Users,
  Clock,
  CreditCard,
  Briefcase,
  TrendingDown,
  CalendarCheck,
  Download,
  Calendar,
  Share2,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/FormField';
import {
  mockHeadcountTrend,
  mockAttendanceLast7Days,
  mockDepartmentDistribution,
} from '../data/mockData';

export const ReportsPage: React.FC = () => {
  const { addToast } = useApp();

  const [activeReportId, setActiveReportId] = useState<string>('headcount');
  const [reportPeriod, setReportPeriod] = useState('2026-ytd');

  const reportCards = [
    {
      id: 'headcount',
      title: 'Headcount & Retention Report',
      description: 'Employee net growth, department ratios, and 12-month tenure trends.',
      icon: <Users className="w-5 h-5 text-[#6D28D9]" />,
      lastRun: 'Today, 06:15 AM',
    },
    {
      id: 'attendance',
      title: 'Studio Attendance & Punctuality',
      description: 'Biometric daily logs, punctuality rates, and remote work distribution.',
      icon: <Clock className="w-5 h-5 text-[#34D399]" />,
      lastRun: 'Yesterday, 07:00 PM',
    },
    {
      id: 'payroll',
      title: 'Payroll & Compensation Run Audit',
      description: 'Gross salary liability, FBR tax withholdings, and bonus allocations.',
      icon: <CreditCard className="w-5 h-5 text-[#38BDF8]" />,
      lastRun: 'Oct 25, 2026',
    },
    {
      id: 'recruitment',
      title: 'Talent Acquisition & Funnel',
      description: 'Candidate velocity across stages, conversion ratios, and source ratings.',
      icon: <Briefcase className="w-5 h-5 text-[#FBBF24]" />,
      lastRun: 'Oct 22, 2026',
    },
    {
      id: 'leave',
      title: 'Leave Liability & Accruals',
      description: 'Unutilized annual leave balances, carryovers, and liability forecast.',
      icon: <CalendarCheck className="w-5 h-5 text-[#F472B6]" />,
      lastRun: 'Oct 20, 2026',
    },
    {
      id: 'attrition',
      title: 'Voluntary & Involuntary Attrition',
      description: 'Sub-4% annualized turnover index benchmarked against tech sector.',
      icon: <TrendingDown className="w-5 h-5 text-[#15803D]" />,
      lastRun: 'Oct 15, 2026',
    },
  ];

  const handleExport = (format: 'CSV' | 'PDF') => {
    addToast('success', `${format} Generated`, `Report successfully prepared and sent to download.`);
  };

  const handleSchedule = () => {
    addToast('info', 'Report Scheduled', 'Weekly Monday digest scheduled for leadership.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Insights & Analytics</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Executive workforce intelligence, payroll audits, and HR business intelligence.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={handleSchedule}>
            Schedule Digest
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={() => handleExport('PDF')}
          >
            Export Dossier
          </Button>
        </div>
      </div>

      {/* Gallery of Report Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCards.map((rep) => {
          const isSelected = activeReportId === rep.id;
          return (
            <Card
              key={rep.id}
              hoverable
              onClick={() => setActiveReportId(rep.id)}
              className={`p-5 flex flex-col justify-between ${
                isSelected ? 'border-[#8B5CF6] ring-2 ring-[#8B5CF6]/20 bg-[#F7F4FF]/30' : ''
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-[12px] bg-[#F7F4FF] border border-[#E0D6FD] flex items-center justify-center">
                    {rep.icon}
                  </div>
                  {isSelected && (
                    <Badge variant="purple" size="sm">
                      Active View
                    </Badge>
                  )}
                </div>
                <h3 className="text-sm font-bold text-[#1F1A2E]">{rep.title}</h3>
                <p className="text-xs text-[#6B647F] leading-relaxed">{rep.description}</p>
              </div>

              <div className="pt-3 mt-3 border-t border-[#ECE8F4] flex items-center justify-between text-[11px] text-[#928BA6]">
                <span>Last compiled: {rep.lastRun}</span>
                <span className="text-[#6D28D9] font-medium">Explore →</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Active Report Deep-Dive View */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#ECE8F4]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6D28D9]">
              Report Detail
            </span>
            <h2 className="text-lg font-bold text-[#1F1A2E]">
              {reportCards.find((r) => r.id === activeReportId)?.title}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-40">
              <Select
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value)}
                className="h-8.5 text-xs"
              >
                <option value="2026-ytd">Year to Date (2026)</option>
                <option value="2026-q3">Q3 2026</option>
                <option value="2026-q2">Q2 2026</option>
              </Select>
            </div>
            <Button variant="secondary" size="sm" onClick={() => handleExport('CSV')}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport('PDF')}>
              PDF
            </Button>
          </div>
        </div>

        {/* Visual Chart */}
        <div className="py-6">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {activeReportId === 'attendance' ? (
                <BarChart data={mockAttendanceLast7Days}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECE8F4" />
                  <XAxis dataKey="day" tick={{ fill: '#6B647F', fontSize: 11 }} />
                  <YAxis domain={[80, 100]} tick={{ fill: '#6B647F', fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="rate" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={mockHeadcountTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECE8F4" />
                  <XAxis dataKey="month" tick={{ fill: '#6B647F', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6B647F', fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#6D28D9"
                    strokeWidth={3}
                    dot={{ fill: '#6D28D9', r: 4 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdown Data Table */}
        <div className="pt-4 border-t border-[#ECE8F4]">
          <h4 className="text-xs font-bold text-[#1F1A2E] mb-3">Functional Breakdown Matrix</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F7F4FF] border-b border-[#ECE8F4] text-[#6B647F]">
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Headcount</th>
                  <th className="p-3 text-right">Attendance Rate</th>
                  <th className="p-3 text-right">Monthly Payroll</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECE8F4]">
                {mockDepartmentDistribution.map((dept) => (
                  <tr key={dept.name} className="hover:bg-[#FCFBFF]">
                    <td className="p-3 font-semibold text-[#1F1A2E]">{dept.name}</td>
                    <td className="p-3 text-right tabular-nums">{dept.count} members</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-[#15803D]">
                      {94 + (dept.count % 4)}%
                    </td>
                    <td className="p-3 text-right tabular-nums font-mono">
                      PKR {(dept.count * 340000).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant="active" size="sm">
                        Optimized
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
};
