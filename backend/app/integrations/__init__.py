import json

from sqlalchemy.orm import Session

from app.integrations.mock_1c_zup import Mock1CZup
from app.integrations.mock_documentolog import MockDocumentolog
from app.integrations.ports import DocumentFlowProvider, HRMasterDataProvider
from app.models import IntegrationEvent


def get_hr_provider() -> HRMasterDataProvider:
    # HR_PROVIDER=1c_zup would select the real adapter once it exists.
    return Mock1CZup()


def get_docflow_provider() -> DocumentFlowProvider:
    return MockDocumentolog()


def log_event(db: Session, system: str, operation: str, status: str,
              reference: str | None = None, payload: dict | None = None) -> None:
    db.add(IntegrationEvent(
        system=system,
        operation=operation,
        status=status,
        reference=reference,
        payload=json.dumps(payload, ensure_ascii=False, default=str) if payload else None,
    ))


__all__ = ["get_hr_provider", "get_docflow_provider", "log_event"]
