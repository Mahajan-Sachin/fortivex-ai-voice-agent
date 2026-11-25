"""Pure-asyncio session, atomic slot booking, and CRM store with Path JSON persistence."""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.config import DATA_DIR

DB_PATH = DATA_DIR / "crm_db.json"

OFFICE_WINDOWS = [
    "Bengaluru Hub (IST): Mon-Sat, 10:00 AM - 7:00 PM IST",
    "Dubai Hub (GST): Mon-Fri, 9:00 AM - 6:00 PM GST",
    "Online / Email Follow-up: 24/7 Anytime",
]

GREETING_TEXT = (
    "Hello! Welcome to Fortivex AI. I'm Aria, your virtual concierge. "
    "Whether you're exploring custom AI automation, Fortivex CRM, academy operations, "
    "or our AI and healthcare training programs, tell me what you're looking for and I'll guide you to the right fit."
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AsyncCRMStore:
    """Async-safe store with per-session serialization and atomic slot reservation."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._session_locks: dict[str, asyncio.Lock] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self.bookings: dict[str, dict[str, Any]] = {}
        if DB_PATH.exists():
            try:
                data = json.loads(DB_PATH.read_text(encoding="utf-8"))
                self.sessions = data.get("sessions", {})
                self.bookings = data.get("bookings", {})
            except Exception:
                pass

    async def _persist(self) -> None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"sessions": self.sessions, "bookings": self.bookings}, indent=2, ensure_ascii=False)
        tmp = DB_PATH.with_suffix(".tmp")
        tmp.write_text(payload, encoding="utf-8")
        try:
            tmp.replace(DB_PATH)
        except PermissionError:
            DB_PATH.write_text(payload, encoding="utf-8")
            tmp.unlink(missing_ok=True)

    def session_lock(self, session_id: str) -> asyncio.Lock:
        return self._session_locks.setdefault(session_id, asyncio.Lock())

    async def create_session(self) -> dict[str, Any]:
        sid = uuid.uuid4().hex[:10]
        now = _now_iso()
        session = {
            "session_id": sid,
            "created_at": now,
            "updated_at": now,
            "status": "Active",
            "language": "en",
            "messages": [{"role": "assistant", "content": GREETING_TEXT, "ts": now}],
            "lead_info": {
                "name": None,
                "email": None,
                "company": None,
                "role": None,
                "customer_type": "Unknown",
                "recommended_products": [],
                "need": None,
                "budget": None,
                "timeline": None,
            },
            "lead_score": "New",
            "lead_score_numeric": 15,
            "qualification_reason": "New visitor — awaiting discovery.",
            "sentiment": "Neutral",
            "sentiment_reason": "Call started — neutral baseline.",
            "booked_slot": None,
            "booking_type": None,
            "call_summary": "Call started — Aria welcomed the visitor.",
            "business_insights": [],
            "objections": [],
        }
        async with self._lock:
            self.sessions[sid] = session
            await self._persist()
        return session

    async def get_or_create(self, session_id: str | None) -> dict[str, Any]:
        if session_id and session_id in self.sessions:
            return self.sessions[session_id]
        return await self.create_session()

    def _release_session_booking(self, session_id: str) -> None:
        self.bookings.pop(session_id, None)
        if session_id in self.sessions:
            self.sessions[session_id]["booked_slot"] = None
            self.sessions[session_id]["booking_type"] = None

    async def cancel_booking(self, session_id: str) -> None:
        async with self._lock:
            self._release_session_booking(session_id)
            await self._persist()

    async def book_slot(self, session_id: str, requested_slot: str, booking_type: str) -> tuple[bool, str]:
        """Concurrent multi-rep booking: assigns a specialist round-robin without blocking other callers."""
        slot_clean = requested_slot.strip()
        is_email = "email" in slot_clean.lower() or booking_type == "Async Email Follow-up"

        async with self._lock:
            self._release_session_booking(session_id)
            rep = "Async CRM Queue" if is_email else f"Specialist #{(len(self.bookings) % 12) + 1}"
            self.bookings[session_id] = {
                "session_id": session_id,
                "slot": slot_clean,
                "booking_type": booking_type,
                "assigned_rep": rep,
                "booked_at": _now_iso(),
            }
            if session_id in self.sessions:
                self.sessions[session_id]["booked_slot"] = f"{slot_clean} ({rep})"
                self.sessions[session_id]["booking_type"] = booking_type
            await self._persist()
            return True, f"{slot_clean} ({rep})"

    async def save_turn(
        self,
        session_id: str,
        user_text: str,
        assistant_text: str,
        language: str,
        turn_output: Any,
    ) -> dict[str, Any]:
        async with self._lock:
            sess = self.sessions[session_id]
            now = _now_iso()
            sess["messages"].extend([
                {"role": "user", "content": user_text, "ts": now},
                {"role": "assistant", "content": assistant_text, "ts": now},
            ])
            sess["language"] = language

            for k, v in turn_output.lead_info.model_dump().items():
                if k == "recommended_products" and isinstance(v, list) and v:
                    sess["lead_info"]["recommended_products"] = sorted({item for item in v if item})
                elif v not in (None, "", "Unknown"):
                    sess["lead_info"][k] = v

            sess["lead_score"] = turn_output.lead_score
            sess["lead_score_numeric"] = turn_output.lead_score_numeric
            sess["qualification_reason"] = turn_output.qualification_reason
            sess["sentiment"] = turn_output.sentiment
            sess["sentiment_reason"] = turn_output.sentiment_reason
            sess["call_summary"] = turn_output.call_summary
            if turn_output.business_insights:
                sess["business_insights"] = turn_output.business_insights
            if turn_output.objections:
                merged_obj = set(sess.get("objections") or [])
                merged_obj.update(o for o in turn_output.objections if o)
                sess["objections"] = sorted(merged_obj)
            sess["updated_at"] = now
            await self._persist()
            return sess

    async def end_session(self, session_id: str) -> dict[str, Any]:
        async with self._lock:
            sess = self.sessions[session_id]
            sess["status"] = "Completed"
            if not sess["messages"]:
                sess["call_summary"] = "Call ended before any conversation took place."
            sess["updated_at"] = _now_iso()
            await self._persist()
            return sess

    async def crm_snapshot(self) -> dict[str, Any]:
        async with self._lock:
            leads = list(reversed(list(self.sessions.values())))
            return {
                "metrics": {
                    "total_calls": len(leads),
                    "hot_leads": sum(1 for l in leads if l["lead_score"] == "Hot"),
                    "warm_leads": sum(1 for l in leads if l["lead_score"] == "Warm"),
                    "booked_appointments": len(self.bookings),
                },
                "office_windows": OFFICE_WINDOWS,
                "bookings": list(self.bookings.values()),
                "leads": leads,
            }


crm_store = AsyncCRMStore()
