"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SetupStep = 'store' | 'workTypes' | 'employees' | 'shifts';

interface StoreData {
  name: string;
  city: string;
  address: string;
  openingTime: string;
}

interface WorkType {
  id?: string;
  name: string;
  color: string;
}

interface Employee {
  name: string;
  email: string;
  phone: string;
  contractType: 'FULL_TIME' | 'PART_TIME' | 'STUDENT' | 'FLEXI_JOB';
  color: string;
  workTypeIds: string[];
}

interface ShiftTemplate {
  workTypeId: string;
  days: string[];
  startTime: string;
  endTime: string;
}

const CONTRACT_TYPES = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'FLEXI_JOB', label: 'Flexi Job' },
];

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

const DAYS = [
  { key: 'MON', label: 'Monday' },
  { key: 'TUE', label: 'Tuesday' },
  { key: 'WED', label: 'Wednesday' },
  { key: 'THU', label: 'Thursday' },
  { key: 'FRI', label: 'Friday' },
  { key: 'SAT', label: 'Saturday' },
  { key: 'SUN', label: 'Sunday' },
];

const STEPS = [
  { key: 'store', title: 'Store Details', description: 'Basic information about your store' },
  { key: 'workTypes', title: 'Work Types', description: 'Define roles like Cashier, Stock, etc.' },
  { key: 'employees', title: 'Employees', description: 'Add your team members (optional)' },
  { key: 'shifts', title: 'Shift Templates', description: 'Create recurring shift patterns (optional)' },
];

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<SetupStep>('store');
  const [completedSteps, setCompletedSteps] = useState<Set<SetupStep>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form data for all steps
  const [storeData, setStoreData] = useState<StoreData>({
    name: '',
    city: '',
    address: '',
    openingTime: '09:00'
  });
  const [workTypes, setWorkTypes] = useState<WorkType[]>([
    { name: 'Cashier', color: '#3b82f6' },
    { name: 'Stock', color: '#10b981' }
  ]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [setupRes, citiesRes] = await Promise.all([
          fetch("/api/setup", { cache: "no-store" }),
          fetch("/api/be/cities", { cache: "force-cache" }),
        ]);
        
        if (!setupRes.ok) throw new Error("Failed to load setup");
        const setup = await setupRes.json();
        
        if (setup.onboardingStep === "DONE") {
          router.replace("/schedule");
          return;
        }
        
        const cityList = await citiesRes.json().catch(() => ({ cities: [] }));
        setCities(Array.isArray(cityList.cities) ? cityList.cities : []);
        
        // Pre-fill existing data if available
        if (setup.store) {
          setStoreData({
            name: setup.store.name || '',
            city: setup.store.city || '',
            address: setup.store.address || '',
            openingTime: setup.store.openingTime || '09:00'
          });
          setCompletedSteps(prev => new Set([...prev, 'store']));
        }
        
        if (setup.workTypes?.length > 0) {
          setWorkTypes(setup.workTypes);
          setCompletedSteps(prev => new Set([...prev, 'workTypes']));
        }
        
        if (setup.employees?.length > 0) {
          setEmployees(setup.employees.map((emp: any) => ({
            name: emp.name,
            email: emp.email || '',
            phone: emp.phone || '',
            contractType: emp.contractType,
            color: emp.color,
            workTypeIds: emp.roles?.map((r: any) => r.id) || []
          })));
          setCompletedSteps(prev => new Set([...prev, 'employees']));
        }
        
        if (setup.shiftTemplates?.length > 0) {
          setShiftTemplates(setup.shiftTemplates.map((template: any) => ({
            workTypeId: template.workTypeId,
            days: Object.entries(template.days)
              .filter(([_, active]) => active)
              .map(([day]) => day),
            startTime: template.startTime,
            endTime: template.endTime
          })));
          setCompletedSteps(prev => new Set([...prev, 'shifts']));
        }
        
        setIsLoading(false);
      } catch (e) {
        setError("Unable to load setup data.");
        setIsLoading(false);
      }
    }

    bootstrap();
  }, [router]);

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 'store':
        return !!(storeData.name && storeData.city);
      case 'workTypes':
        return workTypes.length > 0 && workTypes.every(wt => wt.name.trim());
      case 'employees':
        return true; // Optional step
      case 'shifts':
        return true; // Optional step
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!validateCurrentStep()) {
      setError("Please complete the required fields before continuing");
      return;
    }
    
    setError(null);
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    
    const currentIndex = STEPS.findIndex(step => step.key === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].key as SetupStep);
    }
  };

  const handlePrevious = () => {
    const currentIndex = STEPS.findIndex(step => step.key === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].key as SetupStep);
    }
  };

  const handleStepClick = (stepKey: SetupStep) => {
    setCurrentStep(stepKey);
    setError(null);
  };

  const addWorkType = () => {
    setWorkTypes([...workTypes, { 
      name: '', 
      color: COLORS[workTypes.length % COLORS.length] 
    }]);
  };

  const updateWorkType = (index: number, field: keyof WorkType, value: string) => {
    const updated = [...workTypes];
    updated[index] = { ...updated[index], [field]: value };
    setWorkTypes(updated);
  };

  const removeWorkType = (index: number) => {
    setWorkTypes(workTypes.filter((_, i) => i !== index));
  };

  const addEmployee = () => {
    setEmployees([...employees, {
      name: '',
      email: '',
      phone: '',
      contractType: 'PART_TIME',
      color: COLORS[employees.length % COLORS.length],
      workTypeIds: []
    }]);
  };

  const updateEmployee = (index: number, field: keyof Employee, value: any) => {
    const updated = [...employees];
    updated[index] = { ...updated[index], [field]: value };
    setEmployees(updated);
  };

  const removeEmployee = (index: number) => {
    setEmployees(employees.filter((_, i) => i !== index));
  };

  const addShiftTemplate = () => {
    setShiftTemplates([...shiftTemplates, {
      workTypeId: workTypes[0]?.id || '',
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      startTime: '09:00',
      endTime: '17:00'
    }]);
  };

  const updateShiftTemplate = (index: number, field: keyof ShiftTemplate, value: any) => {
    const updated = [...shiftTemplates];
    updated[index] = { ...updated[index], [field]: value };
    setShiftTemplates(updated);
  };

  const removeShiftTemplate = (index: number) => {
    setShiftTemplates(shiftTemplates.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    if (!storeData.name || !storeData.city) {
      setError("Please complete store details first");
      return;
    }

    if (workTypes.length === 0 || workTypes.some(wt => !wt.name)) {
      setError("Please add at least one work type with a name");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Create store
      const storeRes = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storeData),
      });
      
      if (!storeRes.ok) {
        const data = await storeRes.json();
        throw new Error(data.error || "Failed to create store");
      }

      const storeResponse = await storeRes.json();
      const storeId = storeResponse.store?.id;

      if (!storeId) {
        throw new Error("Store ID not found after creation");
      }

      // 2. Create work types
      const workTypeRes = await fetch("/api/work-types/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workTypes }),
      });
      
      if (!workTypeRes.ok) {
        const data = await workTypeRes.json();
        throw new Error(data.error || "Failed to create work types");
      }
      
      const { workTypes: createdWorkTypes } = await workTypeRes.json();

      // 3. Create employees (if any)
      if (employees.length > 0) {
        const employeesWithWorkTypes = employees.map(emp => ({
          ...emp,
          workTypeIds: emp.workTypeIds.length > 0 
            ? emp.workTypeIds 
            : createdWorkTypes.map((wt: any) => wt.id)
        }));

        const employeeRes = await fetch("/api/employees/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employees: employeesWithWorkTypes }),
        });
        
        if (!employeeRes.ok) {
          const data = await employeeRes.json();
          throw new Error(data.error || "Failed to create employees");
        }
      }

      // 4. Create shift templates (if any)
      if (shiftTemplates.length > 0) {
        const templatesWithWorkTypes = shiftTemplates.map(template => {
          // Find the correct work type ID
          let workTypeId = template.workTypeId;
          
          // If workTypeId is a number (index), get the actual ID from createdWorkTypes
          if (!workTypeId || !isNaN(Number(workTypeId))) {
            const index = Number(workTypeId) || 0;
            workTypeId = createdWorkTypes[index]?.id || createdWorkTypes[0]?.id;
          }
          
          return {
            workTypeId: workTypeId,
            startTime: template.startTime,
            endTime: template.endTime,
            days: {
              MON: template.days.includes('MON'),
              TUE: template.days.includes('TUE'),
              WED: template.days.includes('WED'),
              THU: template.days.includes('THU'),
              FRI: template.days.includes('FRI'),
              SAT: template.days.includes('SAT'),
              SUN: template.days.includes('SUN'),
            }
          };
        });

        const templateRes = await fetch("/api/shift-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            storeId: storeId,
            templates: templatesWithWorkTypes 
          }),
        });
        
        if (!templateRes.ok) {
          const data = await templateRes.json();
          throw new Error(data.error || "Failed to create shift templates");
        }
      } else {
        // No shift templates to create, but we still need to mark setup as complete
        // Call the shift-templates endpoint with empty templates to advance onboarding step
        const templateRes = await fetch("/api/shift-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            storeId: storeId,
            templates: [] 
          }),
        });
        
        if (!templateRes.ok) {
          const data = await templateRes.json();
          throw new Error(data.error || "Failed to complete setup");
        }
      }

      // Success - redirect to schedule
      router.push("/schedule");
      
    } catch (e: any) {
      setError(e.message || "Failed to complete setup");
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 py-10">
        <div className="mx-auto max-w-4xl space-y-6 px-6">
          <div className="h-6 w-32 animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-72 animate-pulse rounded-full bg-slate-200" />
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-4">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  const currentStepIndex = STEPS.findIndex(step => step.key === currentStep);
  const isLastStep = currentStepIndex === STEPS.length - 1;

  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-4xl space-y-8 px-6">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Setup Wizard</p>
          <h1 className="text-3xl font-semibold text-slate-900">Let&apos;s get your store ready</h1>
          <p className="text-sm text-slate-600">
            Follow the steps below to set up your schedule management system.
          </p>
        </header>

        {/* Progress Roadmap */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isActive = step.key === currentStep;
              const isCompleted = completedSteps.has(step.key as SetupStep);
              const isClickable = index <= currentStepIndex || isCompleted;
              
              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => isClickable && handleStepClick(step.key as SetupStep)}
                      disabled={!isClickable}
                      className={`
                        flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors
                        ${isActive 
                          ? 'bg-slate-900 text-white' 
                          : isCompleted 
                            ? 'bg-green-500 text-white' 
                            : isClickable
                              ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              : 'bg-slate-100 text-slate-400'
                        }
                        ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}
                      `}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </button>
                    <div className="mt-2 text-center">
                      <p className={`text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                        {step.title}
                      </p>
                      <p className="text-xs text-slate-500 max-w-24">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  
                  {index < STEPS.length - 1 && (
                    <div className={`
                      h-px w-16 mx-4 mt-[-2rem]
                      ${completedSteps.has(STEPS[index + 1].key as SetupStep) || index < currentStepIndex
                        ? 'bg-green-500' 
                        : 'bg-slate-200'
                      }
                    `} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Step Content */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {currentStep === 'store' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Store Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="store-name">Store name *</label>
                  <input
                    id="store-name"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="eg. Tachora Antwerp"
                    value={storeData.name}
                    onChange={(e) => setStoreData({...storeData, name: e.target.value})}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700" htmlFor="store-city">City *</label>
                    <select
                      id="store-city"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={storeData.city}
                      onChange={(e) => setStoreData({...storeData, city: e.target.value})}
                    >
                      <option value="">Select a city</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700" htmlFor="store-opening">Opening time</label>
                    <input
                      type="time"
                      id="store-opening"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      value={storeData.openingTime}
                      onChange={(e) => setStoreData({...storeData, openingTime: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="store-address">Address</label>
                  <textarea
                    id="store-address"
                    className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Street + number, postal code"
                    value={storeData.address}
                    onChange={(e) => setStoreData({...storeData, address: e.target.value})}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 'workTypes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Work Types</h2>
                <button
                  type="button"
                  onClick={addWorkType}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Add Work Type
                </button>
              </div>
              
              <div className="space-y-3">
                {workTypes.map((workType, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Work type name (e.g., Cashier, Stock)"
                      value={workType.name}
                      onChange={(e) => updateWorkType(index, 'name', e.target.value)}
                    />
                    <input
                      type="color"
                      className="w-12 h-10 rounded border border-slate-200"
                      value={workType.color}
                      onChange={(e) => updateWorkType(index, 'color', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeWorkType(index)}
                      className="text-red-600 hover:text-red-800 px-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'employees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Employees</h2>
                  <p className="text-sm text-slate-600">Add your team members (optional - you can do this later)</p>
                </div>
                <button
                  type="button"
                  onClick={addEmployee}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Add Employee
                </button>
              </div>
              
              <div className="space-y-4">
                {employees.map((employee, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <input
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Full name"
                        value={employee.name}
                        onChange={(e) => updateEmployee(index, 'name', e.target.value)}
                      />
                      <input
                        type="email"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Email"
                        value={employee.email}
                        onChange={(e) => updateEmployee(index, 'email', e.target.value)}
                      />
                      <input
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Phone"
                        value={employee.phone}
                        onChange={(e) => updateEmployee(index, 'phone', e.target.value)}
                      />
                      <select
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={employee.contractType}
                        onChange={(e) => updateEmployee(index, 'contractType', e.target.value)}
                      >
                        {CONTRACT_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                      <input
                        type="color"
                        className="w-full h-10 rounded border border-slate-200"
                        value={employee.color}
                        onChange={(e) => updateEmployee(index, 'color', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeEmployee(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove Employee
                      </button>
                    </div>
                  </div>
                ))}
                {employees.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No employees added yet. You can skip this step and add them later.
                  </p>
                )}
              </div>
            </div>
          )}

          {currentStep === 'shifts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Shift Templates</h2>
                  <p className="text-sm text-slate-600">Create recurring shift patterns (optional - you can do this later)</p>
                </div>
                <button
                  type="button"
                  onClick={addShiftTemplate}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                  disabled={workTypes.length === 0}
                >
                  Add Shift Template
                </button>
              </div>
              
              <div className="space-y-4">
                {shiftTemplates.map((template, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
                      <select
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={template.workTypeId}
                        onChange={(e) => updateShiftTemplate(index, 'workTypeId', e.target.value)}
                      >
                        <option value="">Select work type</option>
                        {workTypes.map((wt, wtIndex) => (
                          <option key={wtIndex} value={wt.id || wtIndex.toString()}>
                            {wt.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={template.startTime}
                        onChange={(e) => updateShiftTemplate(index, 'startTime', e.target.value)}
                      />
                      <input
                        type="time"
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={template.endTime}
                        onChange={(e) => updateShiftTemplate(index, 'endTime', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeShiftTemplate(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map(day => (
                        <label key={day.key} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={template.days.includes(day.key)}
                            onChange={(e) => {
                              const days = e.target.checked
                                ? [...template.days, day.key]
                                : template.days.filter(d => d !== day.key);
                              updateShiftTemplate(index, 'days', days);
                            }}
                          />
                          {day.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {shiftTemplates.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No shift templates added yet. You can skip this step and create them later.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStepIndex === 0}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          {isLastStep ? (
            <button
              type="button"
              onClick={handleComplete}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-800"
            >
              {saving ? "Setting up..." : "Complete Setup & Go to Schedule"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
