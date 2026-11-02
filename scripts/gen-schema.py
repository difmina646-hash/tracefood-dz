#!/usr/bin/env python3
"""Generates server/prisma/schema.prisma from a compact model DSL.

Why: it guarantees every FK scalar, @relation name and inverse relation field is consistent
across ~65 models. Python is only needed to REGENERATE the schema; the generated
schema.prisma is committed, so running the app does not require Python.

Run:  python scripts/gen-schema.py

Line syntax inside a model:
  name Type ...                         scalar (Dec = Decimal(18,4), Txt = Text)
  >field Target [opt] [uniq] [cascade]  relation -> generates fieldId FK + inverse field on Target
  @@...                                 raw model attribute
"""
import re
import pathlib

ENUMS = {
    "CompanyType": "MANUFACTURER SUPPLIER TRANSPORTER RETAILER DISTRIBUTOR PLATFORM",
    "CompanyStatus": "PENDING ACTIVE SUSPENDED REJECTED DEACTIVATED",
    "UserStatus": "ACTIVE SUSPENDED DISABLED",
    "QualityStatus": "PENDING RELEASED BLOCKED REJECTED",
    "Unit": "KG G L ML UNIT POT CARTON PALLET",
    "StockMovementType": "RAW_RECEIPT PRODUCTION_CONSUME PRODUCTION_OUTPUT TRANSFER_OUT TRANSFER_IN SHIPMENT_DISPATCH SHIPMENT_RECEIPT SALE_EXIT DAMAGE ADJUSTMENT RECONCILIATION RESERVE RELEASE_RESERVATION",
    "ShipmentStatus": "DRAFT PLANNED IN_TRANSIT DELIVERED PARTIALLY_RECEIVED RECEIVED CANCELLED INCIDENT",
    "LocationType": "FACTORY WAREHOUSE DISTRIBUTION_CENTER STORE SUPPLIER_SITE",
    "Severity": "LOW MEDIUM HIGH CRITICAL",
    "NcStatus": "OPEN INVESTIGATING ACTION_PLANNED CLOSED",
    "ActionStatus": "PLANNED IN_PROGRESS DONE CANCELLED",
    "OrderStatus": "PLANNED IN_PROGRESS COMPLETED CANCELLED",
    "DocumentKind": "CERTIFICATE LAB_REPORT TECHNICAL_SHEET DELIVERY_NOTE PHOTO OTHER",
    "RequestStatus": "OPEN ANSWERED ACCEPTED DECLINED CLOSED",
    "OfferStatus": "ACTIVE PAUSED SOLD_OUT",
    "ComplaintType": "COMPLAINT SAFETY_SIGNAL QUESTION",
    "ComplaintStatus": "NEW IN_REVIEW RESOLVED REJECTED",
    "ApprovalDecision": "PENDING APPROVED REJECTED",
    "ParamType": "NUMERIC BOOLEAN TEXT",
    "ParamScope": "RAW_MATERIAL FINISHED_PRODUCT BOTH",
    "ConfirmType": "PICKUP DELIVERY",
    "RiskType": "BIOLOGICAL CHEMICAL PHYSICAL ALLERGEN",
    "ReservationStatus": "ACTIVE CONSUMED RELEASED",
}

MODELS = []


def M(name, lines, ts=True):
    MODELS.append((name, [l.strip() for l in lines.strip().splitlines() if l.strip()], ts))


