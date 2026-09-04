# User Story: Nursing Medication Reconciliation (Admission & Outpatient)

## Story

**As a** Nurse,
**I want to** reconcile a patient's medications during an Inpatient (Admission) or Outpatient encounter,
**so that** the care team has an accurate, signed record of what the patient is currently taking, on hold, or discontinued before the encounter is completed.

**As a** Physician,
**I want to** review and finalize the Nurse's reconciliation, and add or sign orders across all medication categories except IV,
**so that** the reconciliation session can be safely closed and the patient record locked.

## Background

- The screen is called **"Admission Reconciliation"** when the patient's current visit type is **Inpatient (Hospitalization)**, and **"Nurse Outpatient Reconciliation"** (Nurse) / **"Outpatient Reconciliation"** (Physician) when the visit type is **Outpatient**.
- Admission Reconciliation shows 4 panels: **Inpatient Medications, IV Medications, Outpatient Medications, Home Medications**.
- Outpatient Reconciliation shows only 2 panels: **Outpatient Medications, Home Medications**.
- Two roles interact with this screen: **Nurse** and **Physician**, each with different Add/Sign permissions.

## Preconditions

- A patient exists with a current visit of the type being tested (Inpatient or Outpatient).
- No unsigned orders exist anywhere for the patient (otherwise Reconciliation is blocked from opening for both roles).
- A Nurse session and a Physician session are both available (for cross-role steps).
- At least one medication not already on the patient is available to add.

## Steps

1. Open the patient and navigate to the Med Management tab.
2. Confirm the tab loads with the correct label and panel count for the visit type (Admission = 4 panels; Outpatient = 2 panels).
3. As Nurse, click **+Add** on the Home Medications panel and add a new medication.
4. Confirm the new medication does **not** appear on Reconciliation yet, but **does** appear immediately on the Orders tab (as Unreleased/unsigned).
5. Sign the medication from the Orders page (collective Sign).
6. Confirm it now appears on Reconciliation with status **Active (A)**.
7. Set the medication to **Taking**, enter a date, and click **Save**.
8. Confirm the status remains Active and the Last Taken date is recorded.
9. Switch the selection to **Not Taking**, then to **No Action Taken**, saving each time.
10. Confirm the Last Taken date does **not** change or clear when switching between these three states.
11. Open **Preview** and confirm the medication appears there.
12. Click the circle-slash icon on the medication, choose **Hold Med**, select a reason, and confirm.
13. Sign the Hold. Confirm the status becomes **Hold (H)**.
14. Click the play-icon trigger that replaces the circle-slash icon, confirm the Release Hold dialog, and Sign.
15. Confirm the status returns to **Active (A)**.
16. Click the circle-slash icon, choose **DC Med**, select a reason, and confirm.
17. Confirm the order is now shown pending/greyed (soft-deleted) but still visible.
18. Sign the discontinue. Confirm the row is genuinely removed from the panel.
19. As Nurse, click **Complete** and confirm the dialog.
20. Confirm the Nurse's button relabels to **"Completed"** and disables, while the Physician can still make changes.
21. As Physician, add or edit an order on a panel other than IV Medications (e.g. Inpatient Medications), and Sign it.
22. As Physician, click **Finalize** and confirm the dialog.
23. Confirm the Finalize button relabels to **"Finalized"** and disables, the Physician's **+Add** disables, and neither role can make further changes.
24. As Nurse, navigate away from and back into Med Management on this visit. Confirm the blocking **"RECONCILIATION FINALIZED"** modal appears.
25. Attempt any further edit on this visit as either role and confirm nothing can be changed (the only way to reconcile again is a brand-new visit).

## Acceptance Criteria

**Panels & Add scope**
- Given an Inpatient visit, when Reconciliation loads, then 4 panels are shown: Inpatient Medications, IV Medications, Outpatient Medications, Home Medications.
- Given an Outpatient visit, when Reconciliation loads, then only 2 panels are shown: Outpatient Medications, Home Medications.
- Given a Nurse session, when using "+Add" on Reconciliation, then it is only available on the Home Medications panel.
- Given a Physician session, when using "+Add" on Reconciliation, then it is available on every panel except IV Medications.
- Given a category outside a role's Add scope on Reconciliation, when the user needs to add there, then they must use the Orders tab instead (where both roles have full access).

**Sign vs. Save**
- Given a newly added order, when it has not yet been signed, then it does not appear on Reconciliation (only on the Orders tab).
- Given a signed Inpatient, IV, or Outpatient medication, when signing completes, then its status becomes **Pending**, not Active.
- Given a signed Home Medication, when signing completes, then its status becomes **Active** directly, skipping Pending.
- Given a Taking/Not Taking/No Action Taken selection, when Save is clicked, then it persists immediately without requiring Sign.
- Given an unsaved Taking/Not Taking/No Action Taken selection, when the page is refreshed, then the selection is lost and reverts.
- Given an unsigned Add/Hold/Discontinue action, when the page is refreshed or the browser is closed and reopened, then the pending action persists until it is actually signed.

**Hold / Release / Discontinue**
- Given an active order, when Hold Med is confirmed and signed, then its status becomes **Hold (H)**.
- Given a Held order, when Release Hold is confirmed and signed, then its status returns to **Active (A)**.
- Given a signed order, when DC Med is confirmed with a reason, then it shows as pending/greyed until Sign, after which it is genuinely removed from the panel.
- Given an unsigned order, when its Stop dialog is confirmed (no reason required), then the row is removed immediately with no Sign step.

**Last Taken**
- Given the Home Medications panel, when a date is set under Taking, then switching to Not Taking or No Action Taken does not clear that date.
- Given any panel other than Home Medications, then no Last Taken date column exists.

**Complete / Finalize lock**
- Given a Nurse clicks Complete and confirms, then the Nurse is locked out of further edits, but the Physician can still edit.
- Given a Physician clicks Finalize and confirms, then neither role can make any further changes to that visit's reconciliation.
- Given a visit has been Finalized, when the Nurse returns to Med Management on that visit, then a blocking "RECONCILIATION FINALIZED" modal appears.
- Given a visit is locked (Completed and/or Finalized), then there is no way to unlock it — a new visit is required to reconcile again.

**Access block**
- Given any unsigned order exists anywhere for the patient, when either role attempts to open Reconciliation, then access is blocked.
- Given the access block is shown to a Nurse, then only a "Review Medications" path is offered (no sign path).
- Given the access block is shown to a Physician, then "Sign Orders" and "Go to Orders" paths are offered.

**Preview**
- Given the Admission story, when Preview is opened, then it shows a chronological audit log split into Nurse/Physician sections, and a later Discontinue appears as its own line without removing the original Add entry.
- Given the Outpatient story, when Preview is opened, then it shows a discharge-letter style report grouped by disposition headers (NEW / HOLD / STOP), and the same medication may appear under more than one header at once.
- Given an order added via the Orders tab (not via Reconciliation's own "+Add"), then it does not appear in Preview's history even though it is visible in the live panel.
