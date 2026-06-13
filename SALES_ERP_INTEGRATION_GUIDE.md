# Design Flow — Sales ERP Integration Guide

**Version:** 2.1  
**Date:** June 11, 2026  
**Contact:** ai.linkdprints@gmail.com

---

## Overview

Design Flow accepts inbound API calls from Sales ERP to:
- **Push design tasks** into the designer pool (auto-assigned via FIFO queue)
- **Push sample requests** into pending samples (coordinator processes them)
- **Push sample development details** (fabric widths, sample types, quantities) with the sample or after creation
- **Push Full Kitting details** with the task or after creation
- **Update tasks** (add FK, change priority, update brief)
- **Update samples** (add development details, change fabric, update meters)
- **Poll status** of any task or sample by your reference ID
- **Receive webhooks** when a task/sample status changes (optional)

All communication is JSON over HTTPS. No SDK required — standard HTTP calls.

---

## Authentication

Every request must include **two headers**:

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <API_KEY>` |
| `apikey` | `sb_publishable_S1LUP45XZXPOu3Fpcm_ajg_tAsMrv5-` |

The `apikey` header is required by the Supabase gateway for routing. The `Authorization` header carries your secret API key for authentication.

**Your API key** will be provided separately by the Design Flow admin. It looks like: `sk_live_xxxxxxxxxxxxxxxx...`

> **Important:** Keep your API key secret. If compromised, contact the Design Flow admin to regenerate it (the old key stops working immediately).

> **Two secrets, two purposes — don't interchange them:**
> - **API key** (`sk_live_…`, above) authenticates **your** calls **to us** (the `ext-*` endpoints).
> - **Webhook secret** (a *separate* value, provided separately) is used **only** to verify the `X-Signature` on the callbacks **we** send **to you** (see §6 Webhooks). It is **not** the API key.

---

## Base URL

```
https://jyfwyfpwbbgfpsntubfy.functions.supabase.co
```

---

## Endpoints

### 1. Create Task (Push design work into pool)

```
POST /ext-create-task
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ref_id` | string | Yes | Your unique reference ID (e.g. `"ERP-1234"`). Used for dedup — sending the same `ref_id` twice returns the existing task instead of creating a duplicate. |
| `customer_name` | string | Yes | Party/client name (e.g. `"Sarthi Fashion"`). Auto-matched to existing parties; auto-created if new. |
| `qty` | number | Yes | Number of designs requested. Must be >= 1. |
| `description` | string | No | Design description or instructions. |
| `priority` | string | No | `"normal"` (default) or `"urgent"`. |
| `brief_type` | string | No | `"job_work"` (default) or `"ld"`. Use `"job_work"` for external client orders. |
| `requires_full_kitting` | boolean | No | **Defaults to `true`** — every ERP task requires Full Kitting unless you explicitly send `false`. Also auto-set to `true` when a `full_kitting` object is provided. |
| `full_kitting` | object | No | Full Kitting details (see below). If provided, FK is pre-populated and the designer can complete immediately. |
| `callback_url` | string | No | Your webhook URL. Design Flow will POST status updates here when the task progresses. |
| `brief` | object | No | Any additional fields from your system. Stored as-is and visible to coordinators in the task detail drawer. |

**`full_kitting` Object (optional):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image_url` | string | No | Public URL of the FK form image. Design Flow downloads and stores a copy. |
| `fabric_details` | string | No | Fabric specifications |
| `colors` | string | No | Color details |
| `quantity` | number | No | Quantity for kitting |
| `accessories` | string | No | Accessories list |
| `special_instructions` | string | No | Special handling notes |
| `packing_type` | string | No | `"standard"` (default), `"premium"`, `"bulk"`, or `"custom"` |
| `priority` | string | No | FK priority: `"very_urgent"`, `"2_days"`, `"3_days"`, `"4_days"`, `"5_days"` |
| `form_date` | string | No | Date of the FK form (ISO format, e.g. `"2026-06-11"`) |

