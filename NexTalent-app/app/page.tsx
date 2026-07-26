"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type View = "dashboard" | "employees" | "workspace" | "stats";
type Tab = "overview" | "plan" | "assistant" | "activity";
type Employee = {
  id: string;
  initials: string;
  name: string;
  email: string;
  role: string;
  department: string;
  departmentId: string;
  startDate: string;
  workMode: string;
  managerId: string | null;
  status: string;
  color: string;
};
type BackendEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  job_family: string;
  department_id: string;
  country: string;
  contract_category: string;
  work_mode: string;
  preferred_language: string;
  start_date: string;
  manager_id: string | null;
};
type OnboardingCase = {
  id: string;
  employee_id: string;
  status: string;
  case_version: number;
  duration_days: number;
};
type EmployeeDetail = {
  employee: BackendEmployee;
  case: OnboardingCase | null;
};
type Stats = {
  employees: number;
  active_cases: number;
  plans: number;
  running_agents: number;
  cases_by_status?: Record<string, number>;
  plans_by_status?: Record<string, number>;
  agent_runs_by_status?: Record<string, number>;
  questions_by_status?: Record<string, number>;
};
type CurrentPlan = {
  id: string;
  version: number;
  status: string;
  plan: {
    title?: string;
    phases?: PlanPhase[];
    [key: string]: unknown;
  };
};
type PlanTask = {
  task_id?: string;
  title?: string;
  owner_role?: string;
  target_date?: string;
  mandatory?: boolean;
  status?: string;
  dependencies?: string[];
};
type PlanPhase = {
  phase_id?: string;
  sequence?: number;
  name?: string;
  title?: string;
  tasks?: PlanTask[];
};
type CvExtraction = {
  document_id?: string;
  status?: string;
  quality?: {
    text_extraction_method?: string;
    text_quality?: string;
    requires_human_review?: boolean;
  };
  warnings?: string[];
};
type PlanGenerationRun = {
  run_id: string;
  request_id: string;
  operation: string;
  status: string;
  result?: unknown;
  answer?: string | null;
  citations?: unknown[];
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};
type ChatMessage = {
  id: string;
  from: "ai" | "user";
  text: string;
  pending?: boolean;
  runId?: string;
};
type EmployeeForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  startDate: string;
  manager: string;
  workMode: string;
};

const emptyEmployeeForm: EmployeeForm = {
  firstName: "",
  lastName: "",
  email: "",
  role: "",
  department: "Engineering",
  startDate: "",
  manager: "",
  workMode: "Hybride",
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const AUTH_TOKEN_KEY = "nextalent_hr_token";

const departmentIds: Record<string, string> = {
  Engineering: "engineering",
  "Data & Insights": "data-insights",
  Product: "product",
  People: "people",
  Sales: "sales",
};

const workModeIds: Record<string, string> = {
  Hybride: "HYBRID",
  Présentiel: "ONSITE",
  Remote: "REMOTE",
};

const departmentLabels: Record<string, string> = Object.fromEntries(Object.entries(departmentIds).map(([label, id]) => [id, label]));
const workModeLabels: Record<string, string> = Object.fromEntries(Object.entries(workModeIds).map(([label, id]) => [id, label]));
const caseStatusLabels: Record<string, string> = {
  DRAFT: "CV required",
  READY_FOR_PLAN: "Ready for plan",
  REVIEW: "In review",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};
const caseStatusTones: Record<string, string> = {
  DRAFT: "amber",
  READY_FOR_PLAN: "blue",
  REVIEW: "blue",
  ACTIVE: "teal",
  COMPLETED: "teal",
};
const runStatusLabels: Record<string, string> = {
  RUNNING: "En cours",
  COMPLETED: "Terminés",
  FAILED: "Échoués",
};
const questionStatusLabels: Record<string, string> = {
  PENDING: "En attente",
  COMPLETED: "Répondues",
  FAILED: "Échouées",
};

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    case: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M8 11h8M8 15h5"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    spark: <><path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6z"/><path d="m5 16-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8z"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function Brand() {
  return <div className="brand" aria-label="NexTalent"><div className="brand-mark">N</div><div><b>Nex<span>Talent</span></b><small>AI TALENT PLATFORM</small></div><div className="reference-logo" title="NexTalent"><Image src="/nextalent-brand-reference.png" width={1126} height={633} unoptimized alt="NexTalent" /></div></div>;
}

function Status({ children, tone = "teal" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status ${tone}`}><i />{children}</span>;
}

function StatusBreakdown({ data, labels = {} }: { data?: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return <div className="empty-state compact">Aucune donnée disponible.</div>;
  return <div className="breakdown">{entries.map(([key, value]) => <div key={key}><span>{labels[key] || key}</span><b>{value}</b></div>)}</div>;
}

function formatDate(value?: string) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "NE";
}

function toEmployee(employee: BackendEmployee, onboardingCase?: OnboardingCase | null): Employee {
  const status = onboardingCase?.status || "DRAFT";
  return {
    id: employee.id,
    initials: initials(employee.first_name, employee.last_name),
    name: `${employee.first_name} ${employee.last_name}`,
    email: employee.email,
    role: employee.job_title,
    department: departmentLabels[employee.department_id] || employee.department_id,
    departmentId: employee.department_id,
    startDate: employee.start_date,
    workMode: workModeLabels[employee.work_mode] || employee.work_mode,
    managerId: employee.manager_id,
    status: caseStatusLabels[status] || status,
    color: caseStatusTones[status] || "amber",
  };
}

function findAnswerData(value: unknown, depth = 0): { answer?: string; response?: string } | null {
  if (depth > 8 || !value) return null;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.answer === "string" || typeof record.response === "string") {
      return record as { answer?: string; response?: string };
    }
    for (const key of ["result", "text", "output", "message", "content", "data"]) {
      const found = findAnswerData(record[key], depth + 1);
      if (found) return found;
    }
    for (const nested of Object.values(record)) {
      const found = findAnswerData(nested, depth + 1);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) {
    for (const nested of value) {
      const found = findAnswerData(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function getHrToken() {
  const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (stored) return stored;

  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "hr@nextalent.ma", password: "Demo123!" }),
  });
  if (!response.ok) throw new Error("Connexion HR impossible");
  const data = await response.json();
  window.localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
  return data.access_token as string;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getHrToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Erreur API ${response.status}`);
  }
  return response.json();
}

