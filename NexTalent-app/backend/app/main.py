from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import json

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .cv_service import analyze_cv, extract_text
from .database import Base, engine, get_db, mongo_db
from .langflow import call_wf01, normalize_response
from .models import AgentRun, Document, Employee, OnboardingCase, Plan, Question, User
from .schemas import EmployeeIn, EmployeeOut, LoginIn, PlanRevisionIn, QuestionIn
from .security import create_token, current_user, verify_password

settings = get_settings()
app = FastAPI(title="NexTalent Onboarding API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:5173", "http://localhost:3000", "http://terminal.local", "https://terminal.local"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict:
    try:
        mongo_db.command("ping")
        mongo = "up"
    except Exception:
        mongo = "down"
    return {"status": "ok", "postgres": "up", "mongodb": mongo}


@app.post("/api/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == data.email))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    return {"access_token": create_token(user), "token_type": "bearer", "user": {"id": user.id, "email": user.email, "name": user.name, "role": user.role}}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@app.get("/api/stats")
def stats(_: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    case_rows = db.execute(select(OnboardingCase.status, func.count()).group_by(OnboardingCase.status)).all()
    plan_rows = db.execute(select(Plan.status, func.count()).group_by(Plan.status)).all()
    agent_rows = db.execute(select(AgentRun.status, func.count()).group_by(AgentRun.status)).all()
    question_rows = db.execute(select(Question.status, func.count()).group_by(Question.status)).all()
    return {
        "employees": db.scalar(select(func.count()).select_from(Employee)),
        "active_cases": db.scalar(select(func.count()).select_from(OnboardingCase).where(OnboardingCase.status != "COMPLETED")),
        "plans": db.scalar(select(func.count()).select_from(Plan)),
        "running_agents": db.scalar(select(func.count()).select_from(AgentRun).where(AgentRun.status == "RUNNING")),
        "cases_by_status": {status: count for status, count in case_rows},
        "plans_by_status": {status: count for status, count in plan_rows},
        "agent_runs_by_status": {status: count for status, count in agent_rows},
        "questions_by_status": {status: count for status, count in question_rows},
    }


@app.get("/api/employees", response_model=list[EmployeeOut])
def list_employees(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Employee).order_by(Employee.created_at.desc())).all()


@app.post("/api/employees", response_model=EmployeeOut, status_code=201)
def create_employee(data: EmployeeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    employee = Employee(**data.model_dump())
    case = OnboardingCase(employee=employee, created_by=user.id, status="DRAFT")
    db.add_all([employee, case])
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An employee with this email already exists") from exc
    db.refresh(employee)
    return employee


@app.get("/api/employees/{employee_id}")
def get_employee(employee_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    case = db.scalar(select(OnboardingCase).where(OnboardingCase.employee_id == employee_id))
    return {"employee": EmployeeOut.model_validate(employee), "case": serialize_case(case)}


@app.patch("/api/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: str, data: EmployeeIn, _: User = Depends(current_user), db: Session = Depends(get_db)):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(404, "Employee not found")
    for key, value in data.model_dump().items():
        setattr(employee, key, value)
    case = db.scalar(select(OnboardingCase).where(OnboardingCase.employee_id == employee_id))
    case.case_version += 1
    case.status = "DRAFT"
    db.commit()
    db.refresh(employee)
    return employee


@app.post("/api/cases/{case_id}/documents", status_code=201)
async def upload_cv(case_id: str, file: UploadFile = File(...), _: User = Depends(current_user), db: Session = Depends(get_db)):
    case = db.get(OnboardingCase, case_id)
    if not case:
        raise HTTPException(404, "Onboarding case not found")
    content = await file.read()
    if len(content) > settings.max_cv_size_mb * 1024 * 1024:
        raise HTTPException(413, f"CV exceeds {settings.max_cv_size_mb} MB")
    document = Document(case_id=case_id, original_name=file.filename or "cv", storage_path="", mime_type=file.content_type or "application/octet-stream")
    db.add(document)
    db.flush()
    safe_name = f"{document.id}{Path(file.filename or 'cv').suffix.lower()}"
    path = Path(settings.upload_dir) / safe_name
    document.storage_path = str(path)
    try:
        path.write_bytes(content)
        text, method = extract_text(content, file.filename or "")
        extraction = analyze_cv(text, document.id, method)
        mongo_result = mongo_db.cv_extractions.insert_one(extraction)
        document.mongo_extraction_id = str(mongo_result.inserted_id)
        document.processing_status = "PROCESSED"
        case.status = "READY_FOR_PLAN"
        case.case_version += 1
        db.commit()
        extraction.pop("raw_text", None)
        return extraction
    except ValueError as exc:
        document.processing_status = "FAILED"
        document.error_message = str(exc)
        db.commit()
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        document.processing_status = "FAILED"
        document.error_message = "CV_PROCESSING_FAILED"
        db.commit()
        raise HTTPException(500, "CV_PROCESSING_FAILED") from exc


@app.post("/api/cases/{case_id}/plan-generations")
async def generate_plan(case_id: str, force: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = db.get(OnboardingCase, case_id)
    if not case:
        raise HTTPException(404, "Onboarding case not found")
    if case.status not in {"READY_FOR_PLAN", "REVIEW"}:
        raise HTTPException(409, "Upload and successfully extract a CV before generating a plan")
    document = db.scalar(select(Document).where(Document.case_id == case_id, Document.processing_status == "PROCESSED").order_by(Document.created_at.desc()))
    if not document:
        raise HTTPException(409, "No processed CV found")
    semantic_key = f"GENERATE_PLAN:{case.id}:{case.case_version}"
    existing = db.scalar(select(AgentRun).where(AgentRun.semantic_key == semantic_key))
    if existing and not force:
        return run_response(existing, duplicate=True)
    if force:
        semantic_key = f"{semantic_key}:force:{uuid4().hex[:8]}"
    employee = case.employee
    extraction = mongo_db.cv_extractions.find_one({"document_id": document.id}, {"_id": 0, "raw_text": 0})
    run = new_run(case.id, "GENERATE_PLAN", semantic_key)
    payload = build_generate_payload(run, case, employee, document, extraction, user)
    run.request_payload = payload
    db.add(run)
    db.commit()
    try:
        result = await call_wf01(payload)
        return handle_plan_generation_result(db, run, result)
    except HTTPException as exc:
        fail_run(db, run, str(exc.detail))
        raise
    except Exception as exc:
        fail_run(db, run, str(exc))
        raise HTTPException(502, "The agent response could not be validated") from exc


@app.post("/api/cases/{case_id}/plan-revisions")
async def revise_plan(case_id: str, data: PlanRevisionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = db.get(OnboardingCase, case_id)
    if not case:
        raise HTTPException(404, "Onboarding case not found")
    current = db.scalar(select(Plan).where(Plan.case_id == case_id).order_by(Plan.version.desc()))
    if not current:
        raise HTTPException(409, "No current plan found to revise")
    revision_fields = {key: value.strip() for key, value in data.model_dump().items() if isinstance(value, str) and value.strip()}
    if not revision_fields:
        raise HTTPException(422, "Provide requested_changes, feedback, or revision_reason")
    document = db.scalar(select(Document).where(Document.case_id == case_id, Document.processing_status == "PROCESSED").order_by(Document.created_at.desc()))
    if not document:
        raise HTTPException(409, "No processed CV found")
    extraction = mongo_db.cv_extractions.find_one({"document_id": document.id}, {"_id": 0, "raw_text": 0})
    run = new_run(case.id, "REVISE_PLAN", f"REVISE_PLAN:{case.id}:{current.version}:{uuid4().hex[:8]}")
    payload = build_generate_payload(run, case, case.employee, document, extraction, user)
    payload["operation"] = "REVISE_PLAN"
    payload["idempotency_key"] = run.semantic_key
    payload["current_plan"] = {"plan_id": current.id, "version": current.version, "status": current.status, "plan": current.payload}
    payload["revision"] = revision_fields
    run.request_payload = payload
    db.add(run)
    db.commit()
    try:
        result = await call_wf01(payload)
        return handle_plan_generation_result(db, run, result)
    except HTTPException as exc:
        fail_run(db, run, str(exc.detail))
        raise
    except Exception as exc:
        fail_run(db, run, str(exc))
        raise HTTPException(502, "The agent response could not be validated") from exc


@app.post("/api/agent-runs/callback")
async def agent_run_callback(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    try:
        payload = json.loads(body.decode("utf-8")) if body else {}
    except json.JSONDecodeError:
        payload = body.decode("utf-8", errors="replace")
    result = normalize_response(payload)
    if not isinstance(result, dict):
        raise HTTPException(422, "Callback payload must contain a JSON object")
    run_id = result.get("run_id")
    request_id = result.get("request_id")
    if not run_id and not request_id:
        raise HTTPException(422, "Callback requires run_id or request_id")
    run = db.get(AgentRun, run_id) if run_id else None
    if not run and request_id:
        run = db.scalar(select(AgentRun).where(AgentRun.request_id == request_id))
    if not run:
        raise HTTPException(404, "Agent run not found")
    if run.operation == "ANSWER_QUESTION":
        return handle_question_result(db, run, result)
    return handle_plan_generation_result(db, run, result)


@app.get("/api/cases/{case_id}/current-plan")
def current_plan(case_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = db.scalar(select(Plan).where(Plan.case_id == case_id).order_by(Plan.version.desc()))
    if not plan:
        raise HTTPException(404, "No plan generated yet")
    return {"id": plan.id, "version": plan.version, "status": plan.status, "plan": plan.payload}


@app.get("/api/cases/{case_id}/agent-runs")
def case_agent_runs(case_id: str, operation: str | None = None, _: User = Depends(current_user), db: Session = Depends(get_db)):
    case = db.get(OnboardingCase, case_id)
    if not case:
        raise HTTPException(404, "Onboarding case not found")
    query = select(AgentRun).where(AgentRun.case_id == case_id)
    if operation:
        query = query.where(AgentRun.operation == operation)
    runs = db.scalars(query.order_by(AgentRun.started_at.desc()).limit(50)).all()
    return {"runs": [run_response(run) for run in runs]}


@app.post("/api/plans/{plan_id}/approvals")
def approve_plan(plan_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    plan.status = "APPROVED"
    case = db.get(OnboardingCase, plan.case_id)
    case.status = "ACTIVE"
    db.commit()
    return {"plan_id": plan.id, "status": plan.status}


@app.post("/api/cases/{case_id}/questions")
async def ask_question(case_id: str, data: QuestionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = db.get(OnboardingCase, case_id)
    if not case:
        raise HTTPException(404, "Onboarding case not found")
    run = new_run(case_id, "ANSWER_QUESTION", f"ANSWER_QUESTION:{case_id}:{uuid4().hex}")
    conversation_id = f"conversation-{case_id}"
    message_id = f"message-{uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    payload = {
        "schema_version": "1.0", "request_id": run.request_id, "run_id": run.id,
        "correlation_id": f"{conversation_id}:{run.request_id}",
        "idempotency_key": f"ANSWER_QUESTION:{conversation_id}:{message_id}", "operation": "ANSWER_QUESTION",
        "requested_at": now.isoformat(), "deadline_at": (now + timedelta(seconds=settings.langflow_timeout_seconds)).isoformat(),
        "actor": {"actor_id": user.id, "actor_type": "HR", "requested_language": data.language},
        "tenant": {"tenant_id": "organization-001"}, "employee": {"employee_id": case.employee_id},
        "conversation": {"conversation_id": conversation_id, "message_id": message_id},
        "payload": {"question": data.question, "answer_preferences": {"include_sources": True, "maximum_length": "MEDIUM"}},
        "metadata": {"source": "HR_DASHBOARD", "test_mode": settings.langflow_test_mode},
    }
    run.request_payload = payload
    question = Question(case_id=case_id, run_id=run.id, question=data.question)
    db.add_all([run, question])
    db.commit()
    try:
        result = await call_wf01(payload)
        return handle_question_result(db, run, result)
    except Exception as exc:
        question.status = "FAILED"
        fail_run(db, run, str(exc))
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(502, "The assistant could not answer this question") from exc


@app.get("/api/agent-runs/{run_id}")
def get_run(run_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(404, "Agent run not found")
    return run_response(run)


def serialize_case(case: OnboardingCase | None) -> dict | None:
    if not case:
        return None
    return {"id": case.id, "employee_id": case.employee_id, "status": case.status, "case_version": case.case_version, "duration_days": case.duration_days}


def new_run(case_id: str, operation: str, semantic_key: str) -> AgentRun:
    return AgentRun(id=f"run-{uuid4().hex[:16]}", request_id=f"req-{uuid4().hex[:16]}", case_id=case_id, operation=operation, semantic_key=semantic_key, request_payload={})


def run_response(run: AgentRun, duplicate: bool = False) -> dict:
    return {
        "accepted": True,
        "duplicate": duplicate,
        "run_id": run.id,
        "request_id": run.request_id,
        "operation": run.operation,
        "status": run.status,
        "result": run.result,
        "error_code": run.error_code,
        "error_message": run.error_message,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


def fail_run(db: Session, run: AgentRun, message: str) -> None:
    run.status, run.error_code, run.error_message, run.completed_at = "FAILED", "AGENT_EXECUTION_FAILED", message[:1000], datetime.utcnow()
    db.commit()


def handle_question_result(db: Session, run: AgentRun, result: dict) -> dict:
    question = db.scalar(select(Question).where(Question.run_id == run.id))
    terminal = find_terminal_payload(result)
    terminal_status = terminal.get("status") if terminal else result.get("status")
    if terminal_status == "FAILED":
        code, message = extract_error_info(terminal or result)
        run.status = "FAILED"
        run.error_code = code
        run.error_message = message[:1000]
        run.result = result
        run.completed_at = datetime.utcnow()
        if question:
            question.status = "FAILED"
        db.commit()
        return question_response(run, question)

    answer_data = extract_answer_data(result)
    if terminal_status not in {"SUCCEEDED", "COMPLETED"} or not answer_data:
        run.result = result
        db.commit()
        return question_response(run, question)

    answer = str(answer_data.get("answer") or answer_data.get("response") or "")
    citations = answer_data.get("citations") or answer_data.get("sources") or extract_sources(result) or []
    if question:
        question.answer = answer
        question.citations = citations
        question.status = "COMPLETED"
        question.answered_at = datetime.utcnow()
    run.status = "COMPLETED"
    run.result = result
    run.completed_at = datetime.utcnow()
    db.commit()
    return question_response(run, question)


def question_response(run: AgentRun, question: Question | None) -> dict:
    response = run_response(run)
    if question:
        response.update({"question_id": question.id, "answer": question.answer, "citations": question.citations, "question_status": question.status})
    return response


def handle_plan_generation_result(db: Session, run: AgentRun, result: dict) -> dict:
    terminal = find_terminal_payload(result)
    terminal_status = terminal.get("status") if terminal else result.get("status")
    if terminal_status == "FAILED":
        code, message = extract_error_info(terminal or result)
        fail_plan_run(db, run, result, code, message)
        return run_response(run)

    plan_data = extract_plan_data(result)
    if terminal_status not in {"SUCCEEDED", "COMPLETED"} or not plan_data:
        run.result = result
        db.commit()
        return run_response(run)

    save_completed_plan(db, run, result, plan_data)
    return run_response(run)


def fail_plan_run(db: Session, run: AgentRun, result: dict, code: str, message: str) -> None:
    run.status = "FAILED"
    run.error_code = code
    run.error_message = message[:1000]
    run.result = result
    run.completed_at = datetime.utcnow()
    case = db.get(OnboardingCase, run.case_id) if run.case_id else None
    if case:
        has_plan = db.scalar(select(func.count()).select_from(Plan).where(Plan.case_id == case.id)) or 0
        if not has_plan and case.status != "DRAFT":
            case.status = "READY_FOR_PLAN"
    db.commit()


def find_terminal_payload(value, depth: int = 0) -> dict | None:
    if depth > 8:
        return None
    if isinstance(value, dict):
        if value.get("status") == "FAILED":
            return value
        for nested in value.values():
            found = find_terminal_payload(nested, depth + 1)
            if found and found.get("status") == "FAILED":
                return found
        if value.get("status") in {"SUCCEEDED", "COMPLETED"}:
            return value
        for nested in value.values():
            found = find_terminal_payload(nested, depth + 1)
            if found:
                return found
    if isinstance(value, list):
        for nested in value:
            found = find_terminal_payload(nested, depth + 1)
            if found:
                return found
    return None


def extract_error_info(value) -> tuple[str, str]:
    errors = find_errors(value)
    if errors:
        first = errors[0]
        if isinstance(first, dict):
            code = str(first.get("code") or "AGENT_FAILED")
            message = str(first.get("message") or code)
            details = first.get("details")
            if isinstance(details, dict):
                detail_bits = [str(details[key]) for key in ("error_code", "error_message", "tool") if details.get(key)]
                if detail_bits:
                    message = f"{message} ({' · '.join(detail_bits)})"
            return code, message
    if isinstance(value, dict):
        code = str(value.get("error_code") or value.get("security_outcome") or "AGENT_FAILED")
        message = str(value.get("error_message") or value.get("status") or code)
        return code, message
    return "AGENT_FAILED", "Agent generation failed"


def find_errors(value, depth: int = 0) -> list | None:
    if depth > 8:
        return None
    if isinstance(value, dict):
        errors = value.get("errors")
        if isinstance(errors, list) and errors:
            return errors
        for nested in value.values():
            found = find_errors(nested, depth + 1)
            if found:
                return found
    if isinstance(value, list):
        for nested in value:
            found = find_errors(nested, depth + 1)
            if found:
                return found
    return None


def extract_plan_data(result: dict) -> dict | None:
    return find_plan_data(result)


def extract_answer_data(result: dict) -> dict | None:
    return find_answer_data(result)


def find_answer_data(value, depth: int = 0) -> dict | None:
    if depth > 8:
        return None
    if isinstance(value, dict):
        if value.get("answer") or value.get("response"):
            return value
        for key in ("result", "text", "output", "message", "content", "data"):
            answer = find_answer_data(value.get(key), depth + 1)
            if answer:
                return answer
        for nested in value.values():
            answer = find_answer_data(nested, depth + 1)
            if answer:
                return answer
    if isinstance(value, list):
        for nested in value:
            answer = find_answer_data(nested, depth + 1)
            if answer:
                return answer
    return None


def extract_sources(value) -> list | None:
    if isinstance(value, dict):
        sources = value.get("sources")
        if isinstance(sources, list):
            return sources
        for nested in value.values():
            found = extract_sources(nested)
            if found is not None:
                return found
    if isinstance(value, list):
        for nested in value:
            found = extract_sources(nested)
            if found is not None:
                return found
    return None


def find_plan_data(value, depth: int = 0) -> dict | None:
    if depth > 8:
        return None
    if isinstance(value, dict):
        if isinstance(value.get("plan"), dict):
            return value["plan"]
        for key in ("result", "text", "output", "message", "content", "data"):
            plan = find_plan_data(value.get(key), depth + 1)
            if plan:
                return plan
        for nested in value.values():
            plan = find_plan_data(nested, depth + 1)
            if plan:
                return plan
    if isinstance(value, list):
        for nested in value:
            plan = find_plan_data(nested, depth + 1)
            if plan:
                return plan
    return None


def save_completed_plan(db: Session, run: AgentRun, result: dict, plan_data: dict) -> None:
    case = db.get(OnboardingCase, run.case_id)
    if not case:
        raise HTTPException(404, "Onboarding case not found")
    latest_version = db.scalar(select(func.max(Plan.version)).where(Plan.case_id == case.id)) or 0
    plan = Plan(case_id=case.id, version=latest_version + 1, status="UNDER_REVIEW", title=plan_data.get("title", "Onboarding plan"), payload=plan_data, based_on_run_id=run.id)
    run.status, run.result, run.completed_at = "COMPLETED", result, datetime.utcnow()
    case.status = "REVIEW"
    db.add(plan)
    db.commit()


def build_generate_payload(run: AgentRun, case: OnboardingCase, employee: Employee, document: Document, extraction: dict, user: User) -> dict:
    now = datetime.now(timezone.utc)
    end = employee.start_date + timedelta(days=30)
    cv = extraction["extraction"]
    return {
        "schema_version": "1.0", "request_id": run.request_id, "run_id": run.id,
        "correlation_id": f"{case.id}:{run.request_id}",
        "idempotency_key": f"GENERATE_PLAN:{case.id}:{case.case_version}", "operation": "GENERATE_PLAN",
        "requested_at": now.isoformat(), "deadline_at": (now + timedelta(seconds=settings.langflow_timeout_seconds)).isoformat(),
        "actor": {"actor_id": user.id, "actor_type": "HR", "requested_language": employee.preferred_language},
        "case": {"case_id": case.id, "case_version": case.case_version, "status": case.status},
        "employee": {"employee_id": employee.id, "first_name": employee.first_name, "last_name": employee.last_name, "job_title": employee.job_title, "job_family": employee.job_family, "department_id": employee.department_id},
        "employment": {"country": employee.country, "contract_category": employee.contract_category, "work_mode": employee.work_mode, "start_date": employee.start_date.isoformat()},
        "manager": {"manager_id": employee.manager_id},
        "generation": {"onboarding_period": {"start_date": employee.start_date.isoformat(), "end_date": end.isoformat()}, "include_optional_training": True},
        "cv_analysis": {"document_id": document.id, "file_name": document.original_name, "status": "EXTRACTED", **cv, "extraction_quality": {"method": extraction["quality"]["text_extraction_method"], "confidence": 0.95 if extraction["quality"]["text_quality"] == "HIGH" else 0.75, "requires_human_review": extraction["quality"]["requires_human_review"]}},
        "received_documents": [{"document_id": document.id, "document_type": "CV", "status": "received"}],
        "document_requirements": [{"document_type": "CV", "label": "Curriculum Vitae", "mandatory": True}],
        "metadata": {"source": "ONBOARDING_BACKEND", "test_mode": settings.langflow_test_mode},
    }