# ───────────── Identity & companies ─────────────
M("Company", """
name String
legalName String?
type CompanyType
status CompanyStatus @default(PENDING)
registrationNumber String? @unique
taxId String?
email String
phone String?
address String?
city String?
wilaya String?
country String @default("DZ")
description Txt?
publicDescription Txt?
history Txt?
logoUrl String?
website String?
@@index([type, status])
""")
M("User", """
email String @unique
passwordHash String
fullName String
phone String?
language String @default("fr")
status UserStatus @default(ACTIVE)
isSuperAdmin Boolean @default(false)
isConsumer Boolean @default(false)
lastLoginAt DateTime?
failedLogins Int @default(0)
lockedUntil DateTime?
""")
M("Role", """
code String @unique
name String
description String?
isProfessional Boolean @default(true)
""")
M("Permission", """
code String @unique
description String?
""", ts=False)
M("RolePermission", """
>role Role cascade
>permission Permission cascade
@@unique([roleId, permissionId])
""", ts=False)
M("UserRole", """
>user User cascade as:roles
>role Role
@@unique([userId, roleId])
""", ts=False)
M("CompanyMembership", """
>company Company as:memberships
>user User cascade as:memberships
>role Role as:memberships
active Boolean @default(true)
@@unique([companyId, userId])
""")
M("CompanyApproval", """
>company Company
decision ApprovalDecision @default(PENDING)
>decidedBy User opt
decidedAt DateTime?
reason Txt?
""")
M("Session", """
>user User cascade
tokenHash String @unique
expiresAt DateTime
revokedAt DateTime?
userAgent String?
ip String?
""")
M("PasswordResetToken", """
>user User cascade
tokenHash String @unique
expiresAt DateTime
usedAt DateTime?
""")
M("Certification", """
>company Company
name String
issuer String?
number String?
validFrom DateTime?
validTo DateTime?
verified Boolean @default(false)
>verifiedBy User opt
>document UploadedDocument opt
""")
M("CompanySetting", """
>company Company
key String
value Json
@@unique([companyId, key])
""")

# ───────────── Suppliers & procurement ─────────────
M("Supplier", """
>company Company
>linkedCompany Company opt
name String
contactName String?
email String?
phone String?
address String?
wilaya String?
approved Boolean @default(true)
notes Txt?
@@unique([companyId, name])
""")
M("SupplierOffer", """
>company Company
title String
category String
description Txt?
specifications Txt?
quantityAvailable Dec
unit Unit
unitPrice Dec?
currency String @default("DZD")
wilaya String?
status OfferStatus @default(ACTIVE)
@@index([category, status])
""")
M("SupplierRequest", """
>offer SupplierOffer
>requesterCompany Company
>requestedBy User
quantity Dec?
unit Unit?
message Txt
response Txt?
status RequestStatus @default(OPEN)
""")
M("Material", """
>company Company
code String
name String
category String?
defaultUnit Unit
storageRequirements String?
shelfLifeDays Int?
active Boolean @default(true)
@@unique([companyId, code])
""")
M("MaterialSpecification", """
>material Material cascade as:specifications
parameter String
minValue Dec?
maxValue Dec?
unit String?
notes String?
""")
M("MaterialReception", """
>company Company
>supplier Supplier
receptionNumber String
receivedAt DateTime
>receivedBy User
deliveryNoteNumber String?
vehiclePlate String?
notes Txt?
@@unique([companyId, receptionNumber])
""")
M("MaterialLot", """
>company Company
>material Material
>supplier Supplier
>reception MaterialReception opt
>location Location opt
internalLotNumber String
supplierLotNumber String?
origin String?
receivedQty Dec
remainingQty Dec
unit Unit
receivedAt DateTime
productionDate DateTime?
expiryDate DateTime?
storageRequirements String?
status QualityStatus @default(PENDING)
blockedReason String?
@@unique([companyId, internalLotNumber])
@@index([companyId, supplierLotNumber])
@@index([companyId, status])
""")

