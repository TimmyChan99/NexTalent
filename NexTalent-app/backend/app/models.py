from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("user"))
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="HR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("employee"))
    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    job_title: Mapped[str] = mapped_column(String)
    job_family: Mapped[str] = mapped_column(String, default="OTHER")
    department_id: Mapped[str] = mapped_column(String)
    country: Mapped[str] = mapped_column(String, default="MA")
    contract_category: Mapped[str] = mapped_column(String, default="CDI")
    work_mode: Mapped[str] = mapped_column(String, default="HYBRID")
    preferred_language: Mapped[str] = mapped_column(String, default="fr")
    start_date: Mapped[date] = mapped_column(Date)
    manager_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class OnboardingCase(Base):
    __tablename__ = "onboarding_cases"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("case"))
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), unique=True)
    status: Mapped[str] = mapped_column(String, default="DRAFT")
    case_version: Mapped[int] = mapped_column(Integer, default=1)
    duration_days: Mapped[int] = mapped_column(Integer, default=30)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    employee: Mapped[Employee] = relationship()


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("doc-cv"))
    case_id: Mapped[str] = mapped_column(ForeignKey("onboarding_cases.id"))
    document_type: Mapped[str] = mapped_column(String, default="CV")
    original_name: Mapped[str] = mapped_column(String)
    storage_path: Mapped[str] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String)
    processing_status: Mapped[str] = mapped_column(String, default="UPLOADED")
    mongo_extraction_id: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("run"))
    request_id: Mapped[str] = mapped_column(String, unique=True)
    case_id: Mapped[str | None] = mapped_column(String, nullable=True)
    operation: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="RUNNING")
    semantic_key: Mapped[str] = mapped_column(String, unique=True)
    request_payload: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("plan"))
    case_id: Mapped[str] = mapped_column(ForeignKey("onboarding_cases.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String, default="UNDER_REVIEW")
    title: Mapped[str] = mapped_column(String)
    payload: Mapped[dict] = mapped_column(JSON)
    based_on_run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("question"))
    case_id: Mapped[str] = mapped_column(String, index=True)
    run_id: Mapped[str] = mapped_column(String)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
