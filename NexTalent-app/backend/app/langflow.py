from datetime import datetime, timedelta, timezone
import json
import httpx
from fastapi import HTTPException

from .config import get_settings

settings = get_settings()


WRAPPER_KEYS = ("text/result", "text", "result", "output", "message", "content", "data")
AGENT_RESPONSE_KEYS = {
    "schema_version",
    "operation",
    "status",
    "request_id",
    "run_id",
    "security_outcome",
    "requires_human_review",
    "callback_status",
    "warnings",
    "errors",
}


def _strip_markdown_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if text.lower().startswith("json"):
        text = text[4:].strip()
    return text


def _extract_balanced_json(text: str) -> str | None:
    start = -1
    opening = ""
    closing = ""
    for index, char in enumerate(text):
        if char == "{":
            start, opening, closing = index, "{", "}"
            break
        if char == "[":
            start, opening, closing = index, "[", "]"
            break
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return None


def parse_jsonish(value):
    if isinstance(value, dict):
        if AGENT_RESPONSE_KEYS.intersection(value):
            return value
        for key in WRAPPER_KEYS:
            if key in value:
                parsed = parse_jsonish(value[key])
                if isinstance(parsed, dict):
                    return parsed
        return value
    if not isinstance(value, str):
        return value

    text = _strip_markdown_json(value)
    candidates = [text]
    extracted = _extract_balanced_json(text)
    if extracted and extracted != text:
        candidates.append(extracted)
    for candidate in candidates:
        try:
            return parse_jsonish(json.loads(candidate))
        except json.JSONDecodeError:
            pass
    return {"answer": value}


def normalize_response(data):
    data = parse_jsonish(data)
    if isinstance(data, dict):
        if AGENT_RESPONSE_KEYS.intersection(data):
            normalized = dict(data)
            for key in WRAPPER_KEYS:
                if key in normalized:
                    normalized[key] = parse_jsonish(normalized[key])
            return normalized
        for path in (("result",), ("outputs", 0, "outputs", 0, "results", "message", "data", "text")):
            value = data
            try:
                for key in path:
                    value = value[key]
                if value:
                    parsed = parse_jsonish(value)
                    if isinstance(parsed, dict):
                        return parsed
                    return value
            except (KeyError, IndexError, TypeError):
                pass
    return data


async def call_wf01(payload: dict) -> dict:
    if settings.langflow_test_mode:
        return demo_response(payload)
    if not settings.langflow_webhook_url:
        raise HTTPException(500, "LANGFLOW_WEBHOOK_URL is required when LANGFLOW_TEST_MODE=false")
    headers = {"Content-Type": "application/json"}
    if settings.langflow_api_key:
        headers["x-api-key"] = settings.langflow_api_key
        headers["Authorization"] = f"Bearer {settings.langflow_api_key}"
    try:
        timeout = httpx.Timeout(settings.langflow_timeout_seconds, connect=30)
        async with httpx.AsyncClient(timeout=timeout) as client:
            print(f"WF01 webhook POST {settings.langflow_webhook_url} operation={payload.get('operation')} request_id={payload.get('request_id')}", flush=True)
            response = await client.post(settings.langflow_webhook_url, content=json.dumps(payload), headers=headers)
            print(f"WF01 webhook response status={response.status_code} request_id={payload.get('request_id')}", flush=True)
            response.raise_for_status()
            return normalize_response(parse_jsonish(response.text))
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "LANGFLOW_TIMEOUT") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"LANGFLOW_HTTP_{exc.response.status_code}") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(502, f"LANGFLOW_UNAVAILABLE: {exc}") from exc


def demo_response(payload: dict) -> dict:
    if payload["operation"] == "ANSWER_QUESTION":
        return {
            "schema_version": "1.0", "operation": "ANSWER_QUESTION", "status": "SUCCEEDED",
            "request_id": payload["request_id"], "run_id": payload["run_id"],
            "result": {"answer": "La formation sécurité SEC-101 est obligatoire pour tous les employés Engineering.", "citations": [{"title": "Politique de sécurité", "section": "2.1"}]},
        }
    start = payload["generation"]["onboarding_period"]["start_date"]
    end = payload["generation"]["onboarding_period"]["end_date"]
    return {
        "schema_version": "1.0", "operation": "GENERATE_PLAN", "status": "SUCCEEDED",
        "request_id": payload["request_id"], "run_id": payload["run_id"],
        "security_outcome": "ALLOWED", "requires_human_review": False,
        "result": {"plan": {
            "plan_id": f"plan-{payload['employee']['employee_id']}-v1",
            "employee_id": payload["employee"]["employee_id"], "case_id": payload["case"]["case_id"],
            "title": f"Onboarding Plan — {payload['employee']['job_title']}",
            "locale": payload["actor"]["requested_language"], "start_date": start, "end_date": end,
            "duration_days": 30, "plan_status": "DRAFT",
            "phases": [
                {"phase_id": "phase-01", "sequence": 1, "name": "Pré-intégration", "tasks": [
                    {"task_id": "task-001", "title": "Préparer les accès et l’équipement", "owner_role": "IT", "target_date": start, "mandatory": True, "status": "PENDING", "dependencies": []}
                ]},
                {"phase_id": "phase-02", "sequence": 2, "name": "Semaine 1", "tasks": [
                    {"task_id": "task-002", "title": "Formation sécurité SEC-101", "owner_role": "EMPLOYEE", "target_date": start, "mandatory": True, "status": "PENDING", "dependencies": []},
                    {"task_id": "task-003", "title": "Découverte de l’architecture frontend", "owner_role": "BUDDY", "target_date": start, "mandatory": True, "status": "PENDING", "dependencies": []}
                ]},
                {"phase_id": "phase-03", "sequence": 3, "name": "Semaines 2–4", "tasks": [
                    {"task_id": "task-004", "title": "Réaliser une première tâche guidée", "owner_role": "EMPLOYEE", "target_date": end, "mandatory": True, "status": "PENDING", "dependencies": ["task-003"]}
                ]},
            ],
            "success_criteria": ["Accès disponibles", "Formation sécurité terminée", "Première contribution fusionnée"],
            "warnings": [],
        }},
        "warnings": [], "errors": [], "callback_status": "TEST_MODE_CALLBACK_SKIPPED",
    }
