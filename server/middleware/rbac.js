const ROLE_PERMISSIONS = {
  administrator: [
    "*",
    "barangays:read",
    "barangays:write",
    "owners:read",
    "owners:write",
    "establishments:read",
    "establishments:write",
    "tax_records:read",
    "tax_records:write",
    "payments:read",
    "payments:write",
    "reports:read",
    "backup:write",
    "activity_logs:read",
    "dashboard:read",
  ],
  treasurer: [
    "*",
    "barangays:read",
    "barangays:write",
    "owners:read",
    "owners:write",
    "establishments:read",
    "establishments:write",
    "tax_records:read",
    "tax_records:write",
    "payments:read",
    "payments:write",
    "reports:read",
    "backup:write",
    "activity_logs:read",
    "dashboard:read",
  ],
  cashier: ["payments:read", "payments:write", "reports:read", "dashboard:read", "tax_records:read"],
  // Encoder is the general office-staff role: they both RECORD PAYMENTS and
  // MANAGE OWNERS/ESTABLISHMENTS (the office treats these as the same person).
  encoder: [
    "owners:read",
    "owners:write",
    "establishments:read",
    "establishments:write",
    "barangays:read",
    "barangays:write",
    "tax_records:read",
    "tax_records:write",
    "payments:read",
    "payments:write",
    "reports:read",
    "dashboard:read",
  ],
};

export function hasPermission(role, permission) {
  const allowed = ROLE_PERMISSIONS[role] || [];
  if (allowed.includes("*")) return true;
  return allowed.includes(permission);
}

/* Stricter than requirePermission: some actions (managing user accounts) must
   be limited to actual administrators. Note that "treasurer" also carries the
   "*" wildcard, so a plain permission check would let treasurers in too — this
   guard checks the role explicitly. */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (req.user.role !== "administrator") {
    return res.status(403).json({ message: "Administrator access required." });
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