async function createBackendEmployee(form: EmployeeForm) {
  return apiFetch("/api/employees", {
    method: "POST",
    body: JSON.stringify({
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      job_title: form.role.trim(),
      job_family: "OTHER",
      department_id: departmentIds[form.department] || form.department.toLowerCase(),
      country: "MA",
      contract_category: "CDI",
      work_mode: workModeIds[form.workMode] || "HYBRID",
      preferred_language: "fr",
      start_date: form.startDate,
      manager_id: form.manager.trim() || null,
    }),
  });
}

async function uploadBackendCv(caseId: string, file: File) {
  const token = await getHrToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/cases/${caseId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (response.status === 401) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Upload CV impossible (${response.status})`);
  }
  return response.json();
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EmployeeDetail | null>(null);
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvExtraction, setCvExtraction] = useState<CvExtraction | null>(null);
  const [cvFileName, setCvFileName] = useState("");
  const [planRunning, setPlanRunning] = useState(false);
  const [planPending, setPlanPending] = useState(false);
  const [planPendingRunId, setPlanPendingRunId] = useState<string | null>(null);
  const [planHistory, setPlanHistory] = useState<PlanGenerationRun[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "welcome", from: "ai", text: "Bonjour ! Sélectionnez un dossier et je pourrai interroger le backend sur son onboarding." }]);

  const selectedEmployee = selectedDetail ? toEmployee(selectedDetail.employee, selectedDetail.case) : null;
  const selectedCase = selectedDetail?.case || null;
  const title = view === "dashboard" ? "Vue d’ensemble" : view === "employees" ? "Employés" : view === "stats" ? "Statistiques" : selectedEmployee ? `Dossier de ${selectedEmployee.name}` : "Dossier onboarding";
  const subtitle = view === "dashboard" ? "Suivez les intégrations et les actions à traiter." : view === "employees" ? "Gérez les profils et les dossiers d’intégration." : view === "stats" ? "Mesurez les dossiers, plans et agents depuis le backend." : selectedEmployee ? `${selectedEmployee.role} · ${selectedEmployee.department} · Début le ${formatDate(selectedEmployee.startDate)}` : "Sélectionnez un employé pour afficher son dossier.";
  const currentPlanPhases = currentPlan?.plan.phases || [];
  const planCount = currentPlanPhases.reduce((count, phase) => count + (phase.tasks?.length || 0), 0);

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function loadDashboardData() {
    setLoadingEmployees(true);
    try {
      const [employeeData, statsData] = await Promise.all([
        apiFetch("/api/employees") as Promise<BackendEmployee[]>,
        apiFetch("/api/stats") as Promise<Stats>,
      ]);
      setEmployees(await hydrateEmployeeRows(employeeData));
      setStats(statsData);
      if (!selectedDetail && employeeData[0]) {
        await selectEmployee(employeeData[0].id, false);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Synchronisation backend impossible");
    } finally {
      setLoadingEmployees(false);
    }
  }

  async function refreshEmployees() {
    const employeeData = await apiFetch("/api/employees") as BackendEmployee[];
    setEmployees(await hydrateEmployeeRows(employeeData));
  }

  async function hydrateEmployeeRows(employeeData: BackendEmployee[]) {
    const details = await Promise.all(employeeData.map(async (employee) => {
      try {
        return await apiFetch(`/api/employees/${employee.id}`) as EmployeeDetail;
      } catch {
        return { employee, case: null };
      }
    }));
    return details.map((detail) => toEmployee(detail.employee, detail.case));
  }

  async function loadPlanHistory(caseId: string) {
    try {
      const data = await apiFetch(`/api/cases/${caseId}/agent-runs`) as { runs: PlanGenerationRun[] };
      setPlanHistory(data.runs.filter((run) => run.operation === "GENERATE_PLAN" || run.operation === "REVISE_PLAN"));
    } catch {
      setPlanHistory([]);
    }
  }

  async function selectEmployee(employeeId: string, openWorkspace = true) {
    setLoadingDetail(true);
    try {
      const detail = await apiFetch(`/api/employees/${employeeId}`) as EmployeeDetail;
      setSelectedDetail(detail);
      setCurrentPlan(null);
      setPlanHistory([]);
      setPlanPending(false);
      setPlanPendingRunId(null);
      setCvExtraction(null);
      setCvFileName("");
      if (detail.case) {
        await loadPlanHistory(detail.case.id);
      }
      if (detail.case && detail.case.status !== "DRAFT" && detail.case.status !== "READY_FOR_PLAN") {
        try {
          const plan = await apiFetch(`/api/cases/${detail.case.id}/current-plan`) as CurrentPlan;
          setCurrentPlan(plan);
        } catch {
          setCurrentPlan(null);
        }
      }
      setMessages([{ id: `hello-${detail.employee.id}`, from: "ai", text: `Bonjour ! Je suis connecté au dossier de ${detail.employee.first_name} ${detail.employee.last_name}.` }]);
      if (openWorkspace) {
        setView("workspace");
        setTab("overview");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Dossier introuvable");
    } finally {
      setLoadingDetail(false);
    }
  }

  function openLastCase() {
    if (employees[0]) {
      void selectEmployee(employees[0].id);
      return;
    }
    setView("employees");
    notify("Aucun employé synchronisé");
  }

  useEffect(() => {
    void loadDashboardData();
    // Initial backend sync only; subsequent refreshes happen after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!planPending || !selectedCase) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await apiFetch(`/api/cases/${selectedCase.id}/agent-runs`) as { runs: PlanGenerationRun[] };
        const planRuns = data.runs.filter((run) => run.operation === "GENERATE_PLAN" || run.operation === "REVISE_PLAN");
        setPlanHistory(planRuns);
        const tracked = planPendingRunId ? planRuns.find((run) => run.run_id === planPendingRunId) : planRuns[0];
        if (tracked?.status === "FAILED") {
          setPlanPending(false);
          setPlanPendingRunId(null);
          notify(tracked.error_message || "La génération du plan a échoué");
          return;
        }
        if (tracked?.status === "COMPLETED") {
          const plan = await apiFetch(`/api/cases/${selectedCase.id}/current-plan`) as CurrentPlan;
          setCurrentPlan(plan);
          setPlanPending(false);
          setPlanPendingRunId(null);
          await selectEmployee(selectedCase.employee_id, false);
          notify("Plan reçu depuis le callback orchestrateur");
        }
      } catch {
        // The callback has not saved a final run state yet.
      }
    }, 3000);
    return () => window.clearInterval(interval);
    // Poll only while waiting for the orchestrator callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planPending, selectedCase?.id, planPendingRunId]);

  function openNewEmployeeForm() {
    setView("employees");
    setNewEmployeeOpen(true);
  }

  function updateEmployeeForm(field: keyof EmployeeForm, value: string) {
    setEmployeeForm((current) => ({ ...current, [field]: value }));
  }

  async function createEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstName = employeeForm.firstName.trim();
    const lastName = employeeForm.lastName.trim();
    const role = employeeForm.role.trim();
    const email = employeeForm.email.trim();
    if (!firstName || !lastName || !role || !email || !employeeForm.startDate) {
      notify("Nom, prénom, email, poste et date de début sont obligatoires");
      return;
    }

    setEmployeeSaving(true);
    try {
      const saved = await createBackendEmployee(employeeForm) as BackendEmployee;
      await refreshEmployees();
      await selectEmployee(saved.id);
      setEmployeeForm(emptyEmployeeForm);
      setNewEmployeeOpen(false);
      notify("Nouvel employé créé dans le backend");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setEmployeeSaving(false);
    }
  }

  async function generatePlan() {
    if (!selectedCase) {
      notify("Aucun dossier backend sélectionné");
      return;
    }
    setPlanRunning(true);
    try {
      const run = await apiFetch(`/api/cases/${selectedCase.id}/plan-generations?force=true`, { method: "POST" });
      await selectEmployee(selectedCase.employee_id, false);
      setTab("plan");
      setPlanPending(run.status === "RUNNING");
      setPlanPendingRunId(run.status === "RUNNING" ? run.run_id : null);
      notify(run.status === "COMPLETED" ? "Plan personnalisé généré" : run.status === "FAILED" ? (run.error_message || "La génération du plan a échoué") : "Orchestrateur déclenché, plan en cours");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Génération impossible");
    } finally {
      setPlanRunning(false);
    }
  }

  async function approveCurrentPlan() {
    if (!currentPlan || !selectedCase) {
      notify("Aucun plan courant à approuver");
      return;
    }
    try {
      await apiFetch(`/api/plans/${currentPlan.id}/approvals`, { method: "POST" });
      const plan = await apiFetch(`/api/cases/${selectedCase.id}/current-plan`) as CurrentPlan;
      setCurrentPlan(plan);
      await selectEmployee(selectedCase.employee_id, false);
      await refreshEmployees();
      notify("Plan approuvé, le dossier passe en actif");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Approbation impossible");
    }
  }

  async function reviseCurrentPlan() {
    if (!currentPlan || !selectedCase) {
      notify("Aucun plan courant à réviser");
      return;
    }
    const feedback = window.prompt("Quels changements souhaitez-vous demander au Planning Agent ?");
    if (!feedback?.trim()) {
      notify("Révision annulée : aucun feedback fourni");
      return;
    }
    setPlanRunning(true);
    try {
      const run = await apiFetch(`/api/cases/${selectedCase.id}/plan-revisions`, {
        method: "POST",
        body: JSON.stringify({ requested_changes: feedback.trim(), feedback: feedback.trim(), revision_reason: "HR requested plan revision" }),
      }) as PlanGenerationRun;
      await loadPlanHistory(selectedCase.id);
      setTab("plan");
      setPlanPending(run.status === "RUNNING");
      setPlanPendingRunId(run.status === "RUNNING" ? run.run_id : null);
      notify(run.status === "FAILED" ? (run.error_message || "Révision échouée") : run.status === "COMPLETED" ? "Plan révisé généré" : "Révision envoyée à l’orchestrateur");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Révision impossible");
    } finally {
      setPlanRunning(false);
    }
  }

  async function uploadCv(file?: File) {
    if (!file) return;
    if (!selectedCase) {
      notify("Aucun dossier backend sélectionné");
      return;
    }
    setCvUploading(true);
    try {
      const extraction = await uploadBackendCv(selectedCase.id, file) as CvExtraction;
      setCvExtraction(extraction);
      setCvFileName(file.name);
      await selectEmployee(selectedCase.employee_id, false);
      await refreshEmployees();
      setTab("overview");
      notify("CV uploadé et traité par le backend");
    } catch (error) {
      try {
        const detail = await apiFetch(`/api/employees/${selectedCase.employee_id}`) as EmployeeDetail;
        if (detail.case && detail.case.status !== "DRAFT") {
          setSelectedDetail(detail);
          setCvFileName(file.name);
          await refreshEmployees();
          setTab("overview");
          notify("CV traité par le backend, dossier prêt pour plan");
          return;
        }
      } catch {
        // Keep the original upload error below.
      }
      notify(error instanceof Error ? error.message : "Upload CV impossible");
    } finally {
      setCvUploading(false);
    }
  }

  function updateAssistantMessage(messageId: string, patch: Partial<ChatMessage>) {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...patch } : message));
  }

  async function pollQuestionRun(runId: string, messageId: string, attempt = 0) {
    if (attempt > 120) {
      updateAssistantMessage(messageId, { text: "La réponse prend plus de temps que prévu. Consultez l’historique du run plus tard.", pending: false });
      return;
    }
    try {
      const run = await apiFetch(`/api/agent-runs/${runId}`) as PlanGenerationRun;
      if (run.status === "FAILED") {
        updateAssistantMessage(messageId, { text: run.error_message || "L’assistant n’a pas pu répondre.", pending: false });
        return;
      }
      const answerData = findAnswerData(run);
      const answer = run.answer || answerData?.answer || answerData?.response;
      if (run.status === "COMPLETED" && answer) {
        updateAssistantMessage(messageId, { text: answer, pending: false });
        return;
      }
    } catch {
      // Keep polling while the backend run is settling.
    }
    window.setTimeout(() => { void pollQuestionRun(runId, messageId, attempt + 1); }, 2500);
  }

  async function sendQuestion(text?: string) {
    const value = (text || question).trim();
    if (!value) return;
    if (!selectedCase) {
      notify("Sélectionnez un dossier avant de poser une question");
      return;
    }
    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `ai-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: userMessageId, from: "user", text: value },
      { id: assistantMessageId, from: "ai", text: "L’assistant prépare la réponse…", pending: true },
    ]);
    setQuestion("");
    try {
      const result = await apiFetch(`/api/cases/${selectedCase.id}/questions`, {
        method: "POST",
        body: JSON.stringify({ question: value, language: selectedDetail?.employee.preferred_language || "fr" }),
      }) as PlanGenerationRun;
      if (result.status === "FAILED") {
        updateAssistantMessage(assistantMessageId, { text: result.error_message || "L’assistant n’a pas pu répondre.", pending: false });
        return;
      }
      const answerData = findAnswerData(result);
      const answer = result.answer || answerData?.answer || answerData?.response;
      if (result.status === "COMPLETED" && answer) {
        updateAssistantMessage(assistantMessageId, { text: answer, pending: false });
        return;
      }
      updateAssistantMessage(assistantMessageId, { runId: result.run_id });
      void pollQuestionRun(result.run_id, assistantMessageId);
    } catch (error) {
      updateAssistantMessage(assistantMessageId, { text: error instanceof Error ? error.message : "Le backend n’a pas pu répondre.", pending: false });
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Icon name="dashboard" />Vue d’ensemble</button>
          <button className={view === "employees" ? "active" : ""} onClick={() => setView("employees")}><Icon name="users" />Employés</button>
          <button className={view === "workspace" ? "active" : ""} onClick={openLastCase}><Icon name="case" />Dossiers onboarding</button>
          <button className={view === "stats" ? "active" : ""} onClick={() => setView("stats")}><Icon name="chart" />Statistiques</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="ai-card"><Icon name="spark" size={24}/><b>Orchestration IA</b><p>Profile, Knowledge et Planning Agents connectés.</p><Status>Opérationnel</Status></div>
        <div className="profile-mini"><div className="avatar">FE</div><div><b>Fatima Ezzahra</b><span>HR Administrator</span></div><button onClick={() => setProfileMenuOpen((open) => !open)} aria-label="Menu profil">•••</button>{profileMenuOpen && <div className="profile-menu"><button onClick={() => { setView("dashboard"); setProfileMenuOpen(false); }}>Vue d’ensemble</button><button onClick={() => { setView("stats"); setProfileMenuOpen(false); }}>Statistiques</button><button onClick={() => { window.localStorage.removeItem(AUTH_TOKEN_KEY); setProfileMenuOpen(false); notify("Session locale réinitialisée"); }}>Déconnexion</button></div>}</div>
      </aside>

      <main className="main">
        <header>
          <div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="header-actions"><button className="icon-button"><Icon name="search" /></button><button className="icon-button notification"><Icon name="bell" /><i /></button><button className="primary" onClick={openNewEmployeeForm}><Icon name="plus" />Nouvel employé</button></div>
        </header>

        {view === "dashboard" && (
          <div className="page">
            <section className="hero">
              <div><span className="eyebrow"><Icon name="spark" size={15}/> NEX TALENT INTELLIGENCE</span><h2>{stats?.active_cases ?? 0} dossiers actifs<br/>pilotés par l’IA.</h2><p>{stats?.plans ?? 0} plans persistés, {stats?.running_agents ?? 0} agents en cours, et {stats?.employees ?? employees.length} profils synchronisés depuis le backend.</p><button onClick={openLastCase}><span>Ouvrir le dernier dossier</span><Icon name="arrow"/></button></div>
              <div className="hero-art"><div className="orbit o1"/><div className="orbit o2"/><div className="ai-core"><small>AI</small><b>{stats?.plans ?? 0}</b><span>Plans</span></div><div className="node n1">{stats?.cases_by_status?.READY_FOR_PLAN ?? 0} prêts</div><div className="node n2">{stats?.cases_by_status?.REVIEW ?? 0} review</div><div className="node n3">{stats?.cases_by_status?.ACTIVE ?? 0} actifs</div></div>
            </section>

            <section className="stats-grid">
              <article><div className="stat-icon purple"><Icon name="case"/></div><div><span>Dossiers actifs</span><b>{stats?.active_cases ?? "…"}</b><small>Depuis PostgreSQL</small></div></article>
              <article><div className="stat-icon teal"><Icon name="check"/></div><div><span>Plans générés</span><b>{stats?.plans ?? "…"}</b><small>Plans persistés</small></div></article>
              <article><div className="stat-icon blue"><Icon name="clock"/></div><div><span>Agents en cours</span><b>{stats?.running_agents ?? "…"}</b><small>Runs backend actifs</small></div></article>
              <article><div className="stat-icon amber"><Icon name="users"/></div><div><span>Employés</span><b>{stats?.employees ?? employees.length}</b><small><em className="warm">Synchronisés</em></small></div></article>
            </section>

            <section className="content-grid">
              <article className="panel wide">
                <div className="panel-head"><div><h3>Intégrations récentes</h3><p>Les derniers dossiers créés ou mis à jour.</p></div><button onClick={() => setView("employees")}>Voir tout <Icon name="arrow" size={15}/></button></div>
                <div className="employee-list">
                  {loadingEmployees && <div className="empty-state">Chargement des employés…</div>}
                  {!loadingEmployees && employees.length === 0 && <div className="empty-state">Aucun employé dans le backend.</div>}
                  {employees.slice(0, 5).map((employee) => <button key={employee.id} className="employee-row" onClick={() => selectEmployee(employee.id)}><div className={`person-avatar ${employee.color}`}>{employee.initials}</div><div className="person"><b>{employee.name}</b><span>{employee.role} · {employee.department}</span></div><Status tone={employee.color}>{employee.status}</Status><Icon name="arrow" size={16}/></button>)}
                </div>
              </article>
              <article className="panel">
                <div className="panel-head"><div><h3>Activité des agents</h3><p>Dernières 24 heures</p></div><Status>En direct</Status></div>
                <div className="agent-flow">
                  <div><span className="flow-icon"><Icon name="users"/></span><p><b>Employés</b><small>{stats?.employees ?? employees.length} profils synchronisés</small></p><time>API</time></div>
                  <i />
                  <div><span className="flow-icon"><Icon name="file"/></span><p><b>Dossiers</b><small>{stats?.active_cases ?? 0} dossiers actifs</small></p><time>API</time></div>
                  <i />
                  <div><span className="flow-icon accent"><Icon name="spark"/></span><p><b>Planning Agent</b><small>{stats?.running_agents ?? 0} exécutions en cours</small></p><time>API</time></div>
                </div>
                <StatusBreakdown data={stats?.agent_runs_by_status} labels={runStatusLabels} />
              </article>
            </section>
          </div>
        )}

        {view === "employees" && (
          <div className="page">
            <section className="toolbar"><div className="search-field"><Icon name="search"/><input placeholder="Rechercher un employé…" /></div><button className="outline">Tous les départements</button><button className="outline">Tous les statuts</button><button className="primary" onClick={() => setNewEmployeeOpen(true)}><Icon name="plus" />Ajouter</button></section>
            {newEmployeeOpen && (
              <section className="panel employee-form-panel" aria-labelledby="new-employee-title">
                <div className="panel-head">
                  <div><h3 id="new-employee-title">Nouvel employé</h3><p>Créez le profil et préparez son dossier d’intégration.</p></div>
                  <button type="button" onClick={() => setNewEmployeeOpen(false)} aria-label="Fermer le formulaire"><Icon name="close" size={17}/></button>
                </div>
                <form className="employee-form" onSubmit={createEmployee}>
                  <label><span>Prénom</span><input value={employeeForm.firstName} onChange={(e) => updateEmployeeForm("firstName", e.target.value)} required /></label>
                  <label><span>Nom</span><input value={employeeForm.lastName} onChange={(e) => updateEmployeeForm("lastName", e.target.value)} required /></label>
                  <label><span>Email</span><input type="email" value={employeeForm.email} onChange={(e) => updateEmployeeForm("email", e.target.value)} required /></label>
                  <label><span>Poste</span><input value={employeeForm.role} onChange={(e) => updateEmployeeForm("role", e.target.value)} required /></label>
                  <label><span>Département</span><select value={employeeForm.department} onChange={(e) => updateEmployeeForm("department", e.target.value)}><option>Engineering</option><option>Data & Insights</option><option>Product</option><option>People</option><option>Sales</option></select></label>
                  <label><span>Date de début</span><input type="date" value={employeeForm.startDate} onChange={(e) => updateEmployeeForm("startDate", e.target.value)} required /></label>
                  <label><span>Manager</span><input value={employeeForm.manager} onChange={(e) => updateEmployeeForm("manager", e.target.value)} /></label>
                  <label><span>Mode de travail</span><select value={employeeForm.workMode} onChange={(e) => updateEmployeeForm("workMode", e.target.value)}><option>Hybride</option><option>Présentiel</option><option>Remote</option></select></label>
                  <div className="form-actions"><button type="button" className="outline" onClick={() => setNewEmployeeOpen(false)} disabled={employeeSaving}>Annuler</button><button className="primary" type="submit" disabled={employeeSaving}><Icon name="check" />{employeeSaving ? "Création…" : "Créer l’employé"}</button></div>
                </form>
              </section>
            )}
            <section className="panel employee-table">
              <div className="table-head"><span>Employé</span><span>Poste</span><span>Département</span><span>Statut</span><span /></div>
              {loadingEmployees && <div className="empty-state">Chargement depuis le backend…</div>}
              {!loadingEmployees && employees.length === 0 && <div className="empty-state">Aucun employé trouvé.</div>}
              {employees.map((employee) => <button key={employee.id} className="table-row" onClick={() => selectEmployee(employee.id)}><span className="person-cell"><i className={`person-avatar ${employee.color}`}>{employee.initials}</i><i><b>{employee.name}</b><small>{employee.email}</small></i></span><span>{employee.role}</span><span>{employee.department}</span><Status tone={employee.color}>{employee.status}</Status><Icon name="arrow" size={16}/></button>)}
            </section>
          </div>
        )}

        {view === "stats" && (
          <div className="page">
            <section className="stats-grid">
              <article><div className="stat-icon amber"><Icon name="users"/></div><div><span>Employés</span><b>{stats?.employees ?? employees.length}</b><small>Profils backend</small></div></article>
              <article><div className="stat-icon purple"><Icon name="case"/></div><div><span>Dossiers actifs</span><b>{stats?.active_cases ?? 0}</b><small>Hors complétés</small></div></article>
              <article><div className="stat-icon teal"><Icon name="check"/></div><div><span>Plans</span><b>{stats?.plans ?? 0}</b><small>Persistés PostgreSQL</small></div></article>
              <article><div className="stat-icon blue"><Icon name="clock"/></div><div><span>Agents en cours</span><b>{stats?.running_agents ?? 0}</b><small>Runs RUNNING</small></div></article>
            </section>
            <section className="stats-panels">
              <article className="panel"><div className="panel-head"><div><h3>Dossiers par statut</h3><p>Source onboarding_cases</p></div></div><StatusBreakdown data={stats?.cases_by_status} labels={caseStatusLabels} /></article>
              <article className="panel"><div className="panel-head"><div><h3>Plans par statut</h3><p>Source plans</p></div></div><StatusBreakdown data={stats?.plans_by_status} /></article>
              <article className="panel"><div className="panel-head"><div><h3>Runs agents</h3><p>Plan et assistant</p></div></div><StatusBreakdown data={stats?.agent_runs_by_status} labels={runStatusLabels} /></article>
              <article className="panel"><div className="panel-head"><div><h3>Questions assistant</h3><p>Source questions</p></div></div><StatusBreakdown data={stats?.questions_by_status} labels={questionStatusLabels} /></article>
            </section>
          </div>
        )}

        {view === "workspace" && (
          <div className="workspace">
            <section className="workspace-top">
              <div className="workspace-person"><div className={`person-avatar ${selectedEmployee?.color || "amber"} big`}>{selectedEmployee?.initials || "NE"}</div><div><h2>{selectedEmployee?.name || "Aucun employé sélectionné"}</h2><p>{selectedEmployee?.email || "Ouvrez un employé depuis la liste"}</p></div>{selectedEmployee && <Status tone={selectedEmployee.color}>{selectedEmployee.status}</Status>}</div>
              <div className="workspace-actions"><button className="outline" onClick={() => setView("employees")}><Icon name="users"/>Liste</button><button className="primary" onClick={generatePlan} disabled={planRunning || !selectedCase || selectedCase.status === "DRAFT"}><Icon name="spark"/>{planRunning ? "Génération…" : "Générer le plan"}</button></div>
            </section>
            <div className="tabs">{(["overview","plan","assistant","activity"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{({overview:"Aperçu",plan:"Plan",assistant:"Assistant IA",activity:"Activité"} as Record<Tab,string>)[item]}</button>)}</div>

            {planRunning && <section className="running"><div className="spinner"/><div><b>Création du plan personnalisé…</b><p>Analyse du profil · Recherche des connaissances · Construction du plan</p></div></section>}

            {tab === "overview" && <div className="workspace-grid">
              <article className="panel profile-card"><div className="panel-head"><div><h3>Informations employé</h3><p>{loadingDetail ? "Chargement du dossier…" : "Données synchronisées avec l’API"}</p></div></div><dl><div><dt>Poste</dt><dd>{selectedEmployee?.role || "Non sélectionné"}</dd></div><div><dt>Département</dt><dd>{selectedEmployee?.department || "Non renseigné"}</dd></div><div><dt>Pays</dt><dd>{selectedDetail?.employee.country || "Non renseigné"}</dd></div><div><dt>Mode de travail</dt><dd>{selectedEmployee?.workMode || "Non renseigné"}</dd></div><div><dt>Date de début</dt><dd>{formatDate(selectedEmployee?.startDate)}</dd></div><div><dt>Manager ID</dt><dd>{selectedEmployee?.managerId || "Non renseigné"}</dd></div></dl></article>
              <article className="panel document-card">
                <div className="panel-head"><div><h3>CV employé</h3><p>{selectedCase ? `Case ${selectedCase.id}` : "Aucun dossier chargé"}</p></div></div>
                <div className="document"><span><Icon name="file"/></span><div><b>{cvFileName || (selectedCase?.status === "DRAFT" ? "Aucun CV traité" : "CV traité côté backend")}</b><small>{cvExtraction?.document_id ? `Document ${cvExtraction.document_id}` : selectedCase ? `${selectedCase.duration_days} jours · statut ${selectedCase.status}` : "Sélectionnez un employé"}</small></div>{selectedEmployee && <Status tone={selectedEmployee.color}>{selectedEmployee.status}</Status>}</div>
                <label className={`upload-box ${cvUploading ? "uploading" : ""}`}>
                  <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={cvUploading || !selectedCase} onChange={(event) => { void uploadCv(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  <span><Icon name="file" />{cvUploading ? "Traitement du CV…" : "Uploader un CV"}</span>
                  <small>PDF, DOCX ou TXT · le backend extrait le texte et passe le dossier en prêt pour plan.</small>
                </label>
                <div className="quality"><Icon name={selectedCase?.status === "DRAFT" ? "file" : "check"}/><p><b>{selectedCase?.status === "DRAFT" ? "CV requis" : "Génération du plan activée"}</b><span>{cvExtraction?.quality?.text_extraction_method ? `Extraction ${cvExtraction.quality.text_extraction_method} · qualité ${cvExtraction.quality.text_quality}` : selectedCase?.status === "DRAFT" ? "Upload CV avant génération du plan." : "Le bouton Générer le plan est maintenant disponible."}</span></p></div>
              </article>
              <article className="panel ai-profile"><div className="panel-head"><div><h3>Synchronisation backend</h3><p>{selectedEmployee ? `Employé ${selectedEmployee.id}` : "Aucun employé sélectionné"}</p></div><span className="ai-badge"><Icon name="spark"/>API</span></div><p className="summary">{selectedEmployee ? `${selectedEmployee.name} est chargé depuis /api/employees/${selectedEmployee.id}. Les détails affichés ici viennent de PostgreSQL via le backend FastAPI.` : "Ouvrez un employé depuis la table pour charger ses détails."}</p><h4>Champs disponibles</h4><div className="chips"><span>Employee <b>API</b></span><span>Case <b>{selectedCase?.status || "N/A"}</b></span><span>Version <b>{selectedCase?.case_version ?? "N/A"}</b></span></div></article>
            </div>}

            {tab === "plan" && <div className="plan-layout">
              <section className="plan-main">
                <div className="plan-summary"><div><span className="eyebrow">PLAN PERSONNALISÉ · BACKEND</span><h2>{currentPlan?.plan.title || (planPending ? "Plan en cours de génération" : "Aucun plan généré")}</h2><p>{currentPlan ? `Plan ${currentPlan.id} · version ${currentPlan.version} · statut ${currentPlan.status}` : planPending ? "L’orchestrateur travaille. Cette vue se mettra à jour après le callback." : selectedCase ? `Case ${selectedCase.id} · version ${selectedCase.case_version} · statut ${selectedCase.status}` : "Sélectionnez un dossier pour générer un plan."}</p></div><div className="progress-ring"><b>{planCount}</b><span>tâches</span></div></div>
                {currentPlanPhases.length > 0 ? currentPlanPhases.map((phase, phaseIndex) => (
                  <article className="phase" key={phase.phase_id || `${phase.name || phase.title || "phase"}-${phaseIndex}`}>
                    <div className="phase-head"><span>{String(phase.sequence || phaseIndex + 1).padStart(2, "0")}</span><div><h3>{phase.name || phase.title || "Phase"}</h3><p>{phase.tasks?.length || 0} tâches synchronisées</p></div></div>
                    <div className="task-list">
                      {(phase.tasks || []).map((task, taskIndex) => (
                        <div className="task" key={task.task_id || `${phase.phase_id || phaseIndex}-${taskIndex}`}>
                          <button className={`task-check ${task.status === "DONE" || task.status === "COMPLETED" ? "done" : ""}`} aria-label={task.status || "Statut tâche"}><Icon name="check" size={14}/></button>
                          <div><b>{task.title || "Tâche sans titre"}</b><small><span>{task.owner_role || "Owner"}</span>{task.target_date ? formatDate(task.target_date) : "Date à confirmer"} · {task.status || "PENDING"}</small></div>
                          {task.mandatory && <em className="mandatory">Obligatoire</em>}
                        </div>
                      ))}
                      {(phase.tasks || []).length === 0 && <div className="empty-state">Cette phase ne contient aucune tâche.</div>}
                    </div>
                  </article>
                )) : (
                  <article className="panel plan-empty"><Icon name={planPending ? "clock" : "spark"} size={24}/><div><h3>{planPending ? "Plan en cours de génération" : "Aucun plan généré"}</h3><p>{planPending ? "Le plan s’affichera automatiquement dès que le callback orchestrateur sera sauvegardé." : selectedCase?.status === "DRAFT" ? "Ajoutez et traitez un CV avant de générer le plan." : "Générez un plan pour afficher les phases et les tâches de l’agent."}</p></div></article>
                )}
              </section>
              <aside className="review-card"><Icon name="spark" size={25}/><h3>{planPending ? "RUNNING" : currentPlan?.status || selectedCase?.status || "Aucun statut"}</h3><p>{planPending ? "Le webhook a été déclenché. Le backend attend le callback final de l’orchestrateur." : selectedCase?.status === "DRAFT" ? "Le backend bloque la génération tant qu’aucun CV n’est traité." : currentPlan ? "Le plan actuel est récupéré depuis le backend." : "Les actions de plan utilisent les endpoints backend."}</p><button className="primary" onClick={generatePlan} disabled={planRunning || planPending || !selectedCase || selectedCase.status === "DRAFT"}><Icon name="spark"/>{planRunning ? "Génération…" : planPending ? "En cours…" : currentPlan ? "Regénérer" : "Générer le plan"}</button><button className="outline" onClick={approveCurrentPlan} disabled={!currentPlan || currentPlan.status === "APPROVED" || planPending}><Icon name="check"/>Approuver</button><button className="outline" onClick={reviseCurrentPlan} disabled={!currentPlan || planRunning || planPending}><Icon name="edit"/>Réviser</button><div className="evidence"><b>Sources backend</b><span>{selectedEmployee?.id || "employee_id manquant"}</span><span>{selectedCase?.id || "case_id manquant"}</span><span>{currentPlan?.id || "plan non généré"}</span></div></aside>
            </div>}

            {tab === "assistant" && <div className="assistant-layout">
              <section className="chat-panel"><div className="chat-head"><div className="ai-avatar"><Icon name="spark"/></div><div><b>Assistant onboarding</b><span><i/>{selectedCase ? `Connecté au dossier ${selectedCase.id}` : "Aucun dossier sélectionné"}</span></div></div><div className="messages">{messages.map((message) => <div className={`message ${message.from} ${message.pending ? "pending" : ""}`} key={message.id}>{message.from === "ai" && <div className="ai-avatar small"><Icon name="spark" size={15}/></div>}<div><p>{message.text}</p></div></div>)}</div><div className="suggestions">{["Quel est le statut du dossier ?","Quels documents manquent ?","Peut-on générer le plan ?"].map((s) => <button onClick={() => sendQuestion(s)} key={s}>{s}</button>)}</div><div className="composer"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendQuestion()} placeholder="Posez une question sur ce dossier…" /><button onClick={() => sendQuestion()}><Icon name="send"/></button></div></section>
              <aside className="assistant-scope"><h3>Contexte disponible</h3><div><Icon name="users"/><p><b>Profil employé</b><span>{selectedEmployee?.name || "Non sélectionné"}</span></p><Icon name="check" size={16}/></div><div><Icon name="case"/><p><b>Dossier onboarding</b><span>{selectedCase?.status || "Non chargé"}</span></p><Icon name="check" size={16}/></div><div><Icon name="file"/><p><b>CV</b><span>{selectedCase?.status === "DRAFT" ? "Requis" : "Statut traité ou prêt"}</span></p><Icon name="check" size={16}/></div><p className="scope-note">Les questions partent vers /api/cases/:id/questions quand un dossier est sélectionné.</p></aside>
            </div>}

            {tab === "activity" && <section className="panel runs"><div className="panel-head"><div><h3>Historique des générations</h3><p>{selectedCase ? `Case ${selectedCase.id}` : "Aucun dossier sélectionné"}</p></div><button className="outline" onClick={() => { if (selectedCase) void loadPlanHistory(selectedCase.id); }}>Rafraîchir</button></div><div className="table-head runs-head"><span>Run</span><span>Statut</span><span>Démarré</span><span>Fin</span><span>Raison</span></div>{planHistory.length === 0 && <div className="empty-state">Aucune génération de plan enregistrée.</div>}{planHistory.map((run) => <button className="table-row runs-row" key={run.run_id} onClick={() => notify(run.error_message || `Run ${run.run_id}`)}><b>{run.run_id}</b><Status tone={run.status === "FAILED" ? "amber" : run.status === "COMPLETED" ? "teal" : "blue"}>{run.status}</Status><span>{run.started_at ? formatDate(run.started_at) : "N/A"}</span><span>{run.completed_at ? formatDate(run.completed_at) : "En cours"}</span><span>{run.error_message || run.error_code || "Aucune erreur"}</span></button>)}</section>}
          </div>
        )}
      </main>
      {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
    </div>
  );
}