> **How Full Kitting works in Design Flow:**
> - **By default every ERP task requires Full Kitting** (mirroring internal admin/coordinator briefs). The designer can claim and start work, but **cannot complete** until FK details exist — and a Design Flow coordinator gets an automatic to-do to add them.
> - If you send `full_kitting` with the task → FK is pre-populated, designer can complete without waiting.
> - If you send neither `full_kitting` nor the flag → FK is **still required**; a coordinator uploads the FK details in Design Flow.
> - To create a task that does **not** need FK, send `requires_full_kitting: false` explicitly.

**Example — Task with Full Kitting:**

```json
{
  "ref_id": "ERP-ORD-2026-0451",
  "customer_name": "Sarthi Fashion",
  "qty": 10,
  "description": "Floral print design on cotton silk, 3 colorways",
  "priority": "urgent",
  "brief_type": "job_work",
  "full_kitting": {
    "image_url": "https://your-erp.com/files/fk-form-0451.jpg",
    "fabric_details": "Cotton Silk 60gm, Width: 44 inches",
    "colors": "Red/Gold, Blue/Silver, Green/Cream",
    "quantity": 10,
    "accessories": "None",
    "special_instructions": "Match Pantone 185C for red colorway",
    "packing_type": "premium",
    "priority": "2_days"
  },
  "callback_url": "https://your-erp.com/api/design-flow-webhook",
  "brief": {
    "fabric": "Cotton Silk 60gm",
    "colors": ["Red/Gold", "Blue/Silver", "Green/Cream"],
    "deadline": "2026-06-20",
    "sales_rep": "Rahul M.",
    "po_number": "PO-2026-0451"
  }
}
```

**Example — Task requiring FK (coordinator will add later):**

```json
{
  "ref_id": "ERP-ORD-2026-0452",
  "customer_name": "Sarthi Fashion",
  "qty": 5,
  "requires_full_kitting": true,
  "callback_url": "https://your-erp.com/api/design-flow-webhook"
}
```

**Success Response (201):**

```json
{
  "task_id": "a1b2c3d4-...",
  "task_code": "DF-A-0612-001",
  "status": "pool",
  "requires_full_kitting": true,
  "full_kitting_added": true,
  "ref_id": "ERP-ORD-2026-0451",
  "message": "Task created with Full Kitting details (image stored)"
}
```

**Duplicate Response (200):**

If the same `ref_id` is sent again:

```json
{
  "task_id": "a1b2c3d4-...",
  "task_code": "DF-A-0612-001",
  "status": "in_progress",
  "message": "Task already exists for this ref_id"
}
```

---

### 2. Update Task (Push FK or other changes after creation)

```
PUT /ext-update-task
Content-Type: application/json
```

