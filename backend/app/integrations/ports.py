"""Integration ports. Business code depends only on these interfaces.

Real adapters (1C:ZUP HTTP/OData service, Documentolog API) implement the same
methods; the MVP ships mock adapters selected in app.integrations.get_*().
"""
from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass
class EmployeeRecord:
    employee_code: str
    last_name: str
    first_name: str
    middle_name: str | None
    position: str
    department_code: str
    manager_code: str | None
    hire_date: date
    annual_leave_days: int


class HRMasterDataProvider(Protocol):
    """Source of official HR data (1C:ZUP). JanaMen keeps a read-only copy."""

    system: str

    def get_employee(self, employee_code: str) -> EmployeeRecord | None: ...

    def list_employees(self) -> list[EmployeeRecord]: ...


@dataclass
class DocflowResult:
    document_id: str
    status: str


class DocumentFlowProvider(Protocol):
    """Electronic document flow (Documentolog): leave orders for signing."""

    system: str

    def submit_leave_order(self, *, request_id: int, employee_code: str, full_name: str,
                           start_date: date, end_date: date, days: int) -> DocflowResult: ...
