export type UserRole = 'employee' | 'manager' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  photoUrl?: string;
  role: UserRole;
  facilityId?: string;
  createdAt: string;
  active: boolean;
}

export interface Facility {
  id: string;
  name: string;
  location: string;
  qrCodeUrl?: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
  order: number;
  active: boolean;
}

export interface JobFunction {
  id: string;
  name: string;
  categoryId: string;
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Allocation {
  functionId: string;
  functionName: string;
  percentage: number;
}

export interface RecentFunction {
  functionId: string;
  functionName: string;
  categoryName: string;
  lastUsedPercentage: number;
  lastShiftDate: string; // ISO date string
}

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy: number;  // metres
  timestamp: string; // ISO
}

export type TimecardStatus = 'checked-in' | 'checked-out' | 'pending-approval';

export interface Timecard {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeEmail?: string;
  facilityId: string;
  facilityName?: string;
  checkInTime: string;
  checkOutTime?: string;
  totalHours?: number;
  remote: boolean;
  approvedBy?: string;
  status: TimecardStatus;
  allocations?: Allocation[];
  checkInLocation?: GeoLocation;
  checkOutLocation?: GeoLocation;
  createdAt: string;
  // Manual entry fields (employee self-reported missed clock-in or clock-out)
  manualEntry?: boolean;
  manualEntryNote?: string;
  // Flag: employee checked out while remote approval was still pending
  remotePendingAtCheckout?: boolean;
  // Flag: long-shift alert email has been sent (prevents duplicate sends)
  sentLongShiftAlert?: boolean;
  // Manager edit tracking
  editedBy?: string;
  editedAt?: string;
  editNote?: string;
  allocationsEdited?: boolean;
}

export interface TaxonomyNode extends Category {
  functions: JobFunction[];
}

export type LeaveType = 'pto' | 'sick';
export type LeaveStatus = 'pending' | 'approved' | 'denied';

export interface LeaveDate {
  date: string; // YYYY-MM-DD
  hours: number;
}

export interface LeaveAdjustment {
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  type: LeaveType;
  dates: LeaveDate[];
  totalHours: number;
  status: LeaveStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  denialReason?: string;
  isRetroactive: boolean;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  year: number;
  ptoTotal: number;
  ptoUsed: number;
  ptoAdjustments: LeaveAdjustment[];
  sickTotal: number;
  sickUsed: number;
  sickAdjustments: LeaveAdjustment[];
  updatedAt: string;
}

export interface StaffingWorker {
  id: string;
  name: string;
  createdBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Extend Timecard for staffing worker fields
export interface StaffingTimecard extends Timecard {
  isStaffingWorker?: boolean;
  staffingWorkerId?: string;
  staffingWorkerName?: string;
  loggedBy?: string;
  loggedByName?: string;
}
