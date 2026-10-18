"""Knowledge gap journal: questions AI Jana could not answer, for HR to close.

Logged:  no_match (retrieval found nothing relevant, or the LLM said NO_ANSWER)
         negative_feedback (the employee marked an answer as unhelpful).
Never:   guard refusals (personal data, HR decisions), personal answers,
         provider failures that still produced a grounded answer.

Writing to the journal must never break the chat: every entry point here
swallows its own errors after rolling back.
"""
import logging
import re

from sqlalchemy.orm import Session

from app.ai.assistant import Answer, get_retriever
from app.models import EmployeeProfile, GapEventType, GapReason, KnowledgeGapEvent

logger = logging.getLogger("janamen.ai.gaps")

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CARD = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_IIN = re.compile(r"(?<!\d)\d{12}(?!\d)")
_PHONE = re.compile(r"(?<!\w)(?:\+?7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)")
_WORD = re.compile(r"[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+")
_KAZAKH = set("әғқңөұүһіӘҒҚҢӨҰҮҺІ")
_CYRILLIC = re.compile(r"[А-Яа-яЁё]")
_LATIN = re.compile(r"[A-Za-z]")


def detect_language(text: str) -> str:
    if any(ch in _KAZAKH for ch in text):
        return "kk"
    if _CYRILLIC.search(text):
        return "ru"
    if _LATIN.search(text):
        return "en"
    return "unknown"


def _employee_names(db: Session) -> set[str]:
    names = set()
    for last, first in db.query(EmployeeProfile.last_name, EmployeeProfile.first_name):
        for part in (last, first):
            if part and len(part) >= 3:
                names.add(part.lower().replace("ё", "е"))
    return names


def _is_name(word: str, names: set[str]) -> bool:
    w = word.lower().replace("ё", "е")
    for name in names:
        stem = name.rstrip("аяоеиыуюь")  # survives declension: Касымовой -> касымов
        if w == name or (len(stem) >= 4 and w.startswith(stem) and len(w) - len(stem) <= 3):
            return True
    return False


def mask(db: Session, text: str) -> str:
    """Remove contact data, document numbers and employee names before storage."""
    text = _EMAIL.sub("[EMAIL]", text)
    text = _PHONE.sub("[ТЕЛЕФОН]", text)
    text = _CARD.sub("[НОМЕР]", text)
    text = _IIN.sub("[ИИН]", text)
    names = _employee_names(db)
    return _WORD.sub(lambda m: "[ИМЯ]" if _is_name(m.group(0), names) else m.group(0), text)


def _save(db: Session, **fields) -> KnowledgeGapEvent | None:
    try:
        event = KnowledgeGapEvent(**fields)
        db.add(event)
        db.commit()
        return event
    except Exception as exc:  # the journal is best effort; the answer is what matters
        db.rollback()
        logger.warning("knowledge gap logging failed: %s", type(exc).__name__)
        return None


def log_answer(db: Session, question: str, answer: Answer) -> KnowledgeGapEvent | None:
    """Record a no_match event if this answer is a knowledge-base miss; otherwise do nothing."""
    try:
        if not (answer.mode == "refusal" and answer.reason == "no_relevant_info"):
            return None
        # Read-only second look at retrieval: best candidate, and whether anything
        # passed the relevance check (then the refusal came from the LLM).
        hits = get_retriever(db).search(question, k=3)
        top = hits[0] if hits else None
        reason = (GapReason.LLM_NO_ANSWER if any(h.relevant for h in hits)
                  else GapReason.RETRIEVAL_BELOW_THRESHOLD)
        fields = dict(
            event_type=GapEventType.NO_MATCH,
            reason=reason,
            question=mask(db, question),
            language=detect_language(question),
            top_score=round(top.score, 3) if top else None,
            candidate_doc_id=top.chunk.doc_id if top else None,
            answer_mode=answer.mode,
        )
    except Exception as exc:
        logger.warning("knowledge gap classification failed: %s", type(exc).__name__)
        return None
    return _save(db, **fields)


def log_feedback(db: Session, question: str, answer_mode: str, source_ids: list[str]) -> KnowledgeGapEvent | None:
    try:
        top_doc = source_ids[0] if source_ids else None
        fields = dict(
            event_type=GapEventType.NEGATIVE_FEEDBACK,
            reason=GapReason.USER_MARKED_UNHELPFUL,
            question=mask(db, question),
            language=detect_language(question),
            top_score=None,
            candidate_doc_id=top_doc,
            answer_mode=answer_mode,
        )
    except Exception as exc:
        logger.warning("knowledge gap feedback failed: %s", type(exc).__name__)
        return None
    return _save(db, **fields)
