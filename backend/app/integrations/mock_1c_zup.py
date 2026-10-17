"""Mock 1C:ZUP adapter: serves the synthetic org from seed_data/org.json.

Real adapter: call the 1C:ZUP HTTP service / OData endpoint for employees,
positions, departments, managers, hire dates and leave entitlements; run a
nightly sync plus on-demand refresh. JanaMen stores a read-only copy
(EmployeeProfile.source / synced_at) and never writes back.
"""
import json
from datetime import date
from pathlib import Path

from app.integrations.ports import EmployeeRecord

ORG_FILE = Path(__file__).resolve().parents[2] / "seed_data" / "org.json"


def load_org() -> dict:
    return json.loads(ORG_FILE.read_text(encoding="utf-8"))


class Mock1CZup:
    system = "1c_zup"

    def __init__(self, org: dict | None = None):
        self._org = org or load_org()

    def list_employees(self) -> list[EmployeeRecord]:
        return [
            EmployeeRecord(
                employee_code=e["code"],
                last_name=e["last_name"],
                first_name=e["first_name"],
                middle_name=e.get("middle_name"),
                position=e["position"],
                department_code=e["department"],
                manager_code=e.get("manager"),
                hire_date=date.fromisoformat(e["hire_date"]),
                annual_leave_days=e.get("leave_days", 24),
            )
            for e in self._org["employees"]
        ]

    def get_employee(self, employee_code: str) -> EmployeeRecord | None:
        return next((e for e in self.list_employees() if e.employee_code == employee_code), None)
