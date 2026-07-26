from datetime import date
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class EmployeeIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    job_title: str = Field(min_length=1, max_length=150)
    job_family: str = "OTHER"
    department_id: str
    country: str = "MA"
    contract_category: str = "CDI"
    work_mode: str = "HYBRID"
    preferred_language: str = "fr"
    start_date: date
    manager_id: str | None = None


class EmployeeOut(EmployeeIn):
    id: str
    model_config = ConfigDict(from_attributes=True)


class QuestionIn(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    language: str = "fr"


class PlanRevisionIn(BaseModel):
    requested_changes: str | None = Field(default=None, max_length=4000)
    feedback: str | None = Field(default=None, max_length=4000)
    revision_reason: str | None = Field(default=None, max_length=2000)
