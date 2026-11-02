/** Single source of truth for roles & permissions (used by the seed, the API guards and the tests). */
export const PERMISSIONS = [
  'master:read', 'master:write', 'reception:read', 'reception:write',
  'quality:read', 'quality:write', 'quality:release',
  'production:read', 'production:write', 'inventory:read', 'inventory:write',
  'shipment:read', 'shipment:create', 'shipment:receive', 'shipment:update',
  'trace:read', 'incident:read', 'incident:write', 'recall:simulate', 'recall:hold', 'risk:write',
  'offer:write', 'request:read', 'request:write', 'promotion:write',
  'report:read', 'document:write', 'message:write', 'complaint:read',
  'admin:companies', 'admin:users', 'admin:audit',
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];

const MANUFACTURER_ALL: PermissionCode[] = [
  'master:read', 'master:write', 'reception:read', 'reception:write', 'quality:read', 'quality:write',
  'production:read', 'production:write', 'inventory:read', 'inventory:write', 'shipment:read', 'shipment:create',
  'trace:read', 'incident:read', 'report:read', 'document:write', 'message:write', 'request:write', 'complaint:read',
];

export const ROLES: Record<string, { name: string; professional: boolean; companyTypes: string[]; permissions: PermissionCode[] }> = {
  SUPER_ADMIN: { name: 'Super administrateur', professional: true, companyTypes: ['PLATFORM'], permissions: ['admin:companies', 'admin:users', 'admin:audit', 'report:read'] },
  // Release/blocking decisions are reserved for qualified roles (quality:release) — not for plain operators.
  MANUFACTURER_ADMIN: { name: 'Administrateur fabricant', professional: true, companyTypes: ['MANUFACTURER'], permissions: [...MANUFACTURER_ALL, 'quality:release', 'incident:write', 'recall:simulate', 'recall:hold'] },
  PRODUCTION_OPERATOR: { name: 'Opérateur production', professional: true, companyTypes: ['MANUFACTURER'], permissions: ['master:read', 'reception:read', 'reception:write', 'quality:read', 'production:read', 'production:write', 'inventory:read', 'inventory:write', 'shipment:read', 'shipment:create', 'trace:read', 'document:write'] },
  QUALITY_MANAGER: { name: 'Responsable qualité', professional: true, companyTypes: ['MANUFACTURER'], permissions: ['master:read', 'reception:read', 'quality:read', 'quality:write', 'quality:release', 'production:read', 'inventory:read', 'shipment:read', 'trace:read', 'incident:read', 'incident:write', 'recall:simulate', 'recall:hold', 'risk:write', 'report:read', 'document:write', 'complaint:read'] },
  SUPPLIER_ADMIN: { name: 'Fournisseur', professional: true, companyTypes: ['SUPPLIER'], permissions: ['offer:write', 'request:read', 'message:write', 'document:write', 'report:read'] },
  TRANSPORTER: { name: 'Transporteur', professional: true, companyTypes: ['TRANSPORTER'], permissions: ['shipment:read', 'shipment:update', 'message:write', 'report:read'] },
  RETAIL_MANAGER: { name: 'Responsable point de vente', professional: true, companyTypes: ['RETAILER'], permissions: ['inventory:read', 'inventory:write', 'shipment:read', 'shipment:receive', 'trace:read', 'promotion:write', 'message:write', 'report:read'] },
  DISTRIBUTOR_MANAGER: { name: 'Responsable distribution', professional: true, companyTypes: ['DISTRIBUTOR'], permissions: ['inventory:read', 'inventory:write', 'shipment:read', 'shipment:create', 'shipment:receive', 'trace:read', 'message:write', 'report:read'] },
  CONSUMER: { name: 'Consommateur', professional: false, companyTypes: [], permissions: [] },
};

/** Role assigned to the first user who registers a company of the given type. */
export const ADMIN_ROLE_FOR_COMPANY_TYPE: Record<string, string> = {
  MANUFACTURER: 'MANUFACTURER_ADMIN', SUPPLIER: 'SUPPLIER_ADMIN', TRANSPORTER: 'TRANSPORTER', RETAILER: 'RETAIL_MANAGER', DISTRIBUTOR: 'DISTRIBUTOR_MANAGER',
};
