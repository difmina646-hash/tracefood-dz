# API REST — `http://localhost:4000/api`
Authentification : `Authorization: Bearer <token>` (obtenu par `POST /auth/login`). Société active : en-tête optionnel `X-Company-Id` (sinon première société de l'utilisateur). Erreurs : `{ "error": { "code", "message", "details" } }`.

| Domaine | Endpoints | Permission |
|---|---|---|
| Auth | `POST /auth/register-company` · `register-consumer` · `login` · `logout` · `forgot-password` · `reset-password` · `change-password` · `GET /auth/me` | public / connecté |
| Admin | `GET /admin/companies` · `POST /admin/companies/:id/approve\|reject\|suspend\|deactivate` · `GET /admin/users` · `PATCH /admin/users/:id/status` · `GET /admin/audit` · `GET /admin/stats` | `admin:*` |
| Référentiels | `/suppliers` `/materials` `/products` `/quality-parameters` `/transporters` (GET/POST/PUT) · `/recipes` · `/locations` · `/directory/locations` · `POST /quality-parameters/:id/validate` | `master:*` |
| Réception | `POST/GET /receptions` · `GET /lots` · `GET /lots/:id` · `POST /lots/:id/quality-checks` · `POST /lots/:id/block` | `reception:*`, `quality:*` |
| Production | `/production-orders` · `POST/GET /batches` · `GET /batches/:id` · `POST /batches/:id/quality-checks\|block` · `GET /batches/:id/qr?format=png\|svg` | `production:*`, `quality:*` |
| Stock | `GET /inventory` · `/inventory/fefo` · `/stock-movements` · `POST /inventory/transfer\|damage\|sale-exit\|reconcile\|adjust` | `inventory:*` |
| Expéditions | `POST/GET /shipments` · `POST /shipments/:id/dispatch\|cancel\|pickup\|deliver\|events\|temperature\|receive` | `shipment:*` |
| Traçabilité | `GET /trace/search?q=` · `/trace/lots/:id/forward` · `/trace/batches/:id/forward\|backward` · `/trace/shipments/:id/backward` · `/trace/received/:batchNumber` | `trace:read` |
| Incidents | `/incidents` · `PATCH /incidents/:id/status` · `/incidents/:id/corrective-actions\|preventive-actions` · `POST /incidents/:id/recall-simulation` · `POST /incidents/:id/hold` · `GET /incidents/:id/report` · `/complaints` · `/risk-assessments` | `incident:*`, `recall:*`, `risk:write` |
| Marché fournisseurs | `/offers` `/offers/mine` `POST /offers/:id/requests` `/requests` `POST /requests/:id/respond` `/messages` | `offer:write`, `request:write` |
| Promotions | `/promotions` | `promotion:write` |
| Documents | `POST /documents` (multipart, PDF/PNG/JPEG ≤ 10 Mo, contrôle des octets magiques) · `GET /documents/:id/download` | `document:write` |
| Tableau de bord | `GET /dashboard` · `GET /notifications` | selon société |
| **Public (sans connexion)** | `GET /public/qr/:publicId` · `POST /public/qr/:publicId/feedback` | limité par débit |