Use this endpoint to add Full Kitting details to an existing task, or update priority/description/brief.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ref_id` | string | One of these | Your reference ID from the original create call |
| `task_id` | string | required | Design Flow's task UUID (from the create response) |
| `full_kitting` | object | No | Full Kitting details (same schema as create — see above) |
| `priority` | string | No | Updated priority (`"normal"` or `"urgent"`) |
| `description` | string | No | Updated description |
| `brief` | object | No | Updated brief metadata (replaces the existing `external_brief`) |
| `callback_url` | string | No | Updated webhook URL |

**Example — Add FK to existing task:**

```json
{
  "ref_id": "ERP-ORD-2026-0452",
  "full_kitting": {
    "image_url": "https://your-erp.com/files/fk-form-0452.jpg",
    "fabric_details": "Georgette 40gm, Width: 44 inches",
    "colors": "Navy/Gold",
    "packing_type": "standard",
    "priority": "3_days"
  }
}
```

**Success Response (200):**

```json
{
  "task_id": "e5f6g7h8-...",
  "task_code": "DF-A-0612-002",
  "status": "pool",
  "changes": ["requires_full_kitting", "full_kitting_added"],
  "full_kitting_added": true,
  "message": "Task updated: requires_full_kitting, full_kitting_added"
}
```

**Behavior notes:**
- If FK details already exist for the task, the endpoint **updates** them (merges new fields)
- If no FK details exist, the endpoint **creates** the FK record
- The image from `image_url` is downloaded and stored in Design Flow's storage
- Sending `full_kitting` automatically sets `requires_full_kitting: true`

---

### 3. Create Sample (Push sample request)

```
POST /ext-create-sample
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ref_id` | string | Yes | Your unique reference ID for this sample. |
| `customer_name` | string | Yes | Party/client name. |
| `fabric` | string | No | Fabric type (e.g. `"Georgette"`, `"Cotton Silk"`). |
| `sample_types` | string[] | No | Array of design types. First value is used as primary. |
| `meters` | number | No | Meters of fabric. |
| `requires_full_kitting` | boolean | No | `true` to flag that sample development details are needed. Auto-set when `sample_development` is provided. |
| `sample_development` | object | No | Sample development / Full Kitting details (see below). |
| `callback_url` | string | No | Your webhook URL for status updates. |
| `brief` | object | No | Any additional context from your system. |

**`sample_development` Object (optional):**

This is the equivalent of "Full Kitting" for samples. In Design Flow, task FK captures image-based form data; sample development captures the sampling specification (what formats to produce, in which widths, etc.).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `design_count` | number | No | Number of designs to produce |
| `fabric_type` | string | No | Fabric type for sampling |
| `fabric_widths` | string[] | No | Array of fabric widths, e.g. `["36\"", "44\"", "54\""]` |
| `sample_types` | string[] | No | Array of sample formats, e.g. `["6×4\"", "8×8\"", "Booklet (12×18\")"]` |
| `actual_meters` | number | No | Actual sampling quantity in meters |

> **Available fabric widths:** `36"`, `44"`, `48"`, `54"`, `58"`, `60"`, `64"`, `72"`
>
> **Available sample types:** `6×4"`, `6×6"`, `8×8"`, `9×9"`, `11×11"`, `15×15"`, `3-Fold Card (8×18")`, `Booklet (12×18")`, `Blanket (72×90")`, `Master Folder (36×54")`, `Yardage (36×100")`, `Panel (18×24")`

**Example — Sample with development details:**

```json
{
  "ref_id": "ERP-SAMP-2026-0089",
  "customer_name": "Sarthi Fashion",
  "fabric": "Georgette 40gm",
  "sample_types": ["Block Print"],
  "meters": 25,
  "sample_development": {
    "design_count": 10,
    "fabric_type": "Georgette 40gm",
    "fabric_widths": ["44\"", "54\""],
    "sample_types": ["6×4\"", "8×8\"", "Booklet (12×18\")"],
    "actual_meters": 25
  },
  "callback_url": "https://your-erp.com/api/design-flow-webhook"
}
```

**Example — Simple sample (coordinator fills development in Design Flow):**

```json
{
  "ref_id": "ERP-SAMP-2026-0089",
  "customer_name": "Sarthi Fashion",
  "fabric": "Georgette 40gm",
  "sample_types": ["Block Print"],
  "meters": 25,
  "callback_url": "https://your-erp.com/api/design-flow-webhook",
  "brief": {
    "notes": "Match Pantone 185C exactly",
    "urgency": "standard",
    "buyer": "Export - Dubai"
  }
}
```

**Success Response (201):**

```json
{
  "sample_id": "e5f6g7h8-...",
  "uid": "SMP-2026-0042",
  "status": "pending",
  "development_added": true,
  "message": "Sample created with development details"
}
```

---

### 4. Update Sample (Push development details or other changes)

```
PUT /ext-update-sample
Content-Type: application/json
```

Use this endpoint to add sample development details to an existing sample, or update fabric/meters.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ref_id` | string | One of these | Your reference ID from the original create call |
| `sample_id` | string | required | Design Flow's sample UUID (from the create response) |
| `sample_development` | object | No | Sample development details (same schema as create — see §3 above) |
| `fabric` | string | No | Updated fabric type |
| `actual_meters` | number | No | Updated actual sampling meters |
| `requirement` | string | No | Updated requirement |
| `callback_url` | string | No | Updated webhook URL |
| `brief` | object | No | Updated brief metadata |

**Example — Add development details to existing sample:**

