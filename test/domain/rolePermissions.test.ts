import { describe, it, expect } from 'vitest';
import { permissionsForRole } from '../../src/domain/system/RolePermissions';

describe('permissionsForRole', () => {
  it('owner gets every permission', () => {
    const result = permissionsForRole('owner', { manager: [], staff: [] });
    expect(result).toHaveLength(6);
  });

  it('manager with defaults', () => {
    const result = permissionsForRole('manager', {
      manager: ['view_orders', 'manage_menu', 'manage_staff', 'view_audit'],
      staff: ['view_orders'],
    });
    expect(result).toEqual(['view_orders', 'manage_menu', 'manage_staff', 'view_audit']);
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
    expect(result).toHaveLength(6);
  });
});