# ───────────── Quality ─────────────
M("QualityParameter", """
>company Company
code String
name String
paramType ParamType @default(NUMERIC)
unit String?
minValue Dec?
maxValue Dec?
scope ParamScope @default(BOTH)
mandatory Boolean @default(false)
active Boolean @default(true)
>validatedBy User opt
validatedAt DateTime?
@@unique([companyId, code])
""")
M("QualityCheck", """
>company Company
>materialLot MaterialLot opt
>productionBatch ProductionBatch opt
checkedAt DateTime
>checkedBy User
decision QualityStatus @default(PENDING)
>reviewer User opt
reviewedAt DateTime?
notes Txt?
@@index([companyId, decision])
""")
M("QualityResult", """
>check QualityCheck cascade
>parameter QualityParameter opt
parameterName String
valueNumeric Dec?
valueText String?
unit String?
compliant Boolean?
""")
M("QualityDocument", """
>check QualityCheck cascade
>document UploadedDocument
docType DocumentKind @default(LAB_REPORT)
@@unique([checkId, documentId])
""", ts=False)
M("NonConformity", """
>company Company
code String
title String
description Txt
severity Severity @default(MEDIUM)
status NcStatus @default(OPEN)
>materialLot MaterialLot opt
>productionBatch ProductionBatch opt
detectedAt DateTime
>reportedBy User
closedAt DateTime?
closureNotes Txt?
@@unique([companyId, code])
@@index([companyId, status])
""")
M("CorrectiveAction", """
>nonConformity NonConformity cascade
description Txt
>responsible User opt
dueDate DateTime?
status ActionStatus @default(PLANNED)
completedAt DateTime?
""")
M("PreventiveAction", """
>nonConformity NonConformity cascade
description Txt
>responsible User opt
dueDate DateTime?
status ActionStatus @default(PLANNED)
completedAt DateTime?
""")
M("RiskAssessment", """
>company Company
>product Product opt
title String
scope Txt?
>createdBy User
status String @default("DRAFT")
""")
M("RiskItem", """
>assessment RiskAssessment cascade as:items
processStep String
hazard String
hazardType RiskType
cause Txt?
severity Int
likelihood Int
preventiveMeasure Txt?
isCcp Boolean @default(false)
criticalLimit String?
monitoring String?
correctiveAction Txt?
""")

# ───────────── Production ─────────────
M("Product", """
>company Company
sku String
name String
category String?
description Txt?
publicDescription Txt?
manufacturingSummary Txt?
shelfLifeDays Int
unit Unit @default(POT)
active Boolean @default(true)
@@unique([companyId, sku])
""")
M("ProductVariant", """
>product Product cascade as:variants
code String
name String
@@unique([productId, code])
""")
M("Recipe", """
>company Company
>product Product
version Int @default(1)
name String
outputQty Dec
outputUnit Unit
active Boolean @default(true)
@@unique([productId, version])
""")
M("RecipeIngredient", """
>recipe Recipe cascade as:ingredients
>material Material
quantity Dec
unit Unit
""")
M("ProductionOrder", """
>company Company
orderNumber String
>product Product
>variant ProductVariant opt
>recipe Recipe opt
plannedQty Dec
unit Unit
plannedDate DateTime
status OrderStatus @default(PLANNED)
>createdBy User
@@unique([companyId, orderNumber])
""")
M("ProductionBatch", """
>company Company
>product Product
>variant ProductVariant opt
>order ProductionOrder opt
>factoryLocation Location opt
batchNumber String
producedAt DateTime
producedQty Dec
unit Unit
expiryDate DateTime
status QualityStatus @default(PENDING)
blockedReason String?
>createdBy User
>releasedBy User opt
releasedAt DateTime?
notes Txt?
@@unique([companyId, batchNumber])
@@index([companyId, status])
@@index([companyId, expiryDate])
""")
M("BatchMaterial", """
>batch ProductionBatch
>materialLot MaterialLot
quantity Dec
unit Unit
@@unique([batchId, materialLotId])
""")
M("ProductionStep", """
>batch ProductionBatch cascade
stepOrder Int
name String
startedAt DateTime?
endedAt DateTime?
temperatureC Dec?
durationMin Int?
>operator User opt
notes Txt?
""")