```json
{
  "ref_id": "ERP-SAMP-2026-0089",
  "sample_development": {
    "design_count": 10,
    "fabric_type": "Georgette 40gm",
    "fabric_widths": ["44\"", "54\""],
    "sample_types": ["6×4\"", "8×8\""],
    "actual_meters": 25
  }
}
```

**Success Response (200):**

```json
{
  "sample_id": "e5f6g7h8-...",
  "uid": "SMP-2026-0042",
  "status": "pending",
  "changes": ["requires_full_kitting", "development_added"],
  "development_added": true,
  "message": "Sample updated: requires_full_kitting, development_added"
}
```

**Behavior notes:**
- If development details already exist for the sample, the endpoint **updates** them
- If no development details exist, the endpoint **creates** the record
- Sending `sample_development` automatically sets `requires_full_kitting: true`
- The development form in Design Flow pre-fills from ERP data but remains editable by coordinators

---

### 5. Check Status (Poll anytime)

```
GET /ext-status?type=task&ref_id=ERP-ORD-2026-0451
GET /ext-status?type=sample&ref_id=ERP-SAMP-2026-0089
```

You can also query by Design Flow's internal ID:

```
GET /ext-status?type=task&id=a1b2c3d4-...
```

**Task Status Response:**

```json
{
  "id": "a1b2c3d4-...",
  "code": "DF-A-0612-001",
  "ref_id": "ERP-ORD-2026-0451",
  "status": "in_progress",
  "qty": 10,
  "qty_completed": 4,
  "assigned_to": "Priya Sharma",
  "completed_at": null,
  "fabric": null
}
```

**Sample Status Response:**

```json
{
  "id": "e5f6g7h8-...",
  "uid": "SMP-2026-0042",
  "ref_id": "ERP-SAMP-2026-0089",
  "status": "in_progress",
  "party_name": "Sarthi Fashion",
  "fabric": "Georgette 40gm",
  "design_type": "Block Print",
  "printed_mtr": 15,
  "is_completed": false,
  "completed_at": null
}
```

**Task Status Values:**

| Status | Meaning |
|--------|---------|
| `pool` | Waiting in queue, not yet claimed by a designer |
| `in_progress` | Designer is actively working on it |
| `done` | Design work finished, awaiting completion details |
| `completed` | Fully done — all details recorded |

**Sample Status Values:**

| Status | Meaning |
|--------|---------|
| `pending` | Received, waiting for coordinator to start |
| `in_progress` | Sampling in progress |
| `completed` | Sample completed |

---

### 6. Webhooks (Automatic Status Updates — Optional)

If you provide a `callback_url` when creating a task or sample, Design Flow will **automatically POST** to that URL whenever the status changes.

**You don't need to poll** — updates come to you.

**Webhook Request Format:**

```
POST https://your-erp.com/api/design-flow-webhook
Content-Type: application/json
X-Event: task.completed
X-Signature: <HMAC-SHA256 hex signature>
```

**Headers:**

| Header | Description |
|--------|-------------|
| `X-Event` | Event type (see table below) |
| `X-Signature` | HMAC-SHA256 signature of the request body, using the **webhook secret** (see the callout below — this is a *separate* secret from your API key). Use it to verify the request is genuinely from Design Flow. |

