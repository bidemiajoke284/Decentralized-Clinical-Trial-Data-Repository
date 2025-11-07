// AccessControl.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, someCV, noneCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TRIAL_ID = 101;
const ERR_INVALID_SUBMISSION_ID = 102;
const ERR_INVALID_PRINCIPAL = 103;
const ERR_INVALID_ROLE = 104;
const ERR_ROLE_ALREADY_ASSIGNED = 105;
const ERR_ROLE_NOT_FOUND = 106;
const ERR_INVALID_PERMISSION = 107;
const ERR_PERMISSION_ALREADY_GRANTED = 108;
const ERR_PERMISSION_NOT_FOUND = 109;
const ERR_INVALID_EXPIRY = 110;
const ERR_SELF_ASSIGNMENT = 123;
const ERR_SELF_REVOCATION = 124;
const ERR_MAX_ROLES_EXCEEDED = 120;
const ERR_MAX_PERMISSIONS_EXCEEDED = 121;
const ERR_INVALID_ROLE_TYPE = 118;
const ERR_INVALID_ACTION = 130;
const ERR_INVALID_RESOURCE = 129;
const ERR_AUTHORITY_NOT_SET = 113;

interface Role {
  trialId: number;
  principal: string;
  roleType: string;
  assignedAt: number;
  expiresAt: number | null;
  status: boolean;
  assigner: string;
}

