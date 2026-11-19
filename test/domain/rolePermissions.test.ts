import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, permissionsForRole } from '../../src/domain/system/RolePermissions';
import { ALL_SHOP_PERMISSIONS } from '../../src/domain/shop/Shop';

describe('permissionsForRole', () => {
  it('owner gets every permission', () => {
    const result = permissionsForRole('owner', { manager: [], staff: [] });
    expect(result).toEqual([...ALL_SHOP_PERMISSIONS]);
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
    expect(result).toEqual([...ALL_SHOP_PERMISSIONS]);
  });

  it('managers and staff can mark a dish sold out by default (spec §11)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.manager).toContain('manage_stock');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).toContain('manage_stock');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('manage_menu');
  });

  it('managers see reports by default, staff never', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.manager).toContain('view_reports');
    expect(DEFAULT_ROLE_PERMISSIONS.staff).not.toContain('view_reports');
  });
});
