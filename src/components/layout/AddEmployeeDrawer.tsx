import React, { useState } from 'react';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select, FormField } from '../ui/FormField';
import { useApp } from '../../context/AppContext';
import { EmploymentType, EmploymentStatus } from '../../types';

export const AddEmployeeDrawer: React.FC = () => {
  const {
    isAddEmployeeDrawerOpen,
    setIsAddEmployeeDrawerOpen,
    addEmployee,
    departments,
    locations,
    employees,
  } = useApp();

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    dob: '1995-01-01',
    gender: 'Male' as const,
    address: 'Gulberg III, Lahore',
    department_id: departments[0]?.id || 'dept-1',
    title: '',
    manager_id: 'emp-001',
    location_id: locations[0]?.id || 'loc-1',
    employment_type: 'Full-time' as EmploymentType,
    status: 'Active' as EmploymentStatus,
    hire_date: new Date().toISOString().substring(0, 10),
    salary_base: 250000,
    emergency_name: '',
    emergency_relation: 'Spouse',
    emergency_phone: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.first_name.trim()) errs.first_name = 'First name is required.';
    if (!formData.last_name.trim()) errs.last_name = 'Last name is required.';
    if (!formData.email.trim() || !formData.email.includes('@'))
      errs.email = 'Valid corporate email is required.';
    if (!formData.title.trim()) errs.title = 'Job title is required.';
    if (formData.salary_base <= 0) errs.salary_base = 'Base salary must be greater than 0.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const dept = departments.find((d) => d.id === formData.department_id);
      const loc = locations.find((l) => l.id === formData.location_id);
      const mgr = employees.find((e) => e.id === formData.manager_id);

      addEmployee({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone || '+92 300 0000000',
        dob: formData.dob,
        gender: formData.gender,
        address: formData.address,
        department_id: formData.department_id,
        department_name: dept?.name || 'Engineering',
        title: formData.title.trim(),
        manager_id: formData.manager_id,
        manager_name: mgr ? `${mgr.first_name} ${mgr.last_name}` : undefined,
        location_id: formData.location_id,
        location_name: loc?.name || 'Lahore HQ',
        employment_type: formData.employment_type,
        status: formData.status,
        hire_date: formData.hire_date,
        salary_base: Number(formData.salary_base),
        emergency_contact: {
          name: formData.emergency_name || 'Emergency Contact',
          relationship: formData.emergency_relation,
          phone: formData.emergency_phone || '+92 300 1112233',
        },
      });

      setIsSubmitting(false);
      setIsAddEmployeeDrawerOpen(false);
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        dob: '1995-01-01',
        gender: 'Male',
        address: 'Gulberg III, Lahore',
        department_id: departments[0]?.id || 'dept-1',
        title: '',
        manager_id: 'emp-001',
        location_id: locations[0]?.id || 'loc-1',
        employment_type: 'Full-time',
        status: 'Active',
        hire_date: new Date().toISOString().substring(0, 10),
        salary_base: 250000,
        emergency_name: '',
        emergency_relation: 'Spouse',
        emergency_phone: '',
      });
    }, 300);
  };

  return (
    <Drawer
      isOpen={isAddEmployeeDrawerOpen}
      onClose={() => setIsAddEmployeeDrawerOpen(false)}
      title="Add New Employee"
      description="Create a new official profile in Northwind Studios HR directory."
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => setIsAddEmployeeDrawerOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
          >
            Add Employee
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First Name" required error={errors.first_name}>
            <Input
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              placeholder="e.g. Tariq"
              error={!!errors.first_name}
            />
          </FormField>
          <FormField label="Last Name" required error={errors.last_name}>
            <Input
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              placeholder="e.g. Mansoor"
              error={!!errors.last_name}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Work Email" required error={errors.email}>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="name@northwindstudios.com"
              error={!!errors.email}
            />
          </FormField>
          <FormField label="Phone Number">
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+92 300 1234567"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Department" required>
            <Select
              value={formData.department_id}
              onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Job Title" required error={errors.title}>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Senior Software Engineer"
              error={!!errors.title}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Reporting Manager">
            <Select
              value={formData.manager_id}
              onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
            >
              {employees.slice(0, 15).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.title})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Work Location">
            <Select
              value={formData.location_id}
              onChange={(e) => setFormData({ ...formData, location_id: e.target.value })}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Type">
            <Select
              value={formData.employment_type}
              onChange={(e) =>
                setFormData({ ...formData, employment_type: e.target.value as EmploymentType })
              }
            >
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Internship">Internship</option>
            </Select>
          </FormField>

          <FormField label="Status">
            <Select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as EmploymentStatus })
              }
            >
              <option value="Active">Active</option>
              <option value="Probation">Probation</option>
              <option value="On leave">On leave</option>
            </Select>
          </FormField>

          <FormField label="Start Date">
            <Input
              type="date"
              value={formData.hire_date}
              onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Base Salary (PKR/month)" required error={errors.salary_base}>
          <Input
            type="number"
            value={formData.salary_base}
            onChange={(e) => setFormData({ ...formData, salary_base: Number(e.target.value) })}
            error={!!errors.salary_base}
          />
        </FormField>

        {/* Emergency Contact */}
        <div className="pt-3 border-t border-[#ECE8F4]">
          <h4 className="text-xs font-semibold text-[#1F1A2E] mb-2">Emergency Contact</h4>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Contact Name">
              <Input
                value={formData.emergency_name}
                onChange={(e) => setFormData({ ...formData, emergency_name: e.target.value })}
                placeholder="Family member"
              />
            </FormField>
            <FormField label="Relationship">
              <Select
                value={formData.emergency_relation}
                onChange={(e) => setFormData({ ...formData, emergency_relation: e.target.value })}
              >
                <option value="Spouse">Spouse</option>
                <option value="Parent">Parent</option>
                <option value="Sibling">Sibling</option>
                <option value="Other">Other</option>
              </Select>
            </FormField>
            <FormField label="Emergency Phone">
              <Input
                value={formData.emergency_phone}
                onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
                placeholder="+92 321 0000000"
              />
            </FormField>
          </div>
        </div>
      </form>
    </Drawer>
  );
};
