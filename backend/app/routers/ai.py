from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai import assistant
from app.ai.knowledge import chunk_document
from app.ai.llm import get_provider
from app.database import get_db
from app.models import KnowledgeDocument, Role, User
from app.permissions import get_current_user, not_found, require_roles
from app.schemas import (
    AIStatusOut, AnswerOut, AskIn, EscalateIn, KnowledgeDocOut, KnowledgeDocSummary, KnowledgeDocUpdate,
)
from app.services.notifications import NotificationType, notify
from app.services.views import person_ref

router = APIRouter(tags=["ai"])
_hr = require_roles(Role.HR)


@router.post("/ai/ask", response_model=AnswerOut)
def ask(body: AskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return AnswerOut(**asdict(assistant.ask(db, user, body.question)))


@router.get("/ai/status", response_model=AIStatusOut)
def ai_status(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    provider = get_provider()
    return AIStatusOut(
        provider=provider.name if provider else "none",
        model=provider.model if provider else None,
        llm_enabled=provider is not None,
        documents=db.query(KnowledgeDocument).count(),
    )


@router.post("/ai/escalate", status_code=status.HTTP_201_CREATED)
def escalate(body: EscalateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Forward a question AI Jana could not answer to HR (in-app notification)."""
    hr_people = db.query(User).filter(User.role == Role.HR, User.is_active.is_(True), User.id != user.id).all()
    if not hr_people:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "HR сейчас недоступен")
    question = body.question.strip()
    for hr in hr_people:
        notify(db, hr.id, NotificationType.HR_ESCALATION, title="Вопрос сотрудника для HR",
               body=f"{user.full_name}: «{question[:300]}»", link="/notifications")
    notify(db, user.id, NotificationType.HR_ESCALATION, title="Вопрос передан в HR",
           body=f"«{question[:300]}». HR ответит в течение 2 рабочих дней.", link="/assistant")
    db.commit()
    return {"forwarded_to": len(hr_people)}


def _summary(d: KnowledgeDocument) -> KnowledgeDocSummary:
    return KnowledgeDocSummary(id=d.id, title=d.title, version=d.version, effective_date=d.effective_date,
                               sections=[c.section for c in chunk_document(d)], updated_at=d.updated_at)


def _detail(d: KnowledgeDocument) -> KnowledgeDocOut:
    return KnowledgeDocOut(**_summary(d).model_dump(), body_md=d.body_md, updated_by=person_ref(d.updated_by))


@router.get("/kb", response_model=list[KnowledgeDocSummary])
def list_documents(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_summary(d) for d in db.query(KnowledgeDocument).order_by(KnowledgeDocument.id)]


@router.get("/kb/{doc_id}", response_model=KnowledgeDocOut)
def get_document(doc_id: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = db.get(KnowledgeDocument, doc_id)
    if d is None:
        raise not_found("Документ")
    return _detail(d)


def _bump(version: str) -> str:
    major, _, minor = version.partition(".")
    try:
        return f"{int(major)}.{int(minor or 0) + 1}"
    except ValueError:
        return f"{version}.1"


@router.put("/admin/kb/{doc_id}", response_model=KnowledgeDocOut)
def update_document(doc_id: str, body: KnowledgeDocUpdate, actor: User = Depends(_hr), db: Session = Depends(get_db)):
    d = db.get(KnowledgeDocument, doc_id)
    if d is None:
        raise not_found("Документ")
    if "## " not in body.body_md:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Документ должен содержать хотя бы один раздел «## Заголовок»")
    if body.title != d.title or body.body_md.strip() != d.body_md:
        d.title, d.body_md = body.title.strip(), body.body_md.strip()
        d.version = _bump(d.version)
        d.updated_by_id = actor.id
        db.commit()
        db.refresh(d)
    return _detail(d)
