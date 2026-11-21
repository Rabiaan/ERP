import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus,
  CheckCircle2,
  Clock,
  Calendar,
  Laptop,
  FileCheck,
  Award,
  ChevronRight,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { mockOnboardingHires } from '../data/mockData';
import { OnboardingHire } from '../types';
import { formatDate } from '../lib/utils';

export const OnboardingPage: React.FC = () => {
  const { addToast } = useApp();
  const navigate = useNavigate();

  const [hires, setHires] = useState<OnboardingHire[]>(mockOnboardingHires);
  const [selectedHireId, setSelectedHireId] = useState<string>(mockOnboardingHires[0]?.id || '');

  const stages = ['Offer signed', 'Documents', 'Equipment', 'Induction', 'Complete'];

  const toggleTask = (hireId: string, taskId: string) => {
    setHires((prev) =>
      prev.map((h) => {
        if (h.id !== hireId) return h;
        const updatedChecklist = h.checklist.map((item) =>
          item.id === taskId ? { ...item, completed: !item.completed } : item
        );
        const completedCount = updatedChecklist.filter((i) => i.completed).length;
        const newProgress = Math.round((completedCount / updatedChecklist.length) * 100);

        return {
          ...h,
          checklist: updatedChecklist,
          progress: newProgress,
          stage:
            newProgress === 100
              ? 'Complete'
              : newProgress >= 80
              ? 'Induction'
              : newProgress >= 60
              ? 'Equipment'
              : 'Documents',
        };
      })
    );
    addToast('success', 'Task Checked', 'Onboarding milestone recorded.');
  };

  const selectedHire = hires.find((h) => h.id === selectedHireId) || hires[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Onboarding Cohort</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Stage pipeline and induction checklists for recent Northwind Studios hires.
          </p>
        </div>
      </div>

      {/* Stepper Pipeline Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {stages.map((stg) => {
          const inStageCount = hires.filter((h) => h.stage === stg).length;
          return (
            <Card key={stg} className="p-4 flex flex-col justify-between bg-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#6B647F] uppercase tracking-wider">
                  {stg}
                </span>
                <span className="w-5 h-5 rounded-full bg-[#F7F4FF] text-[#6D28D9] border border-[#E0D6FD] text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {inStageCount}
                </span>
              </div>
              <div className="mt-3 text-xs text-[#928BA6]">
                {inStageCount === 1 ? '1 hire active' : `${inStageCount} hires active`}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Two-Column Hire Management */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: List of Hires (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1F1A2E]">New Joiners ({hires.length})</h3>
          {hires.map((hire) => {
            const isSelected = hire.id === selectedHireId;
            return (
              <Card
                key={hire.id}
                hoverable
                onClick={() => setSelectedHireId(hire.id)}
                className={`p-4 space-y-3 cursor-pointer ${
                  isSelected ? 'border-[#8B5CF6] ring-2 ring-[#8B5CF6]/20 bg-[#F7F4FF]/30' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={hire.name} src={hire.avatar_url} size="md" />
                    <div>
                      <h4 className="text-xs font-bold text-[#1F1A2E]">{hire.name}</h4>
                      <p className="text-[11px] text-[#6B647F]">{hire.role}</p>
                      <span className="text-[10px] text-[#928BA6]">
                        Started {formatDate(hire.start_date)}
                      </span>
                    </div>
                  </div>
                  <Badge variant="purple" size="sm">
                    {hire.stage}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#6B647F]">
                    <span>Onboarding progress</span>
                    <span className="font-bold tabular-nums text-[#1F1A2E]">{hire.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#F7F5FB] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${hire.progress}%` }}
                      className="h-full bg-[#6D28D9] rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Right Column: Active Hire Checklist (7 cols) */}
        <div className="lg:col-span-7">
          {selectedHire && (
            <Card className="p-6 space-y-5">
              <div className="flex items-start justify-between pb-4 border-b border-[#ECE8F4]">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedHire.name} src={selectedHire.avatar_url} size="lg" />
                  <div>
                    <h2 className="text-base font-bold text-[#1F1A2E]">{selectedHire.name}</h2>
                    <p className="text-xs text-[#6B647F]">
                      {selectedHire.role} · {selectedHire.department}
                    </p>
                    <span className="text-[10px] text-[#928BA6]">
                      Join Date: {formatDate(selectedHire.start_date)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/employees/${selectedHire.employee_id}`)}
                >
                  View Profile →
                </Button>
              </div>

              {/* Checklist items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-[#1F1A2E] uppercase tracking-wider">
                    Onboarding Verification Checklist
                  </h3>
                  <span className="text-xs text-[#6D28D9] font-semibold tabular-nums">
                    {selectedHire.checklist.filter((c) => c.completed).length} of{' '}
                    {selectedHire.checklist.length} Completed
                  </span>
                </div>

                <div className="space-y-2.5">
                  {selectedHire.checklist.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(selectedHire.id, task.id)}
                      className={`p-3 rounded-[12px] border flex items-start gap-3 cursor-pointer transition-colors ${
                        task.completed
                          ? 'bg-[#ECFDF3]/40 border-[#BBF7D0]'
                          : 'bg-white border-[#ECE8F4] hover:bg-[#F7F4FF]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => {}} // handled by div click
                        className="mt-0.5 rounded border-[#DCD5EA] text-[#6D28D9] focus:ring-[#8B5CF6]/30 cursor-pointer w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-xs font-medium ${
                            task.completed ? 'line-through text-[#6B647F]' : 'text-[#1F1A2E]'
                          }`}
                        >
                          {task.task}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-[#928BA6] mt-0.5">
                          <span>Responsible: <strong className="text-[#6B647F]">{task.owner}</strong></span>
                          <span>·</span>
                          <span>Due: {formatDate(task.due_date)}</span>
                        </div>
                      </div>
                      {task.completed && (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
