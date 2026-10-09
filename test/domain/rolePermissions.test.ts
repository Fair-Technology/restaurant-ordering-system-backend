import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, permissionsForRole } from '../../src/domain/system/RolePermissions';

describe('permissionsForRole', () => {
  it('owner gets every permission', () => {
    const result = permissionsForRole('owner', { manager: [], staff: [] });
    expect(result).toHaveLength(8);
  });

  it('manager with defaults', () => {
    const result = permissionsForRole('manager', {
      manager: ['view_orders', 'manage_menu', 'manage_staff', 'view_audit'],
      staff: ['view_orders'],
    });
    expect(result).toEqual(['view_orders', 'manage_menu', 'manage_staff', 'view_audit']);
  });

  it('managers can refund by default', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.manager).toContain('refund_orders');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('refund_orders');
  });

  it('staff with defaults', () => {
    const result = permissionsForRole('staff', {
      manager: ['view_orders', 'manage_menu', 'manage_staff', 'view_audit'],
      staff: ['view_orders'],
    });
    expect(result).toEqual(['view_orders']);
  });

  it('owner ignores the stored doc', () => {
    const result = permissionsForRole('owner', { manager: [], staff: [] });
    expect(result).toHaveLength(8);
  });

  it('managers see reports by default, staff never', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.manager).toContain('view_reports');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('view_reports');
  });
});
