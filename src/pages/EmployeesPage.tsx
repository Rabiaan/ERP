import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutGrid,
  List,
  Download,
  UserPlus,
  Filter,
  MoreVertical,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Table, Column } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/FormField';
import { Pagination } from '../components/ui/Pagination';
import { BulkActionBar } from '../components/ui/BulkActionBar';
import { Card } from '../components/ui/Card';
import { Employee, EmploymentStatus } from '../types';
import { formatDate } from '../lib/utils';

export const EmployeesPage: React.FC = () => {
  const {
    employees,
    departments,
    locations,
    setIsAddEmployeeDrawerOpen,
    addToast,
    updateEmployee,
  } = useApp();

  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const [sortColumn, setSortColumn] = useState<string>('first_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filter & Search
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        search === '' ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        emp.email.toLowerCase().includes(search.toLowerCase()) ||
        emp.employee_no.toLowerCase().includes(search.toLowerCase()) ||
        emp.title.toLowerCase().includes(search.toLowerCase());

      const matchesDept = selectedDept === 'ALL' || emp.department_id === selectedDept;
      const matchesStatus = selectedStatus === 'ALL' || emp.status === selectedStatus;
      const matchesType = selectedType === 'ALL' || emp.employment_type === selectedType;
      const matchesLoc = selectedLocation === 'ALL' || emp.location_id === selectedLocation;

      return matchesSearch && matchesDept && matchesStatus && matchesType && matchesLoc;
    });
  }, [employees, search, selectedDept, selectedStatus, selectedType, selectedLocation]);

  // Sort
  const sortedEmployees = useMemo(() => {
    return [...filteredEmployees].sort((a, b) => {
      let aVal = (a as any)[sortColumn] || '';
      let bVal = (b as any)[sortColumn] || '';
      if (sortColumn === 'name') {
        aVal = `${a.first_name} ${a.last_name}`;
        bVal = `${b.first_name} ${b.last_name}`;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEmployees, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedEmployees.length / pageSize);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedEmployees.slice(start, start + pageSize);
  }, [sortedEmployees, currentPage, pageSize]);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === paginatedEmployees.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedEmployees.map((e) => e.id));
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID,Employee No,Name,Email,Department,Title,Status,Location,Hire Date\n'];
    const rows = filteredEmployees.map(
      (e) =>
        `"${e.id}","${e.employee_no}","${e.first_name} ${e.last_name}","${e.email}","${e.department_name}","${e.title}","${e.status}","${e.location_name}","${e.hire_date}"\n`
    );
    const blob = new Blob([...headers, ...rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Northwind_Employees_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('success', 'Export Complete', `${filteredEmployees.length} employee records exported to CSV.`);
  };

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortable: true,
      render: (emp) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${emp.first_name} ${emp.last_name}`} src={emp.avatar_url} size="sm" />
          <div className="min-w-0">
            <div className="font-semibold text-[#1F1A2E] group-hover:text-[#6D28D9] transition-colors truncate">
              {emp.first_name} {emp.last_name}
            </div>
            <div className="text-[11px] text-[#6B647F] truncate">{emp.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'employee_no',
      header: 'ID',
      sortable: true,
      width: '100px',
      render: (emp) => (
        <span className="font-mono text-xs text-[#6B647F] bg-[#F7F5FB] px-2 py-0.5 rounded border border-[#ECE8F4]">
          {emp.employee_no}
        </span>
      ),
    },
    {
      key: 'department_name',
      header: 'Department',
      sortable: true,
      render: (emp) => <span className="font-medium text-[#1F1A2E]">{emp.department_name}</span>,
    },
    {
      key: 'title',
      header: 'Role',
      sortable: true,
      render: (emp) => <span className="text-[#6B647F]">{emp.title}</span>,
    },
    {
      key: 'location_name',
      header: 'Location',
      render: (emp) => <span className="text-xs text-[#6B647F]">{emp.location_name}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (emp) => <Badge variant={emp.status} size="sm" />,
    },
    {
      key: 'hire_date',
      header: 'Start Date',
      sortable: true,
      render: (emp) => <span className="text-xs text-[#6B647F] tabular-nums">{formatDate(emp.hire_date)}</span>,
    },
  ];

  const statusOptions = ['ALL', 'Active', 'Probation', 'On leave', 'Exited'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Employee Directory</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Manage Northwind Studios team roster, organizational roles, and talent records.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => setIsAddEmployeeDrawerOpen(true)}
          >
            Add Employee
          </Button>
        </div>
      </div>

      {/* Status Filter Chips Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {statusOptions.map((st) => {
          const count =
            st === 'ALL'
              ? employees.length
              : employees.filter((e) => e.status === st).length;
          const isSelected = selectedStatus === st;

          return (
            <button
              key={st}
              onClick={() => {
                setSelectedStatus(st);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer whitespace-nowrap border ${
                isSelected
                  ? 'bg-[#6D28D9] text-white border-[#6D28D9] shadow-xs'
                  : 'bg-white text-[#6B647F] border-[#ECE8F4] hover:bg-[#F7F4FF] hover:border-[#C9B8FB]'
              }`}
            >
              <span>{st === 'ALL' ? 'All Workforce' : st}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-[#F7F5FB] text-[#6B647F]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search and Advanced Filters Bar */}
      <div className="p-4 bg-white rounded-[16px] border border-[#ECE8F4] shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, role, email, or ID..."
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto">
          {/* Department Filter */}
          <div className="w-40 shrink-0">
            <Select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Location Filter */}
          <div className="w-36 shrink-0">
            <Select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Table / Grid Toggle */}
          <div className="flex items-center bg-[#F7F5FB] p-1 rounded-[10px] border border-[#ECE8F4] shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-[8px] transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-[#6D28D9] shadow-2xs' : 'text-[#6B647F]'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-[8px] transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-[#6D28D9] shadow-2xs' : 'text-[#6B647F]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Grid */}
      {viewMode === 'table' ? (
        <div className="space-y-4">
          <Table
            columns={columns}
            data={paginatedEmployees}
            keyExtractor={(e) => e.id}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectedIds={selectedIds}
            onSelectRow={handleSelectRow}
            onSelectAll={handleSelectAll}
            onRowClick={(emp) => navigate(`/employees/${emp.id}`)}
            emptyState={
              <div className="p-8 text-center text-xs text-[#928BA6]">
                No employees matching current filters.
              </div>
            }
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredEmployees.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>
      ) : (
        /* Grid View */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {paginatedEmployees.map((emp) => (
              <Card
                key={emp.id}
                hoverable
                onClick={() => navigate(`/employees/${emp.id}`)}
                className="p-5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <Avatar
                      name={`${emp.first_name} ${emp.last_name}`}
                      src={emp.avatar_url}
                      size="lg"
                    />
                    <Badge variant={emp.status} size="sm" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#1F1A2E] truncate">
                      {emp.first_name} {emp.last_name}
                    </h3>
                    <p className="text-xs text-[#6B647F] truncate">{emp.title}</p>
                  </div>
                  <div className="space-y-1.5 pt-2 border-t border-[#F7F5FB] text-xs text-[#6B647F]">
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-3.5 h-3.5 text-[#928BA6] shrink-0" />
                      <span className="truncate">{emp.department_name}</span>
                    </div>
                    <div className="flex items-center gap-2 truncate">
                      <MapPin className="w-3.5 h-3.5 text-[#928BA6] shrink-0" />
                      <span className="truncate">{emp.location_name}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-[#ECE8F4] flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-[#928BA6]">{emp.employee_no}</span>
                  <span className="text-[#6D28D9] font-medium text-xs">View profile →</span>
                </div>
              </Card>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredEmployees.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        onClear={() => setSelectedIds([])}
        actions={[
          {
            label: 'Export Selected',
            icon: <Download className="w-4 h-4" />,
            onClick: () => {
              addToast('info', 'Bulk Export', `Exporting ${selectedIds.length} employee dossiers.`);
              setSelectedIds([]);
            },
          },
          {
            label: 'Mark as On Leave',
            icon: <UserCheck className="w-4 h-4" />,
            onClick: () => {
              selectedIds.forEach((id) => updateEmployee(id, { status: 'On leave' }));
              addToast('success', 'Status Updated', `${selectedIds.length} employees set to On Leave.`);
              setSelectedIds([]);
            },
          },
        ]}
      />
    </div>
  );
};