# ───────────── Logistics & inventory ─────────────
M("Location", """
>company Company
name String
type LocationType
address String?
city String?
wilaya String?
latitude Float?
longitude Float?
active Boolean @default(true)
@@unique([companyId, name])
""")
M("Warehouse", """
>location Location uniq
capacity Dec?
temperatureZone String?
minTempC Dec?
maxTempC Dec?
""")
M("RetailStore", """
>company Company
>location Location uniq
name String
openingHours String?
phone String?
publicListing Boolean @default(true)
""")
M("InventoryBalance", """
>company Company
>location Location
>batch ProductionBatch
quantity Dec
reservedQty Dec @default(0)
unit Unit
@@unique([locationId, batchId])
@@index([companyId, batchId])
""")
M("StockReservation", """
>company Company
>balance InventoryBalance
>shipment Shipment opt
quantity Dec
status ReservationStatus @default(ACTIVE)
>createdBy User
""")
M("StockMovement", """
>company Company
type StockMovementType
>batch ProductionBatch opt
>materialLot MaterialLot opt
>fromLocation Location opt
>toLocation Location opt
>shipment Shipment opt
quantity Dec
unit Unit
reason String?
>createdBy User
@@index([companyId, type, createdAt])
""", ts=False)
M("Transporter", """
>company Company
>linkedCompany Company opt
name String
phone String?
vehicleInfo String?
refrigerated Boolean @default(false)
@@unique([companyId, name])
""")
M("Shipment", """
>company Company
shipmentNumber String
>fromLocation Location
>toLocation Location
>transporter Transporter opt
status ShipmentStatus @default(DRAFT)
plannedAt DateTime?
dispatchedAt DateTime?
deliveredAt DateTime?
notes Txt?
>createdBy User
@@unique([companyId, shipmentNumber])
@@index([toLocationId, status])
""")
M("ShipmentItem", """
>shipment Shipment cascade as:items
>batch ProductionBatch
quantity Dec
receivedQty Dec?
damagedQty Dec @default(0)
unit Unit
@@unique([shipmentId, batchId])
""", ts=False)
M("ShipmentEvent", """
>shipment Shipment cascade as:events
type String
message String?
latitude Float?
longitude Float?
>createdBy User opt
""", ts=False)
M("TransportCondition", """
>shipment Shipment uniq cascade
minTempC Dec?
maxTempC Dec?
notes String?
""")
M("TemperatureRecord", """
>shipment Shipment cascade
recordedAt DateTime
temperatureC Dec
deviceId String?
outOfRange Boolean @default(false)
""", ts=False)
M("DeliveryConfirmation", """
>shipment Shipment cascade
confirmType ConfirmType
>confirmedBy User
confirmedAt DateTime
signatureName String?
notes String?
""", ts=False)
M("RetailReceipt", """
>company Company
>shipment Shipment
>receivedBy User
receivedAt DateTime
notes Txt?
@@unique([companyId, shipmentId])
""", ts=False)
M("Promotion", """
>company Company
>retailStore RetailStore opt
title String
description Txt?
conditions Txt?
discountPercent Dec?
startsAt DateTime
endsAt DateTime
active Boolean @default(true)
""")
M("PromotionProduct", """
>promotion Promotion cascade
>product Product
@@unique([promotionId, productId])
""", ts=False)

# ───────────── Consumers ─────────────
M("ConsumerProfile", """
>user User uniq cascade as:consumerProfile
displayName String
age Int?
showNamePublicly Boolean @default(false)
""")
M("ProductQrCode", """
>company Company
>batch ProductionBatch
publicId String @unique
active Boolean @default(true)
scanCount Int @default(0)
lastScannedAt DateTime?
""")
M("ConsumerReview", """
>product Product
>batch ProductionBatch opt
>consumer User opt
rating Int
comment Txt?
visible Boolean @default(true)
""")
M("ConsumerComplaint", """
>company Company
>batch ProductionBatch opt
>qrCode ProductQrCode opt
>consumer User opt
type ComplaintType @default(COMPLAINT)
message Txt
contactEmail String?
status ComplaintStatus @default(NEW)
internalNotes Txt?
""")

# ───────────── Platform ─────────────
M("UploadedDocument", """
>company Company
>uploadedBy User
originalName String
storedName String @unique
mimeType String
sizeBytes Int
sha256 String
kind DocumentKind @default(OTHER)
>materialLot MaterialLot opt
>productionBatch ProductionBatch opt
>nonConformity NonConformity opt
>offer SupplierOffer opt
""", ts=False)
M("Message", """
>senderCompany Company
>recipientCompany Company
>sender User
>shipment Shipment opt
>request SupplierRequest opt
body Txt
readAt DateTime?
""", ts=False)
M("Notification", """
>company Company opt
>user User opt
type String
severity Severity @default(LOW)
title String
message Txt?
entity String?
entityId String?
readAt DateTime?
@@index([userId, readAt])
@@index([companyId, createdAt])
""", ts=False)
M("RecallSimulation", """
>company Company
>nonConformity NonConformity opt
rootType String
rootId String
>createdBy User
result Json
affectedBatches Int
affectedShipments Int
affectedLocations Int
notes Txt?
""", ts=False)
M("AuditLog", """
>company Company opt
>user User opt
action String
entity String
entityId String?
before Json?
after Json?
ip String?
@@index([companyId, createdAt])
@@index([entity, entityId])
""", ts=False)

