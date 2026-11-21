import React, { useState } from 'react';
import {
  Briefcase,
  Plus,
  Users,
  Calendar,
  Star,
  ChevronRight,
  ArrowRight,
  Video,
  MapPin,
  Clock,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  ExternalLink,
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
import { Candidate, CandidateStage, JobOpening } from '../types';
import { formatDate } from '../lib/utils';

export const RecruitmentPage: React.FC = () => {
  const {
    jobOpenings,
    candidates,
    interviews,
    departments,
    locations,
    moveCandidateStage,
    addCandidateNote,
    addJobOpening,
    addCandidate,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'pipeline' | 'jobs' | 'interviews'>('pipeline');
  const [selectedJobFilter, setSelectedJobFilter] = useState('ALL');

  // Candidate detail drawer
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [newNote, setNewNote] = useState('');

  // Create Job Drawer
  const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: '',
    department_id: departments[0]?.id || 'dept-1',
    location_id: locations[0]?.id || 'loc-1',
    type: 'Full-time' as const,
    hiring_manager_name: 'Zain Malik',
    experience_level: '4+ years',
    status: 'Open' as const,
  });

  // Create Candidate Drawer
  const [isCandidateDrawerOpen, setIsCandidateDrawerOpen] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    job_id: jobOpenings[0]?.id || 'job-1',
    name: '',
    email: '',
    phone: '',
    stage: 'Applied' as CandidateStage,
    source: 'LinkedIn',
    rating: 4,
    resume_summary: '',
  });

  const stages: CandidateStage[] = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];

  const filteredCandidates = candidates.filter(
    (c) => selectedJobFilter === 'ALL' || c.job_id === selectedJobFilter
  );

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate || !newNote.trim()) return;
    addCandidateNote(selectedCandidate.id, newNote);
    setNewNote('');
    // refresh current candidate
    const updated = candidates.find((c) => c.id === selectedCandidate.id);
    if (updated) setSelectedCandidate(updated);
  };

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title.trim()) return;
    const dept = departments.find((d) => d.id === jobForm.department_id);
    const loc = locations.find((l) => l.id === jobForm.location_id);
    addJobOpening({
      ...jobForm,
      department_name: dept?.name || 'Engineering',
      location_name: loc?.name || 'Lahore HQ',
    });
    setIsJobDrawerOpen(false);
    setJobForm({
      title: '',
      department_id: departments[0]?.id || 'dept-1',
      location_id: locations[0]?.id || 'loc-1',
      type: 'Full-time',
      hiring_manager_name: 'Zain Malik',
      experience_level: '4+ years',
      status: 'Open',
    });
  };

  const handleCreateCandidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateForm.name.trim() || !candidateForm.email.trim()) return;
    const job = jobOpenings.find((j) => j.id === candidateForm.job_id);
    addCandidate({
      ...candidateForm,
      job_title: job?.title || 'Open Position',
    });
    setIsCandidateDrawerOpen(false);
    setCandidateForm({
      job_id: jobOpenings[0]?.id || 'job-1',
      name: '',
      email: '',
      phone: '',
      stage: 'Applied',
      source: 'LinkedIn',
      rating: 4,
      resume_summary: '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Recruitment & Pipeline</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Applicant tracking, interview scheduling, and candidate evaluations.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Users className="w-4 h-4" />}
            onClick={() => setIsCandidateDrawerOpen(true)}
          >
            Add Candidate
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsJobDrawerOpen(true)}
          >
            Post Job Opening
          </Button>
        </div>
      </div>

      {/* Tabs & Job Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#ECE8F4]">
        <Tabs
          tabs={[
            { id: 'pipeline', label: 'Candidate Kanban Pipeline', count: candidates.length },
            { id: 'jobs', label: 'Open Positions', count: jobOpenings.length },
            { id: 'interviews', label: 'Interviews & Scorecards', count: interviews.length },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />

        {activeTab === 'pipeline' && (
          <div className="w-64">
            <Select
              value={selectedJobFilter}
              onChange={(e) => setSelectedJobFilter(e.target.value)}
              className="h-8.5 text-xs"
            >
              <option value="ALL">All Active Requisitions</option>
              {jobOpenings.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Tab 1: Kanban Pipeline */}
      {activeTab === 'pipeline' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageCandidates = filteredCandidates.filter((c) => c.stage === stage);
            return (
              <div
                key={stage}
                className="bg-[#F7F5FB] rounded-[16px] p-3 border border-[#ECE8F4] flex flex-col min-w-[240px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 px-1 border-b border-[#ECE8F4]/80">
                  <span className="text-xs font-bold text-[#1F1A2E]">{stage}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white text-[#6D28D9] border border-[#ECE8F4] tabular-nums">
                    {stageCandidates.length}
                  </span>
                </div>

                {/* Candidate Cards in Stage */}
                <div className="mt-3 space-y-2.5 flex-1">
                  {stageCandidates.map((cand) => (
                    <Card
                      key={cand.id}
                      hoverable
                      onClick={() => setSelectedCandidate(cand)}
                      className="p-3.5 space-y-2 bg-white"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-bold text-[#1F1A2E] group-hover:text-[#6D28D9] transition-colors">
                          {cand.name}
                        </h4>
                        <div className="flex items-center text-[#F59E0B]">
                          <Star className="w-3 h-3 fill-current" />
                          <span className="text-[10px] font-bold text-[#1F1A2E] ml-0.5 tabular-nums">
                            {cand.rating}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-[#6B647F] line-clamp-1">{cand.job_title}</div>

                      <div className="flex items-center justify-between pt-1 text-[10px] text-[#928BA6]">
                        <span className="bg-[#FCFBFF] px-1.5 py-0.5 rounded border border-[#ECE8F4]">
                          {cand.source}
                        </span>
                        <span>{cand.days_in_stage}d in stage</span>
                      </div>

                      {/* Move to next stage quick-action */}
                      <div
                        className="pt-2 border-t border-[#F7F5FB] flex items-center justify-between"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] text-[#928BA6]">Move stage:</span>
                        <div className="flex items-center gap-1">
                          {stages.indexOf(cand.stage) > 0 && (
                            <button
                              onClick={() =>
                                moveCandidateStage(
                                  cand.id,
                                  stages[stages.indexOf(cand.stage) - 1]
                                )
                              }
                              className="text-[10px] font-medium text-[#6B647F] hover:text-[#1F1A2E] px-1 rounded bg-[#F7F5FB] cursor-pointer"
                              title="Move back"
                            >
                              ←
                            </button>
                          )}
                          {stages.indexOf(cand.stage) < stages.length - 1 && (
                            <button
                              onClick={() =>
                                moveCandidateStage(
                                  cand.id,
                                  stages[stages.indexOf(cand.stage) + 1]
                                )
                              }
                              className="text-[10px] font-semibold text-[#6D28D9] hover:bg-[#F7F4FF] px-1.5 py-0.5 rounded border border-[#E0D6FD] cursor-pointer"
                              title="Advance stage"
                            >
                              Next →
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  {stageCandidates.length === 0 && (
                    <div className="p-6 text-center text-xs text-[#928BA6] italic">No candidates</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Job Openings List */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobOpenings.map((job) => (
              <Card key={job.id} className="p-5 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#1F1A2E]">{job.title}</h3>
                      <div className="text-xs text-[#6B647F] mt-0.5">
                        {job.department_name} · {job.location_name}
                      </div>
                    </div>
                    <Badge variant={job.status} size="sm" />
                  </div>
                  <p className="text-xs text-[#6B647F]">{job.experience_level}</p>
                </div>

                <div className="pt-4 mt-4 border-t border-[#ECE8F4] flex items-center justify-between text-xs text-[#6B647F]">
                  <span>Hiring Manager: <strong className="text-[#1F1A2E]">{job.hiring_manager_name}</strong></span>
                  <span className="font-bold text-[#6D28D9] tabular-nums">
                    {job.applicants_count} applicants
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Interviews & Scorecards */}
      {activeTab === 'interviews' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Interviews Roster</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-[#F7F5FB] p-0">
              {interviews.map((int) => (
                <div
                  key={int.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#F7F4FF] text-[#6D28D9] flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#1F1A2E]">{int.candidate_name}</div>
                      <div className="text-[11px] text-[#6B647F]">
                        {int.job_title} · Interviewer: {int.interviewer_name}
                      </div>
                      <div className="text-[10px] text-[#928BA6] flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{int.scheduled_at} ({int.mode})</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {int.meet_link && (
                      <a
                        href={int.meet_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[10px] bg-[#6D28D9] text-white text-xs font-medium hover:bg-[#7C3AED]"
                      >
                        Join Room <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </a>
                    )}
                    <Badge variant={int.status} size="sm" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Candidate Profile Drawer */}
      <Drawer
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        title={selectedCandidate?.name || 'Candidate Profile'}
        description={`Applying for ${selectedCandidate?.job_title}`}
        size="lg"
        footer={
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#928BA6]">Stage:</span>
              <Select
                value={selectedCandidate?.stage}
                onChange={(e) => {
                  if (selectedCandidate) {
                    moveCandidateStage(selectedCandidate.id, e.target.value as CandidateStage);
                    setSelectedCandidate({
                      ...selectedCandidate,
                      stage: e.target.value as CandidateStage,
                    });
                  }
                }}
                className="h-8 text-xs w-36"
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSelectedCandidate(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedCandidate && (
          <div className="space-y-5 text-xs">
            {/* Quick Contact & Rating */}
            <div className="p-4 bg-[#FCFBFF] rounded-[12px] border border-[#ECE8F4] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[#F59E0B]">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < selectedCandidate.rating ? 'fill-current' : 'text-[#DCD5EA]'
                      }`}
                    />
                  ))}
                  <span className="text-xs font-bold text-[#1F1A2E] ml-1">
                    {selectedCandidate.rating} / 5 Score
                  </span>
                </div>
                <Badge variant={selectedCandidate.stage} />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-[#6B647F]">
                <div>Email: <strong className="text-[#1F1A2E]">{selectedCandidate.email}</strong></div>
                <div>Phone: <strong className="text-[#1F1A2E]">{selectedCandidate.phone}</strong></div>
                <div>Source: <strong className="text-[#1F1A2E]">{selectedCandidate.source}</strong></div>
                <div>Applied: <strong className="text-[#1F1A2E]">{formatDate(selectedCandidate.applied_date)}</strong></div>
              </div>
            </div>

            {/* Resume Summary */}
            <div className="space-y-1">
              <h4 className="font-semibold text-[#1F1A2E]">Resume Summary & Experience</h4>
              <p className="text-[#6B647F] leading-relaxed p-3 bg-white border border-[#ECE8F4] rounded-[10px]">
                {selectedCandidate.resume_summary || 'Extensive professional experience in high scale engineering.'}
              </p>
            </div>

            {/* Notes & Evaluation History */}
            <div className="space-y-2">
              <h4 className="font-semibold text-[#1F1A2E]">Interviewer Notes & Scorecards</h4>
              <div className="space-y-2">
                {selectedCandidate.notes.map((n, i) => (
                  <div key={i} className="p-2.5 rounded-[8px] bg-[#F7F4FF] border border-[#E0D6FD]/70 text-[#1F1A2E]">
                    {n}
                  </div>
                ))}
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="flex gap-2 pt-2">
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add evaluation note or feedback..."
                  className="h-9 text-xs"
                />
                <Button type="submit" variant="primary" size="sm" className="h-9 shrink-0">
                  Add Note
                </Button>
              </form>
            </div>
          </div>
        )}
      </Drawer>

      {/* Create Job Drawer */}
      <Drawer
        isOpen={isJobDrawerOpen}
        onClose={() => setIsJobDrawerOpen(false)}
        title="Post New Job Opening"
        description="Publish a new recruitment requisition for Northwind Studios."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsJobDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateJob}>
              Publish Job
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateJob} className="space-y-4">
          <FormField label="Job Title" required>
            <Input
              value={jobForm.title}
              onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
              placeholder="e.g. Senior Security Architect"
            />
          </FormField>
          <FormField label="Department" required>
            <Select
              value={jobForm.department_id}
              onChange={(e) => setJobForm({ ...jobForm, department_id: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Location">
            <Select
              value={jobForm.location_id}
              onChange={(e) => setJobForm({ ...jobForm, location_id: e.target.value })}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Required Experience">
            <Input
              value={jobForm.experience_level}
              onChange={(e) => setJobForm({ ...jobForm, experience_level: e.target.value })}
              placeholder="e.g. 5+ years experience"
            />
          </FormField>
        </form>
      </Drawer>

      {/* Add Candidate Drawer */}
      <Drawer
        isOpen={isCandidateDrawerOpen}
        onClose={() => setIsCandidateDrawerOpen(false)}
        title="Enroll Candidate in Pipeline"
        description="Enter applicant contact information and match with a job opening."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCandidateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateCandidate}>
              Enroll Candidate
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateCandidate} className="space-y-4">
          <FormField label="Job Opening" required>
            <Select
              value={candidateForm.job_id}
              onChange={(e) => setCandidateForm({ ...candidateForm, job_id: e.target.value })}
            >
              {jobOpenings.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Candidate Name" required>
            <Input
              value={candidateForm.name}
              onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
              placeholder="Full Name"
            />
          </FormField>
          <FormField label="Email Address" required>
            <Input
              type="email"
              value={candidateForm.email}
              onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
              placeholder="email@example.com"
            />
          </FormField>
          <FormField label="Phone">
            <Input
              value={candidateForm.phone}
              onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
              placeholder="+92 300 1234567"
            />
          </FormField>
          <FormField label="Initial Stage">
            <Select
              value={candidateForm.stage}
              onChange={(e) =>
                setCandidateForm({ ...candidateForm, stage: e.target.value as CandidateStage })
              }
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FormField>
        </form>
      </Drawer>
    </div>
  );
};
