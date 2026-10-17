"""Mock Documentolog adapter: pretends to create a leave order for e-signing.

Real adapter: POST the order (employee, dates, approver) to the Documentolog API,
store the returned document id, receive signing status via webhook.
"""
from datetime import date

from app.integrations.ports import DocflowResult


class MockDocumentolog:
    system = "documentolog"

    def submit_leave_order(self, *, request_id: int, employee_code: str, full_name: str,
                           start_date: date, end_date: date, days: int) -> DocflowResult:
        return DocflowResult(
            document_id=f"DL-{start_date.year}-{request_id:05d}",
            status="sent_for_signing",
        )