# ───────────── generator ─────────────


def lf(s):
    return s[0].lower() + s[1:]


def cap(s):
    return s[0].upper() + s[1:]


def snake(s):
    return re.sub(r"(?<!^)(?=[A-Z])", "_", s).lower()


names = {n for n, _, _ in MODELS}


def plural(w):
    if re.search(r"[^aeiou]y$", w):
        return w[:-1] + "ies"
    if w.endswith(("s", "x", "ch", "sh")):
        return w + "es"
    return w + "s"


# how many relations does each model declare towards each target? (>1 => names must be disambiguated)
rel_count = {}
for _n, _lines, _ in MODELS:
    for _l in _lines:
        if _l.startswith(">"):
            _t = _l[1:].split()[1]
            rel_count[(_n, _t)] = rel_count.get((_n, _t), 0) + 1
back_fields = {n: [] for n in names}
body = {}
for name, lines, ts in MODELS:
    out = ["id String @id @default(uuid()) @db.VarChar(36)"]
    attrs = []
    for l in lines:
        if l.startswith("@@"):
            attrs.append(l)
            continue
        if l.startswith(">"):
            toks = l[1:].split()
            field, target = toks[0], toks[1]
            alias = next((t[3:] for t in toks[2:] if t.startswith("as:")), None)
            flags = {t for t in toks[2:] if not t.startswith("as:")}
            assert target in names, f"{name}.{field}: unknown target {target}"
            opt = "opt" in flags
            uniq = "uniq" in flags
            rname = f"{name}_{field}"
            q = "?" if opt else ""
            on_del = "Cascade" if "cascade" in flags else ("SetNull" if opt else "Restrict")
            out.append(f"{field}Id String{q} {'@unique ' if uniq else ''}@db.VarChar(36)")
            out.append(f'{field} {target}{q} @relation("{rname}", fields: [{field}Id], references: [id], onDelete: {on_del})')
            multi = rel_count[(name, target)] > 1
            if alias:
                back = alias
            elif uniq:
                back = lf(name) + (cap(field) if multi else "")
            else:
                back = plural(lf(name) + (cap(field) if multi else ""))
            if uniq:
                back_fields[target].append(f'{back} {name}? @relation("{rname}")')
            else:
                back_fields[target].append(f'{back} {name}[] @relation("{rname}")')
            continue
        l = re.sub(r"\bDec(\??)(?=\s|$)", r"Decimal\1 @db.Decimal(18, 4)", l)
        l = re.sub(r"\bTxt(\??)(?=\s|$)", r"String\1 @db.Text", l)
        out.append(l)
    out.append("createdAt DateTime @default(now())")
    if ts:
        out.append("updatedAt DateTime @updatedAt")
    body[name] = (out, attrs)

parts = ['''// AUTO-GENERATED by scripts/gen-schema.py — edit the generator, not this file.
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
''']
for en, vals in ENUMS.items():
    parts.append(f"enum {en} {{\n" + "\n".join(f"  {v}" for v in vals.split()) + "\n}\n")
for name, _, _ in MODELS:
    out, attrs = body[name]
    lines = out + back_fields[name]
    block = f"model {name} {{\n" + "\n".join("  " + x for x in lines)
    block += "\n\n" + "\n".join("  " + a for a in attrs) if attrs else ""
    block += f'\n  @@map("{snake(name)}s")\n}}\n'
    parts.append(block)

p = pathlib.Path(__file__).resolve().parent.parent / "server" / "prisma" / "schema.prisma"
p.write_text("\n".join(parts))
print(f"wrote {p} — {len(MODELS)} models, {len(ENUMS)} enums")
