# NexTalent — Adaptive Onboarding MVP

NexTalent is a small HR dashboard for creating employee onboarding cases, extracting a CV, generating a personalized 30-day onboarding plan through the WF-01 Langflow orchestrator, and asking case-specific questions.

The project intentionally stays simple for a PFE demonstration:

- One seeded HR account.
- Employee profile creation and editing.
- One onboarding case per employee.
- PDF, DOCX, or TXT CV upload.
- Deterministic backend text extraction and lightweight skill detection.
- PostgreSQL for users, employees, cases, document metadata, plans, questions, and agent runs.
- MongoDB for full CV extraction results and raw extracted text.
- Direct HTTPS calls to the Langflow webhook with a configurable long timeout.
- A built-in demo response when no Langflow URL is configured.
- No RabbitMQ, revision workflow, adaptation workflow, manager portal, or employee portal.

## Architecture

```text
Browser dashboard
      │
      ▼
FastAPI REST API ───────────────► PostgreSQL
      │                            users, employees, cases,
      │                            document metadata, runs, plans
      ├──────────────────────────► MongoDB
      │                            CV text + structured extraction
      │
      └──── HTTPS / long timeout ► WF-01 Langflow webhook
                                    │
                                    └── orchestrates Profile,
                                        Knowledge and Planning Agents
```

The browser never calls Langflow directly and never contains the Langflow credential.

## Quick start with Docker

Requirements:

- Docker Desktop or Docker Engine with Compose.
- Node.js 22+ only if running the frontend outside Docker.

The supplied `.env` is already filled with safe local-demo values. Start the databases and API:

```bash
docker compose up --build
```

The API is available at:

```text
http://localhost:8000
http://localhost:8000/docs
http://localhost:8000/health
```

In a second terminal, start the dashboard:

```bash
npm install
npm run dev
```

Open the local URL printed by the frontend process.

Seeded login:

```text
Email:    hr@nextalent.ma
Password: Demo123!
```

Seeded data:

- HR: Fatima Ezzahra Elmenoun.
- Manager: Omar Alami, Engineering Manager.
- Employee: Sara Amrani, Frontend Developer.
- Case: `case-2026-00124`.

The hosted UI is an interactive product demonstration with realistic seeded state. The local FastAPI service provides the real persistence, CV extraction, authentication, and Langflow integration endpoints.

## Configure WF-01

By default:

```env
LANGFLOW_WEBHOOK_URL=
LANGFLOW_TEST_MODE=true
```

This makes the backend return a small deterministic demonstration plan so the whole product works without external infrastructure.

To use the actual orchestrator:

```env
LANGFLOW_WEBHOOK_URL=https://your-langflow-host.example/api/v1/webhook/...
LANGFLOW_API_KEY=your-secret-key
LANGFLOW_TEST_MODE=false
LANGFLOW_TIMEOUT_SECONDS=600
```

Restart the backend after editing `.env`:

```bash
docker compose up --build backend
```

`LANGFLOW_TIMEOUT_SECONDS=600` permits a ten-minute request. For this MVP, the API waits for the Langflow response directly. A production version should dispatch asynchronously and let the frontend poll a persistent `AgentRun`.

The integration accepts:

- A direct WF-01 JSON response.
- A response nested under `result`.
- Common Langflow message output nesting.
- A text output containing serialized JSON.
- Markdown-fenced JSON, including `json` code fences.
- Text responses with explanatory prose before or after the JSON object.

Errors are mapped to clear HTTP responses:

- `504 LANGFLOW_TIMEOUT`
- `502 LANGFLOW_HTTP_<status>`
- `502 LANGFLOW_UNAVAILABLE`
- `502` for a successful HTTP response with an invalid agent artifact

## CV extraction

Upload endpoint:

```http
POST /api/cases/:caseId/documents
Content-Type: multipart/form-data
Authorization: Bearer <HR JWT>
```

Form field:

```text
file=<PDF, DOCX or TXT file>
```

Processing:

1. The API verifies the case, extension, and maximum size.
2. It stores the original file under `backend/uploads/`.
3. `pypdf`, `python-docx`, or UTF-8 decoding extracts text.
4. The backend creates the requested `schema_version: 1.0` extraction object.
5. The full object, including raw text, is stored in MongoDB.
6. PostgreSQL stores only document metadata and the MongoDB extraction ID.
7. The API returns the structured extraction without raw CV text.

Supported errors:

- `413` when the file exceeds `MAX_CV_SIZE_MB`.
- `422 UNSUPPORTED_CV_TYPE`.
- `422 CV_TEXT_NOT_EXTRACTABLE` for scanned or empty documents.
- `500 CV_PROCESSING_FAILED` for an unexpected persistence or extraction failure.

