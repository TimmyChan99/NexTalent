from datetime import date
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Employee, OnboardingCase, User
from app.security import hash_password


def seed() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        hr = db.scalar(select(User).where(User.email == "hr@nextalent.ma"))
        if not hr:
            hr = User(id="hr-user-91", email="hr@nextalent.ma", password_hash=hash_password("Demo123!"), name="Fatima Ezzahra Elmenoun", role="HR")
            db.add(hr)
            db.flush()
        manager = db.scalar(select(Employee).where(Employee.email == "omar.alami@nextalent.ma"))
        if not manager:
            manager = Employee(id="employee-manager-09", first_name="Omar", last_name="Alami", email="omar.alami@nextalent.ma", job_title="Engineering Manager", job_family="SOFTWARE_DEVELOPMENT", department_id="engineering", start_date=date(2024, 1, 8))
            db.add(manager)
            db.flush()
        sara = db.scalar(select(Employee).where(Employee.email == "sara.amrani@nextalent.ma"))
        if not sara:
            sara = Employee(id="employee-2026-0091", first_name="Sara", last_name="Amrani", email="sara.amrani@nextalent.ma", job_title="Frontend Developer", job_family="SOFTWARE_DEVELOPMENT", department_id="engineering", start_date=date(2026, 8, 3), manager_id=manager.id)
            db.add(sara)
            db.flush()
            db.add(OnboardingCase(id="case-2026-00124", employee_id=sara.id, status="DRAFT", case_version=1, created_by=hr.id))
        db.commit()
        print("Seed complete: hr@nextalent.ma / Demo123!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
