"use client";

import { ReactNode } from "react";

interface PermissionGateProps {
  permission: "owner" | "admin" | "member";
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const role: PermissionGateProps["permission"] = "owner";

  const hasPermission = checkPermission(role, permission);

  return hasPermission ? <>{children}</> : <>{fallback}</>;
}

function checkPermission(
  userRole: PermissionGateProps["permission"],
  requiredRole: PermissionGateProps["permission"],
): boolean {
  const roles = ["member", "admin", "owner"];
  const userIdx = roles.indexOf(userRole);
  const requiredIdx = roles.indexOf(requiredRole);
  return userIdx >= requiredIdx;
}