OCR is intentionally excluded. Upload another file when a scanned PDF has no extractable text.

## API journey

### 1. Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"hr@nextalent.ma","password":"Demo123!"}'
```

Copy `access_token` and use it below as `$TOKEN`.

### 2. List employees

```bash
curl http://localhost:8000/api/employees \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Create an employee and case

```bash
curl -X POST http://localhost:8000/api/employees \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "first_name": "Nadia",
    "last_name": "Bennani",
    "email": "nadia.bennani@nextalent.ma",
    "job_title": "Frontend Developer",
    "job_family": "SOFTWARE_DEVELOPMENT",
    "department_id": "engineering",
    "country": "MA",
    "contract_category": "CDI",
    "work_mode": "HYBRID",
    "preferred_language": "fr",
    "start_date": "2026-08-10",
    "manager_id": "employee-manager-09"
  }'
```

The backend creates the onboarding case automatically. Fetch the employee detail to obtain its case ID:

```bash
curl http://localhost:8000/api/employees/EMPLOYEE_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Upload a CV

```bash
curl -X POST http://localhost:8000/api/cases/CASE_ID/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/absolute/path/to/cv.pdf"
```

### 5. Generate the plan

```bash
curl -X POST http://localhost:8000/api/cases/CASE_ID/plan-generations \
  -H "Authorization: Bearer $TOKEN"
```

The backend builds the exact `GENERATE_PLAN` envelope from the employee, case, employment, manager, CV analysis, received documents, and metadata. Trusted request/run/correlation identifiers are generated server-side.

The semantic key:

```text
GENERATE_PLAN:<case_id>:<case_version>
```

prevents duplicate plan generation. A repeated request returns the existing run with:

```json
{"duplicate": true}
```

### 6. Read and approve the plan

```bash
curl http://localhost:8000/api/cases/CASE_ID/current-plan \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:8000/api/plans/PLAN_ID/approvals \
  -H "Authorization: Bearer $TOKEN"
```

### 7. Ask the assistant

```bash
curl -X POST http://localhost:8000/api/cases/CASE_ID/questions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"Pourquoi la formation sécurité est-elle obligatoire ?","language":"fr"}'
```

The backend creates the requested `ANSWER_QUESTION` payload, calls WF-01, and stores the answer and citations.

## Main endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | HR login |
| `GET` | `/api/auth/me` | Current HR user |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET` | `/api/employees` | List profiles |
| `POST` | `/api/employees` | Create employee and case |
| `GET` | `/api/employees/:id` | Employee and case detail |
| `PATCH` | `/api/employees/:id` | Update employee and increment case version |
| `POST` | `/api/cases/:id/documents` | Upload and extract CV |
| `POST` | `/api/cases/:id/plan-generations` | Generate a plan through WF-01 |
| `GET` | `/api/cases/:id/current-plan` | Read latest plan |
| `POST` | `/api/plans/:id/approvals` | Approve plan |
| `POST` | `/api/cases/:id/questions` | Ask the case assistant |
| `GET` | `/api/agent-runs/:id` | Inspect execution/result/error |

Interactive schemas and responses are also available in Swagger at `/docs`.

## Database responsibilities

PostgreSQL:

- Authentication users.
- Employee and manager profiles.
- Onboarding cases and versions.
- CV document metadata.
- Agent requests, results, status, and errors.
- Generated plan JSON.
- Questions, answers, and citations.

MongoDB collection `cv_extractions`:

- The exact CV extraction artifact.
- Full raw extracted text.
- Extraction quality and warnings.

This separation keeps normal HR relations queryable while allowing flexible CV analysis documents.

## Reset demo data

Delete local database volumes and rebuild:

```bash
docker compose down -v
docker compose up --build
```

This permanently deletes local demo database contents.

## Validation

Frontend:

```bash
npm run lint
npm run build
npm run validate:artifact
```

Backend syntax:

```bash
python -m compileall backend/app backend/seed.py
```

Docker configuration:

```bash
docker compose config
```

## MVP limitations

- The direct Langflow request occupies one backend request until completion.
- No OCR or antivirus scan.
- No revision or adaptation flow yet.
- No manager or employee login.
- No notifications, RabbitMQ, WebSocket, or SSE.
- CV skill detection is deliberately lightweight; the Profile Agent performs the semantic analysis used in the final plan.
- The local demo secrets in `.env` must be replaced before any shared deployment.

These limits are deliberate so the PFE demo remains understandable and can be completed reliably.
