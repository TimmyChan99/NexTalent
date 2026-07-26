# NexTalent

NexTalent is an MVP HR dashboard for onboarding employees.

In simple terms, it helps an HR user upload an employee CV, add or update employee information, see dashboard stats, and use an AI assistant to generate or improve onboarding plans.

The dashboard is connected to the staging Agentic platform:

```text
https://stg-agentic.abafusion.ai/
```

That platform is built with Langflow and runs the main AI workflow used by the dashboard.

## What The Project Does

- Lets HR log in to a dashboard.
- Lets HR create and edit employee profiles.
- Lets HR upload employee CV files.
- Extracts useful CV information.
- Stores employee, case, document, plan, question, and agent run data.
- Shows HR stats about employees, onboarding cases, plans, questions, and agent runs.
- Sends onboarding requests to the AI workflow.
- Displays the generated onboarding plan or AI assistant answer in the dashboard.

## Main Parts

```text
NexTalent
├── NexTalent-app/   # HR dashboard, backend API, database models, CV upload logic
├── a2a/             # A2A server and agent communication layer
└── workflows/       # Langflow workflow exports
```

## How It Works

The HR user works inside the NexTalent dashboard.

When the HR user uploads a CV or asks the AI assistant for help, the backend prepares a request and sends it to the Agentic platform. The main workflow there is:

```text
WF-01 Agent Orchestrator
```

WF-01 is the main coordinator. It receives the request, checks it, decides what should happen next, and dispatches work to the right agent.

## Agentic Architecture

The Agentic platform uses a Langflow workflow called `WF-01 Agent Orchestrator`.

This orchestrator has:

- a security check tool, used to validate the request;
- a dispatcher tool, used to communicate with other agents;
- access to other specialized agents through the A2A server.

The A2A server handles the agent-to-agent communication. It manages:

- agent messages;
- agent cards;
- agent skills;
- task state;
- artifact exchanges;
- communication between agents.

## Agents

The orchestrator can talk to these agents:

- Profile Agent: works with employee profile and CV information.
- Planning Agent: creates, revises, adapts, or explains onboarding plans.
- Knowledge Agent: answers questions using internal onboarding knowledge.

Most agent executors are Langflow workflows. The Knowledge Agent is internal to the A2A server.

## Request Flow

```text
HR Dashboard
    |
    v
NexTalent Backend API
    |
    v
Langflow Webhook
    |
    v
WF-01 Agent Orchestrator
    |
    v
Security Check Tool
    |
    v
Dispatcher Tool
    |
    v
A2A Server
    |
    v
Profile Agent / Planning Agent / Knowledge Agent
    |
    v
Agent Result
    |
    v
Backend API callback or API response
    |
    v
Dashboard UI
```

The workflow is triggered through a webhook. After the agent finishes its work, the result is sent back through an API request and shown in the dashboard.

## Dashboard And Backend

The `NexTalent-app` folder contains the main product application.

It includes:

- a Next.js dashboard UI;
- a FastAPI backend;
- CV upload and text extraction;
- authentication;
- employee and onboarding case APIs;
- plan generation APIs;
- AI assistant question APIs;
- PostgreSQL storage for application data;
- MongoDB storage for full CV extraction results.

## A2A Server

The `a2a` folder contains the A2A communication service.

It exposes agent cards and A2A endpoints so the orchestrator can discover agents, check their skills, send messages, and receive artifacts.

The A2A server is important because it separates the main orchestrator from the specialized agents.

## Langflow Workflows

The `workflows` folder contains exported Langflow workflows, including:

- `WF-01 Agent Orchestrator.json`
- `WF-02 Profile Agent.json`
- `W-03 Knowledge Agent.json`

WF-01 is the entry point used by the NexTalent dashboard.

## Why This MVP Exists

This MVP demonstrates how an HR dashboard can be connected to an Agentic AI platform.

Instead of building all AI logic directly inside the dashboard, NexTalent sends structured requests to an orchestrator. The orchestrator then uses specialized agents to process employee data, company knowledge, and onboarding planning.

This makes the system easier to extend later with more agents, more workflows, and more HR use cases.

## Local Development

For detailed setup steps, see:

- `NexTalent-app/README.md` for the dashboard and backend.
- `a2a/README.md` for the A2A server and agent communication service.

