# AI-Powered Support Agent - Architecture

This document outlines the architecture for an AI-powered automatic support agent for the MiniMaster project. The agent will analyze new support tickets, generate solutions using OpenAI, and propose them to the user.

## 1. Core Concepts

*   **Automation:** Automatically process new support tickets to provide instant solutions.
*   **AI-Powered:** Leverage a Large Language Model (LLM) like OpenAI's GPT to understand user problems and generate human-like solutions.
*   **Knowledge Base:** Provide the AI with a knowledge base of project documentation to ensure accurate and context-aware answers.
*   **User Feedback Loop:** Allow users to accept the AI's solution or request human intervention, which helps improve the system over time.
*   **Seamless Integration:** The AI agent acts as the first line of support, with a clear escalation path to a human operator.

## 2. Data Model Changes (Firestore)

We will extend the `supportTickets` collection with new fields:

```json
{
  "ticketId": "<auto-id>",
  "masterImei": "<user-imei>",
  "createdAt": "<timestamp>",
  "status": "open" | "awaiting_user_feedback" | "closed_by_ai" | "escalated" | "closed",
  "problemDescription": "<user-provided-text>",
  "accessGranted": true | false,
  "accessGrantId": "<grant-id>",

  // New AI-related fields
  "aiGeneratedSolution": "<text-solution-generated-by-ai>",
  "aiSolutionStatus": "pending" | "generated" | "accepted" | "rejected",
  "aiConfidenceScore": 0.85 // (0.0 to 1.0)
}
```

## 3. Knowledge Base

To provide accurate solutions, the AI needs context about the MiniMaster project. We will create a simple knowledge base by concatenating all existing Markdown documentation files into a single text file (`knowledge_base.txt`).

**Files to include:**
*   `README.md`
*   `docs/DEPLOYMENT_GUIDE.md`
*   `docs/PRIVACY_POLICY.md`
*   `docs/SUPPORT_INTERFACE_ARCHITECTURE.md`
*   And all other relevant `.md` files.

This `knowledge_base.txt` will be passed to the AI as part of the prompt.

## 4. Backend (Cloud Functions)

We will add a new Cloud Function triggered by the creation of a new support ticket.

### `onTicketCreated` (Firestore Trigger)

*   **Trigger:** `onCreate` on the `supportTickets` collection.
*   **Action:**
    1.  Reads the `problemDescription` from the new ticket.
    2.  Constructs a prompt for the OpenAI API, including the user's problem and the content of `knowledge_base.txt`.
    3.  Calls the OpenAI API (e.g., `gpt-4.1-mini`) to generate a solution.
    4.  Parses the AI's response to extract the solution text and a confidence score.
    5.  Updates the `supportTickets` document with the `aiGeneratedSolution`, `aiConfidenceScore`, and sets the status to `awaiting_user_feedback`.
    6.  Triggers a push notification to the user with the proposed solution.

## 5. OpenAI Integration

*   We will use the `openai` npm package with the OpenAI-compatible API.
*   The OpenAI API key will be stored securely as a Firebase environment variable (`process.env.OPENAI_API_KEY`).
*   We use **Gemini 2.5 Flash** for cost efficiency (50% cheaper than GPT-4.1-mini) and fast response times.
*   The prompt will be carefully engineered to instruct the AI to act as a MiniMaster support agent and provide clear, step-by-step solutions based on the provided knowledge base.

**Example Prompt:**

```
You are a helpful support agent for the MiniMaster application. A user has submitted the following support request:

"[USER_PROBLEM_DESCRIPTION]"

Based on the following knowledge base, provide a clear, step-by-step solution to the user's problem. If you are not confident in your answer, state that you are escalating the ticket to a human agent.

Knowledge Base:
"[CONTENT_OF_KNOWLEDGE_BASE_TXT]"

Your response should be in JSON format with two fields: "solution" (string) and "confidence" (float between 0 and 1).
```

## 6. Frontend UI/UX

### Web-Control (Parent App)

*   The "My Support Tickets" view will be updated to display the AI-generated solution.
*   A new section will appear for tickets with status `awaiting_user_feedback`:
    *   Displays the `aiGeneratedSolution`.
    *   Provides two buttons: "This solved my problem" and "I still need help".

### Admin Panel

*   The support ticket list will show the new statuses (`awaiting_user_feedback`, `closed_by_ai`, `escalated`).
*   The ticket detail view will display the `aiGeneratedSolution` and `aiConfidenceScore`.

## 7. End-to-End Workflow

1.  **User creates a ticket:** The `onTicketCreated` function is triggered.
2.  **AI analyzes and solves:** The function calls OpenAI, gets a solution, and updates the ticket. Status becomes `awaiting_user_feedback`.
3.  **User is notified:** A push notification informs the user that a solution has been proposed.
4.  **User reviews solution:**
    *   **If the user accepts:** The user clicks "This solved my problem". The ticket status is updated to `closed_by_ai`.
    *   **If the user rejects:** The user clicks "I still need help". The ticket status is updated to `escalated`, and the human support team is notified (e.g., via email or a special view in the Admin Panel).
5.  **Human intervention:** The human support team takes over `escalated` tickets.

This architecture provides a powerful, automated first line of support while ensuring a smooth escalation path to human agents when needed.
