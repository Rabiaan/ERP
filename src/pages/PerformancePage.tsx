import React, { useState } from 'react';
import {
  Target,
  Plus,
  CheckCircle2,
  Clock,
  Award,
  TrendingUp,
  AlertTriangle,
  Sliders,
  Calendar,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select, Textarea, FormField } from '../components/ui/FormField';
import { Goal } from '../types';
import { mockReviewCycles } from '../data/mockData';

export const PerformancePage: React.FC = () => {
  const { goals, employees, updateGoalProgress, addGoal } = useApp();

  const [activeTab, setActiveTab] = useState<'goals' | 'reviews'>('goals');
  const [selectedGoalForProgress, setSelectedGoalForProgress] = useState<Goal | null>(null);
  const [newProgressVal, setNewProgressVal] = useState(50);

  // Create Goal Drawer
  const [isGoalDrawerOpen, setIsGoalDrawerOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    employee_id: employees[0]?.id || 'emp-003',
    title: '',
    description: '',
    category: 'Strategic' as const,
    due_date: '2026-12-31',
    progress: 0,
    status: 'On track' as const,
  });

  const handleUpdateProgressSubmit = () => {
    if (!selectedGoalForProgress) return;
    updateGoalProgress(selectedGoalForProgress.id, newProgressVal);
    setSelectedGoalForProgress(null);
  };

  const handleCreateGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalForm.title.trim()) return;
    const emp = employees.find((e) => e.id === goalForm.employee_id);
    addGoal({
      ...goalForm,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : 'Team Member',
      department: emp?.department_name || 'Engineering',
    });
    setIsGoalDrawerOpen(false);
    setGoalForm({
      employee_id: employees[0]?.id || 'emp-003',
      title: '',
      description: '',
      category: 'Strategic',
      due_date: '2026-12-31',
      progress: 0,
      status: 'On track',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Performance & OKRs</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Strategic company objectives, individual milestones, and semi-annual appraisal cycles.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsGoalDrawerOpen(true)}
          >
            Create Goal
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'goals', label: 'Company & Team OKRs', count: goals.length },
          { id: 'reviews', label: 'Review Cycles & Appraisals', count: mockReviewCycles.length },
        ]}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as any)}
      />

      {/* Tab 1: Goals */}
      {activeTab === 'goals' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((g) => (
            <Card key={g.id} className="p-5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6D28D9] bg-[#F7F4FF] px-2 py-0.5 rounded border border-[#E0D6FD]">
                      {g.category}
                    </span>
                    <h3 className="text-sm font-bold text-[#1F1A2E] mt-1.5">{g.title}</h3>
                  </div>
                  <Badge variant={g.status} size="sm" />
                </div>

                <p className="text-xs text-[#6B647F] leading-relaxed">{g.description}</p>

                {/* Progress bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#6B647F]">Milestone Progress</span>
                    <span className="font-bold text-[#1F1A2E] tabular-nums">{g.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#F7F5FB] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${g.progress}%` }}
                      className="h-full bg-[#6D28D9] rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[#ECE8F4] flex items-center justify-between text-xs text-[#6B647F]">
                <div>
                  <span className="text-[#928BA6]">Owner: </span>
                  <strong className="text-[#1F1A2E]">{g.employee_name}</strong> ({g.department})
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Sliders className="w-3.5 h-3.5" />}
                  className="h-7 text-xs"
                  onClick={() => {
                    setSelectedGoalForProgress(g);
                    setNewProgressVal(g.progress);
                  }}
                >
                  Adjust %
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab 2: Review Cycles */}
      {activeTab === 'reviews' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockReviewCycles.map((rev) => {
              const percent = Math.round((rev.completed_count / rev.participants_count) * 100);
              return (
                <Card key={rev.id} className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#1F1A2E]">{rev.name}</h3>
                      <div className="text-xs text-[#6B647F] mt-0.5">{rev.period}</div>
                    </div>
                    <Badge variant={rev.status === 'Active' ? 'active' : 'draft'} size="sm">
                      {rev.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B647F]">Completion Rate</span>
                      <span className="font-bold tabular-nums">
                        {rev.completed_count} / {rev.participants_count} ({percent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#F7F5FB] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${percent}%` }}
                        className="h-full bg-[#15803D] rounded-full"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#ECE8F4] flex items-center justify-between text-xs text-[#6B647F]">
                    <span>Due Date: {rev.due_date}</span>
                    <Button variant="link" size="sm">
                      Open Calibration Matrix →
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Adjust Progress Modal */}
      <Modal
        isOpen={!!selectedGoalForProgress}
        onClose={() => setSelectedGoalForProgress(null)}
        title="Update Key Result Progress"
        description={selectedGoalForProgress?.title || ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedGoalForProgress(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateProgressSubmit}>
              Save Progress
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="text-center py-2">
            <span className="text-3xl font-bold text-[#6D28D9] tabular-nums">
              {newProgressVal}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={newProgressVal}
            onChange={(e) => setNewProgressVal(Number(e.target.value))}
            className="w-full accent-[#6D28D9] cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-[#928BA6]">
            <span>0% (Not Started)</span>
            <span>50% (In Progress)</span>
            <span>100% (Completed)</span>
          </div>
        </div>
      </Modal>

      {/* Create Goal Drawer */}
      <Drawer
        isOpen={isGoalDrawerOpen}
        onClose={() => setIsGoalDrawerOpen(false)}
        title="Create New Strategic Goal"
        description="Register a key departmental outcome or individual growth objective."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsGoalDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateGoalSubmit}>
              Create Goal
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateGoalSubmit} className="space-y-4">
          <FormField label="Assignee / Goal Owner" required>
            <Select
              value={goalForm.employee_id}
              onChange={(e) => setGoalForm({ ...goalForm, employee_id: e.target.value })}
            >
              {employees.slice(0, 20).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.title})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Goal Title" required>
            <Input
              value={goalForm.title}
              onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
              placeholder="e.g. Expand Multi-Region Cloud Deployment"
            />
          </FormField>

          <FormField label="Category">
            <Select
              value={goalForm.category}
              onChange={(e) => setGoalForm({ ...goalForm, category: e.target.value as any })}
            >
              <option value="Strategic">Strategic</option>
              <option value="Operational">Operational</option>
              <option value="Leadership">Leadership</option>
              <option value="Individual Growth">Individual Growth</option>
            </Select>
          </FormField>

          <FormField label="Description">
            <Textarea
              value={goalForm.description}
              onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
              placeholder="Key quantitative results and expectations..."
            />
          </FormField>

          <FormField label="Target Completion Date">
            <Input
              type="date"
              value={goalForm.due_date}
              onChange={(e) => setGoalForm({ ...goalForm, due_date: e.target.value })}
            />
          </FormField>
        </form>
      </Drawer>
    </div>
  );
};