interface Permission {
  trialId: number;
  submissionId: number | null;
  principal: string;
  action: string;
  resource: string;
  grantedAt: number;
  expiresAt: number | null;
  status: boolean;
  granter: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AccessControlMock {
  state: {
    nextRoleId: number;
    nextPermissionId: number;
    maxRoles: number;
    maxPermissions: number;
    authorityContract: string | null;
    roles: Map<number, Role>;
    permissions: Map<number, Permission>;
    rolesByPrincipalTrial: Map<string, number[]>;
    permissionsByPrincipalTrial: Map<string, number[]>;
  } = {
    nextRoleId: 0,
    nextPermissionId: 0,
    maxRoles: 1000,
    maxPermissions: 5000,
    authorityContract: null,
    roles: new Map(),
    permissions: new Map(),
    rolesByPrincipalTrial: new Map(),
    permissionsByPrincipalTrial: new Map(),
  };
  blockHeight: number = 1000;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextRoleId: 0,
      nextPermissionId: 0,
      maxRoles: 1000,
      maxPermissions: 5000,
      authorityContract: null,
      roles: new Map(),
      permissions: new Map(),
      rolesByPrincipalTrial: new Map(),
      permissionsByPrincipalTrial: new Map(),
    };
    this.blockHeight = 1000;
    this.caller = "ST1TEST";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  assignRole(
    trialId: number,
    targetPrincipal: string,
    roleType: string,
    expiresAt: number | null
  ): Result<number> {
    if (this.state.nextRoleId >= this.state.maxRoles) return { ok: false, value: ERR_MAX_ROLES_EXCEEDED };
    if (trialId <= 0) return { ok: false, value: ERR_INVALID_TRIAL_ID };
    if (targetPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (!["sponsor", "researcher", "regulator", "auditor"].includes(roleType)) return { ok: false, value: ERR_INVALID_ROLE_TYPE };
    if (expiresAt !== null && expiresAt < this.blockHeight + 100) return { ok: false, value: 110 };
    if (targetPrincipal === this.caller) return { ok: false, value: ERR_SELF_ASSIGNMENT };

    const key = `${targetPrincipal}-${trialId}`;
    const existing = this.state.rolesByPrincipalTrial.get(key) || [];
    if (existing.some(id => {
      const r = this.state.roles.get(id);
      return r?.roleType === roleType && r?.status;
    })) return { ok: false, value: ERR_ROLE_ALREADY_ASSIGNED };

    const id = this.state.nextRoleId;
    const role: Role = {
      trialId,
      principal: targetPrincipal,
      roleType,
      assignedAt: this.blockHeight,
      expiresAt,
      status: true,
      assigner: this.caller,
    };
    this.state.roles.set(id, role);
    this.state.rolesByPrincipalTrial.set(key, [...existing, id]);
    this.state.nextRoleId++;
    return { ok: true, value: id };
  }

  revokeRole(roleId: number): Result<boolean> {
    const role = this.state.roles.get(roleId);
    if (!role) return { ok: false, value: false };
    if (role.assigner !== this.caller && !this.state.authorityContract) return { ok: false, value: false };
    if (role.principal === this.caller) return { ok: false, value: ERR_SELF_REVOCATION };

    this.state.roles.set(roleId, { ...role, status: false });
    return { ok: true, value: true };
  }

  grantPermission(
    trialId: number,
    submissionId: number | null,
    targetPrincipal: string,
    action: string,
    resource: string,
    expiresAt: number | null
  ): Result<number> {
    if (this.state.nextPermissionId >= this.state.maxPermissions) return { ok: false, value: ERR_MAX_PERMISSIONS_EXCEEDED };
    if (trialId <= 0) return { ok: false, value: ERR_INVALID_TRIAL_ID };
    if (submissionId !== null && submissionId <= 0) return { ok: false, value: ERR_INVALID_SUBMISSION_ID };
    if (targetPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_PRINCIPAL };
    if (!["read", "write", "verify", "submit"].includes(action)) return { ok: false, value: ERR_INVALID_ACTION };
    if (!["trial", "submission", "metadata", "report"].includes(resource)) return { ok: false, value: ERR_INVALID_RESOURCE };
    if (expiresAt !== null && expiresAt < this.blockHeight + 100) return { ok: false, value: 110 };
    if (targetPrincipal === this.caller) return { ok: false, value: ERR_SELF_ASSIGNMENT };

    const id = this.state.nextPermissionId;
    const perm: Permission = {
      trialId,
      submissionId,
      principal: targetPrincipal,
      action,
      resource,
      grantedAt: this.blockHeight,
      expiresAt,
      status: true,
      granter: this.caller,
    };
    this.state.permissions.set(id, perm);
    const key = `${targetPrincipal}-${trialId}`;
    const existing = this.state.permissionsByPrincipalTrial.get(key) || [];
    this.state.permissionsByPrincipalTrial.set(key, [...existing, id]);
    this.state.nextPermissionId++;
    return { ok: true, value: id };
  }

  revokePermission(permissionId: number): Result<boolean> {
    const perm = this.state.permissions.get(permissionId);
    if (!perm) return { ok: false, value: false };
    if (perm.granter !== this.caller && !this.state.authorityContract) return { ok: false, value: false };
    if (perm.principal === this.caller) return { ok: false, value: ERR_SELF_REVOCATION };

    this.state.permissions.set(permissionId, { ...perm, status: false });
    return { ok: true, value: true };
  }

  checkAccess(
    principal: string,
    trialId: number,
    submissionId: number | null,
    action: string,
    resource: string
  ): Result<boolean> {
    const roleKey = `${principal}-${trialId}`;
    const permKey = `${principal}-${trialId}`;
    const roleIds = this.state.rolesByPrincipalTrial.get(roleKey) || [];
    const permIds = this.state.permissionsByPrincipalTrial.get(permKey) || [];

    const hasRole = roleIds.some(id => {
      const r = this.state.roles.get(id);
      return r?.status && r?.roleType === "sponsor" && (r.expiresAt === null || r.expiresAt >= this.blockHeight);
    });

    const hasPerm = permIds.some(id => {
      const p = this.state.permissions.get(id);
      return p?.status && p?.action === action && p?.resource === resource && (p.expiresAt === null || p.expiresAt >= this.blockHeight);
    });

    return { ok: true, value: hasRole || hasPerm };
  }
}

describe("AccessControl", () => {
  let contract: AccessControlMock;

  beforeEach(() => {
    contract = new AccessControlMock();
    contract.reset();
    contract.blockHeight = 1000;
  });

  it("assigns role successfully", () => {
    const result = contract.assignRole(1, "ST2RESEARCHER", "researcher", null);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const key = "ST2RESEARCHER-1";
    const roles = contract.state.rolesByPrincipalTrial.get(key);
    expect(roles).toEqual([0]);
    const role = contract.state.roles.get(0);
    expect(role?.roleType).toBe("researcher");
    expect(role?.status).toBe(true);
  });

  it("rejects self-assignment of role", () => {
    const result = contract.assignRole(1, "ST1TEST", "researcher", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SELF_ASSIGNMENT);
  });

  it("rejects duplicate role type", () => {
    contract.assignRole(1, "ST2RESEARCHER", "researcher", null);
    const result = contract.assignRole(1, "ST2RESEARCHER", "researcher", 2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ROLE_ALREADY_ASSIGNED);
  });

  it("revokes role successfully", () => {
    contract.assignRole(1, "ST2RESEARCHER", "researcher", null);
    contract.caller = "ST1TEST";
    const result = contract.revokeRole(0);
    expect(result.ok).toBe(true);
    const role = contract.state.roles.get(0);
    expect(role?.status).toBe(false);
  });

  it("grants permission successfully", () => {
    const result = contract.grantPermission(1, 5, "ST2USER", "read", "submission", null);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const key = "ST2USER-1";
    const perms = contract.state.permissionsByPrincipalTrial.get(key);
    expect(perms).toEqual([0]);
    const perm = contract.state.permissions.get(0);
    expect(perm?.action).toBe("read");
    expect(perm?.resource).toBe("submission");
  });

  it("checks access via role", () => {
    contract.assignRole(1, "ST2SPONSOR", "sponsor", null);
    const result = contract.checkAccess("ST2SPONSOR", 1, null, "read", "trial");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("checks access via permission", () => {
    contract.grantPermission(1, 5, "ST2USER", "read", "submission", null);
    const result = contract.checkAccess("ST2USER", 1, 5, "read", "submission");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects invalid role type", () => {
    const result = contract.assignRole(1, "ST2USER", "invalid", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE_TYPE);
  });

  it("rejects max roles exceeded", () => {
    contract.state.maxRoles = 1;
    contract.assignRole(1, "ST2USER1", "researcher", null);
    const result = contract.assignRole(1, "ST2USER2", "auditor", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ROLES_EXCEEDED);
  });

  it("handles expiry correctly", () => {
    contract.assignRole(1, "ST2USER", "researcher", 1100);
    contract.blockHeight = 1200;
    const result = contract.checkAccess("ST2USER", 1, null, "read", "trial");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });
});