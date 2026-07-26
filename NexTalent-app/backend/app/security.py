from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

password_hash = PasswordHash.recommended()
bearer = HTTPBearer()
settings = get_settings()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user.id, "email": user.email, "role": user.role, "iat": now, "exp": now + timedelta(minutes=settings.jwt_expire_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Token absent, expired or invalid") from exc
    user = db.get(User, payload.get("sub"))
    if not user or user.role != "HR":
        raise HTTPException(403, "Only HR users can access this MVP")
    return user