> **🔑 The webhook secret is a SEPARATE secret — not your API key.**
>
> The value used to compute `X-Signature` is **NOT** your `sk_live_…` API key. It is a
> **distinct shared webhook secret**, provided to you separately by the Design Flow admin.
> Point your verification variable (e.g. `DESIGNFLOW_WEBHOOK_SECRET`) at **that** value.
> Using the API key here makes every signature mismatch → your endpoint returns 401 →
> Design Flow retries with backoff and **dead-letters after 6 attempts** (the callbacks
> silently stop). Specifically:
>
> - **Algorithm:** HMAC-SHA256
> - **Signed over:** the **raw request body bytes** — HMAC the exact bytes you receive;
>   do **not** re-parse and re-serialize the JSON first (key order/whitespace would change the digest).
> - **Encoding:** lowercase **hex**
> - **Header:** `X-Signature` (event type in `X-Signature`'s sibling header `X-Event`)

**Task Webhook Events:**

| Event | When it fires |
|-------|---------------|
| `task.claimed` | A designer claimed the task from the pool |
| `task.progress` | Design work marked as done (awaiting completion) |
| `task.completed` | Task fully completed with all details |
| `task.returned` | Task returned to the pool (designer reassignment) |
| `task.fk_added` | Full Kitting form photo uploaded by coordinator |
| `task.fk_completed` | Full Kitting form fully digitized (all details captured) |

**Task Webhook Payload (status events):**

```json
{
  "event": "task.completed",
  "ref_id": "ERP-ORD-2026-0451",
  "design_flow_id": "a1b2c3d4-...",
  "design_flow_code": "DF-P-0612-001",
  "status": "completed",
  "qty": 10,
  "qty_completed": 10,
  "completed_at": "2026-06-15T14:30:00Z",
  "fabric": "Cotton Silk 60gm",
  "details": {
    "delay_days": 0,
    "sampling_required": true
  }
}
```

**Task Webhook Payload (FK events):**

```json
{
  "event": "task.fk_added",
  "ref_id": "ERP-ORD-2026-0451",
  "design_flow_id": "a1b2c3d4-...",
  "design_flow_code": "DF-A-0612-001",
  "status": "pool",
  "full_kitting": {
    "image_uploaded": true,
    "data_entry_status": "pending_deo",
    "requires_full_kitting": true
  }
}
```

```json
{
  "event": "task.fk_completed",
  "ref_id": "ERP-ORD-2026-0451",
  "design_flow_id": "a1b2c3d4-...",
  "design_flow_code": "DF-A-0612-001",
  "status": "in_progress",
  "full_kitting": {
    "data_entry_status": "completed",
    "completed_at": "2026-06-14T10:30:00Z",
    "form_data_available": true
  }
}
```

**Sample Webhook Events:**

| Event | When it fires |
|-------|---------------|
| `sample.in_progress` | Coordinator started working on the sample (also fired on QC review→approve) |
| `sample.completed` | Sample **passed QC** and is completed (carries a `qc` summary) |
| `sample.dropped` | Sample **discarded or dropped** during QC — abandoned in Design Flow (carries `reason` + `notes`) |
| `sample.development_saved` | Development details saved or updated in Design Flow |

> **QC-resample loop is internal to Design Flow** and is **not** signalled as a terminal event — a failed-then-resampling sample stays open (you may see a `sample.in_progress` ping). You'll only get a terminal `sample.completed` (QC pass) or `sample.dropped` (discard/drop). Customer-requested changes after a pass are a **new** request from you (new `ref_id`).

**Sample Webhook Payload (status events):**

```json
{
  "event": "sample.completed",
  "ref_id": "ERP-SAMP-2026-0089",
  "design_flow_id": "e5f6g7h8-...",
  "uid": "ESMP-2026-0042",
  "status": "completed",
  "party_name": "Sarthi Fashion",
  "fabric": "Georgette 40gm",
  "is_completed": true,
  "qc": { "attempt_no": 2, "print_quality": "good", "fusing_quality": "good", "printing_operator": "…", "fusing_operator": "…", "done_date": "2026-06-13" }
}
```

**Sample Webhook Payload (`sample.dropped`):**

```json
{
  "event": "sample.dropped",
  "ref_id": "ERP-SAMP-2026-0089",
  "design_flow_id": "e5f6g7h8-...",
  "uid": "ESMP-2026-0042",
  "status": "dropped",
  "party_name": "Sarthi Fashion",
  "fabric": "Georgette 40gm",
  "reason": "discard",
  "notes": "Colour mismatch unrecoverable after 3 attempts"
}
```

**Sample Webhook Payload (development events):**

```json
{
  "event": "sample.development_saved",
  "ref_id": "ERP-SAMP-2026-0089",
  "design_flow_id": "e5f6g7h8-...",
  "design_flow_uid": "SMP-2026-0042",
  "status": "pending",
  "development": {
    "data_entry_status": "completed",
    "saved_at": "2026-06-11T10:30:00Z",
    "form_payload": {
      "design_count": 10,
      "fabric_type": "Georgette 40gm",
      "fabric_widths": ["44\"", "54\""],
      "sample_types": ["6×4\"", "8×8\"", "Booklet (12×18\")"],
      "estimated_meters": 60,
      "actual_meters": 25
    }
  }
}
```

**Verifying Webhook Signatures (recommended):**

```python
# Python example
import hmac, hashlib

def verify_signature(body_bytes, signature_header, webhook_secret):
    expected = hmac.new(
        webhook_secret.encode(),
        body_bytes,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

```javascript
// Node.js example
const crypto = require('crypto');

function verifySignature(bodyString, signatureHeader, webhookSecret) {
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(bodyString)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}
```

**Retry Policy:**
- Failed deliveries retry with exponential backoff: 1, 2, 4, 8, 16, 32 minutes
- After 6 failed attempts, the webhook is marked as dead-lettered
- Your endpoint should return HTTP 2xx within 10 seconds to count as success

---

## Full Kitting — Decision Flowchart

```
Creating a task?
│
├── FK details available NOW?
│   ├── YES → Send full_kitting object with ext-create-task
│   │         → FK is pre-populated, designer can complete immediately
│   │
│   └── NO → FK is required BY DEFAULT — just omit both fields
│       │   → Designer claims task, gets FK warning
│       │   → Coordinator gets auto-notification to add FK
│       │   → Designer CANNOT complete until FK is added
│       │
│       └── Task genuinely does NOT need FK?
│           → Send requires_full_kitting: false (opt out)
│
├── FK details arrive LATER (after task created)?
│   └── Call PUT /ext-update-task with full_kitting object
│       → Design Flow stores the FK, unblocks the designer
│
└── FK added by Design Flow coordinator?
    └── You receive task.fk_added webhook automatically
        → Update your records to reflect FK is done
```

### Sample Development — Decision Flowchart

```
Creating a sample?
│
├── Development details available NOW?
│   ├── YES → Send sample_development object with ext-create-sample
│   │         → Development form pre-filled in Design Flow
│   │         → Coordinator can view/edit, webhook fires on save
│   │
│   └── NO → Send without sample_development
│            → Coordinator fills the development form in Design Flow
│            → You receive sample.development_saved webhook
│
├── Development details arrive LATER (after sample created)?
│   └── Call PUT /ext-update-sample with sample_development object
│       → Design Flow stores the details, coordinator can edit
│
└── Development saved by Design Flow coordinator?
    └── You receive sample.development_saved webhook automatically
        → Update your records with the form_payload data
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Description of what went wrong"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad request — missing or invalid fields |
| 401 | Invalid or inactive API key |
| 404 | Resource not found (status polling or update) |
| 405 | Wrong HTTP method |
| 409 | Conflict (duplicate ref_id — returns existing resource) |
| 500 | Server error — contact Design Flow admin |

---

## Quick Start Checklist

1. Receive your **API key** from the Design Flow admin
2. Note the **apikey** gateway header value (same for all requests)
3. Test with a simple status check:
   ```
   GET /ext-status?type=task&ref_id=TEST-001
   ```
4. Create a test task with a unique `ref_id`
5. Poll its status to confirm it was created
6. (Optional) Try creating a task with `full_kitting` to test FK flow
7. (Optional) Try creating a sample with `sample_development` to test development flow
8. (Optional) Set up your webhook endpoint and provide the `callback_url`

---

## Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/ext-create-task` | Create task (with optional FK) |
| `PUT` | `/ext-update-task` | Update task (add FK, change priority/brief) |
| `POST` | `/ext-create-sample` | Create sample (with optional development details) |
| `PUT` | `/ext-update-sample` | Update sample (add development, change fabric/meters) |
| `GET` | `/ext-status` | Poll task or sample status |

---

## Rate Limits

- No hard rate limit currently enforced
- Recommended: max 10 requests/second sustained
- Bulk operations: space requests 100ms apart

---

## Support

For API issues, key regeneration, or integration questions:  
**Email:** ai.linkdprints@gmail.com

---

*This document is confidential. Do not share the API key or endpoint URLs publicly.*
