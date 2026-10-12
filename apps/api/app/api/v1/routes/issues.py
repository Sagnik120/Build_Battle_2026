from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.requests import IssueCreate, IssueUpdate
from app.services import issues

router = APIRouter(prefix="/issues", tags=["issues"])


@router.get("")
def list_issues(db: Session = Depends(get_db, scope="function")) -> dict:
    return {"items": issues.list_issues(db)}


@router.post("", status_code=201)
def create_issue(body: IssueCreate, db: Session = Depends(get_db, scope="function")) -> dict:
    return issues.create_issue(db, body.model_dump())


@router.patch("/{issue_id}")
def update_issue(issue_id: int, body: IssueUpdate, db: Session = Depends(get_db, scope="function")) -> dict:
    return issues.update_issue(db, issue_id, body.model_dump(exclude_unset=True))


@router.delete("/{issue_id}", status_code=204)
def delete_issue(issue_id: int, db: Session = Depends(get_db, scope="function")) -> Response:
    issues.delete_issue(db, issue_id)
    return Response(status_code=204)
