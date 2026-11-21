import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronRight,
  Building2,
  Mail,
  User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Employee } from '../types';

export const OrgChartPage: React.FC = () => {
  const { employees, departments } = useApp();
  const navigate = useNavigate();

  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // CEO / Top-level roots (manager_id is undefined or emp-001)
  const ceo = employees.find((e) => e.title === 'Chief Executive Officer') || employees[0];

  // Direct reports of a manager
  const getSubordinates = (managerId: string) => {
    return employees.filter(
      (e) =>
        e.manager_id === managerId &&
        (selectedDeptFilter === 'ALL' || e.department_id === selectedDeptFilter)
    );
  };

  // Recursive tree node component
  const renderTreeNode = (emp: Employee, depth: number = 0) => {
    const subordinates = getSubordinates(emp.id);
    const hasSubordinates = subordinates.length > 0;
    const isCollapsed = collapsedNodes[emp.id];

    return (
      <div key={emp.id} className="flex flex-col items-center">
        {/* Employee Card Node */}
        <div
          onClick={() => navigate(`/employees/${emp.id}`)}
          className={`relative bg-white rounded-[16px] border border-[#ECE8F4] p-4 w-64 shadow-[0_1px_2px_rgba(31,26,46,0.04),0_8px_24px_rgba(109,40,217,0.06)] hover:border-[#8B5CF6] hover:shadow-[0_12px_32px_rgba(109,40,217,0.12)] transition-all cursor-pointer group select-none ${
            depth === 0 ? 'ring-2 ring-[#6D28D9]/20' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <Avatar name={`${emp.first_name} ${emp.last_name}`} src={emp.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-[#1F1A2E] truncate group-hover:text-[#6D28D9]">
                {emp.first_name} {emp.last_name}
              </h4>
              <p className="text-[11px] text-[#6B647F] truncate">{emp.title}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-[#928BA6] mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
                <span className="truncate">{emp.department_name}</span>
              </div>
            </div>
          </div>

          {/* Toggle sub-tree collapse button */}
          {hasSubordinates && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(emp.id);
              }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border border-[#E0D6FD] shadow-xs flex items-center justify-center text-[#6D28D9] hover:bg-[#F7F4FF] cursor-pointer"
              title={isCollapsed ? 'Expand team' : 'Collapse team'}
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Tree Connectors & Children */}
        {hasSubordinates && !isCollapsed && (
          <div className="flex flex-col items-center w-full mt-4">
            <div className="w-px h-6 bg-[#DCD5EA]" />
            <div className="flex items-start justify-center gap-6 relative">
              {subordinates.length > 1 && (
                <div className="absolute top-0 left-32 right-32 h-px bg-[#DCD5EA]" />
              )}
              {subordinates.map((sub) => (
                <div key={sub.id} className="flex flex-col items-center">
                  <div className="w-px h-4 bg-[#DCD5EA]" />
                  {renderTreeNode(sub, depth + 1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Organization Hierarchy</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Interactive reporting tree across Northwind Studios leadership and departments.
          </p>
        </div>

        {/* Controls: Zoom & Department filter */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-white p-1 rounded-[10px] border border-[#ECE8F4]">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
              className="p-1.5 text-[#6B647F] hover:text-[#1F1A2E] rounded cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 tabular-nums">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
              className="p-1.5 text-[#6B647F] hover:text-[#1F1A2E] rounded cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1.5 text-[#6B647F] hover:text-[#1F1A2E] rounded cursor-pointer"
              title="Reset Zoom"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="w-44">
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="w-full h-9 px-3 bg-white text-xs text-[#1F1A2E] rounded-[10px] border border-[#ECE8F4]"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Tree Canvas */}
      <div className="w-full overflow-auto p-12 bg-[#FCFBFF] rounded-[20px] border border-[#ECE8F4] min-h-[620px] flex justify-center shadow-inner">
        <div
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="pb-16"
        >
          {ceo && renderTreeNode(ceo, 0)}
        </div>
      </div>
    </div>
  );
};
