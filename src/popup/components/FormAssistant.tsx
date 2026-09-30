import { useMemo, useRef, useState } from 'react';
import { getCorrectionsForHost, saveCorrections, type NewCorrection } from '../../corrections/correctionStore';
import { mapField, mapWithTarget } from '../../intelligence/fieldMapper';
import { fieldSignature } from '../../intelligence/fieldSignature';
import type { UserProfile } from '../../profiles/profileTypes';
import { pageWarnings } from '../../security/pageWarnings';
import { listTargets, targetLabel } from '../../profiles/targets';
import type { FormField, PageScanResult, SkipReason } from '../../types/formField';
import { isFillable, type FieldMapping, type TargetKey } from '../../types/mapping';
import {
  POPUP_PORT_NAME,
  type FillFieldsResponse,
  type FillItem,
  type FillStatus,
  type PortMessage,
  type ScanPageResponse,
} from '../../types/messages';
import { ensureContentScript, explainTabError, getActiveTabId, sendToTab } from '../activeTab';
import { FieldRow, type Override } from './FieldRow';

type Status =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'ready'; scan: PageScanResult }
  | { kind: 'error'; message: string };

/** Per-field decisions the user made in this popup session. */
interface Choice {
  include?: boolean;
  override?: Override;
}

const SKIP_TEXT: Record<SkipReason, string> = {
  hidden: 'hidden',
  disabled: 'disabled',
  password: 'password',
  payment: 'payment or bank',
  'otp-captcha': 'OTP or captcha',
  checkbox: 'checkbox',
  'not-profile-data': 'button or other',
  error: 'unreadable',
};

function describeSkipped(skipped: PageScanResult['skipped']): string {
  return Object.entries(skipped)
    .map(([reason, count]) => `${count} ${SKIP_TEXT[reason as SkipReason]}`)
    .join(', ');
}

/**
 * Suggested by default only when FormPilot is sure AND the field isn't
 * sensitive. Everything else waits for the user to tick it: that tick is
 * the "Confirm" step of Analyze → Score → Explain → Confirm → Fill.
 */
function includedByDefault(mapping: FieldMapping): boolean {
  if (!isFillable(mapping) || mapping.sensitive) return false;
  return mapping.source === 'user' || mapping.level === 'high';
}

/**
 * The popup's main screen: scan the page, show what each field would be
 * filled with and why, let the user confirm or correct, then fill.
 */
export function FormAssistant({ profile }: { profile: UserProfile | null }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [memory, setMemory] = useState<Record<string, TargetKey | 'ignore'>>({});
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [fillResults, setFillResults] = useState<Record<string, FillStatus>>({});
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [busy, setBusy] = useState(false);

  // useRef holds values that survive re-renders without causing them.
  const tabIdRef = useRef<number | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const scan = status.kind === 'ready' ? status.scan : null;
  const targets = useMemo(() => listTargets(profile), [profile]);

  // Recomputed whenever the scan, profile, memory or the user's choices change.
  const mappings = useMemo(() => {
    const result = new Map<string, FieldMapping>();
    for (const field of scan?.fields ?? []) {
      result.set(field.elementId, mapOne(field, profile, choices[field.elementId]?.override, scan!.hostname, memory));
    }
    return result;
  }, [scan, profile, choices, memory]);

  const isIncluded = (field: FormField) => {
    const mapping = mappings.get(field.elementId)!;
    return isFillable(mapping) && (choices[field.elementId]?.include ?? includedByDefault(mapping));
  };

  const fields = scan?.fields ?? [];
  const suggested = fields.filter((f) => isFillable(mappings.get(f.elementId)!));
  const notFilled = fields.filter((f) => !isFillable(mappings.get(f.elementId)!));
  const selected = suggested.filter(isIncluded);
  const selectedSensitive = selected.filter((f) => mappings.get(f.elementId)!.sensitive);
  const warnings = scan ? pageWarnings(scan, selected) : [];
  // Sensitive fields and risky pages both need a second, explicit click.
  const needsConfirmation = selectedSensitive.length > 0 || warnings.length > 0;

  function updateChoice(elementId: string, change: Choice) {
    setChoices((previous) => ({ ...previous, [elementId]: { ...previous[elementId], ...change } }));
    setConfirming(false);
  }

  function receiveScan(result: PageScanResult, isUpdate: boolean) {
    const newCount = result.fields.filter((f) => !knownIdsRef.current.has(f.elementId)).length;
    knownIdsRef.current = new Set(result.fields.map((f) => f.elementId));
    setStatus({ kind: 'ready', scan: result });
    if (isUpdate) {
      setNotice(newCount > 0 ? `The form changed: ${newCount} new field${newCount === 1 ? '' : 's'} found.` : 'The form changed.');
    }
  }

  async function handleScan() {
    setStatus({ kind: 'scanning' });
    setNotice(null);
    setFillResults({});
    setConfirming(false);
    try {
      const tabId = await getActiveTabId();
      tabIdRef.current = tabId;
      await ensureContentScript(tabId);

      // Open the port once. Chrome closes it when the popup closes, which
      // tells the content script to stop watching and clear highlights.
      if (!portRef.current) {
        const port = chrome.tabs.connect(tabId, { name: POPUP_PORT_NAME });
        port.onMessage.addListener((message: PortMessage) => {
          if (message.type === 'FIELDS_CHANGED') receiveScan(message.result, true);
        });
        portRef.current = port;
      }

      const response = await sendToTab<ScanPageResponse>(tabId, { type: 'SCAN_PAGE' });
      if (!response.ok) {
        setStatus({ kind: 'error', message: response.error });
        return;
      }
      setMemory(await getCorrectionsForHost(response.result.hostname));
      receiveScan(response.result, false);
      if (highlight) await sendToTab(tabId, { type: 'SET_HIGHLIGHT', enabled: true });
    } catch (error) {
      setStatus({ kind: 'error', message: explainTabError(error) });
    }
  }

  async function handleHighlightChange(enabled: boolean) {
    setHighlight(enabled);
    if (tabIdRef.current !== null) {
      await sendToTab(tabIdRef.current, { type: 'SET_HIGHLIGHT', enabled });
    }
  }

  async function handleFill() {
    if (!scan || tabIdRef.current === null || selected.length === 0) return;
    if (needsConfirmation && !confirming) {
      setConfirming(true);
      return;
    }

    const items: FillItem[] = selected.map((field) => {
      const mapping = mappings.get(field.elementId)!;
      return { elementId: field.elementId, value: mapping.value!, confirmedSensitive: mapping.sensitive };
    });

    setBusy(true);
    try {
      const response = await sendToTab<FillFieldsResponse>(tabIdRef.current, { type: 'FILL_FIELDS', items });
      if (!response.ok) {
        setNotice(response.error);
        return;
      }
      setFillResults(Object.fromEntries(response.results.map((r) => [r.elementId, r.status])));
      const filled = response.results.filter((r) => r.status === 'filled').length;
      const failed = response.results.length - filled;
      setNotice(
        `Filled ${filled} field${filled === 1 ? '' : 's'}${failed ? `, ${failed} couldn’t be filled` : ''}. ` +
          'Check the page, then submit it yourself.',
      );
      await rememberCorrections(scan);
    } catch (error) {
      setNotice(explainTabError(error));
    } finally {
      setConfirming(false);
      setBusy(false);
    }
  }

  /** Saves the user's manual changes so this site is mapped right next time. */
  async function rememberCorrections(current: PageScanResult) {
    const corrections: NewCorrection[] = [];
    for (const field of current.fields) {
      const override = choices[field.elementId]?.override;
      if (!override) continue;
      corrections.push({
        signature: fieldSignature(field),
        fieldLabel: field.label ?? field.name ?? 'Unlabelled field',
        target: override === 'none' ? 'ignore' : override,
      });
    }
    try {
      await saveCorrections(current.hostname, corrections);
    } catch {
      // Memory is a convenience; failing to save it must not block filling.
    }
  }

  function renderRow(field: FormField) {
    const mapping = mappings.get(field.elementId)!;
    return (
      <FieldRow
        key={field.elementId}
        field={field}
        mapping={mapping}
        targetName={mapping.target ? targetLabel(profile, mapping.target) : null}
        included={isIncluded(field)}
        fillable={isFillable(mapping)}
        override={choices[field.elementId]?.override}
        targets={targets}
        fillStatus={fillResults[field.elementId]}
        onIncludeChange={(include) => updateChoice(field.elementId, { include })}
        onOverrideChange={(override) => updateChoice(field.elementId, { override, include: undefined })}
      />
    );
  }

  return (
    <section className="popup__panel" aria-label="Form assistant">
      {status.kind === 'idle' && <p className="note">Scan this page to see what FormPilot can fill.</p>}
      {status.kind === 'scanning' && <p className="note">Scanning…</p>}
      {status.kind === 'error' && <p className="error" role="alert">{status.message}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {scan && (
        <>
          <div>
            <p className="scan__site">On <strong>{scan.hostname || 'this page'}</strong></p>
            <p className="scan__count">
              {fields.length === 0
                ? 'No fillable fields found'
                : `${suggested.length} of ${fields.length} field${fields.length === 1 ? '' : 's'} can be filled`}
            </p>
            {Object.keys(scan.skipped).length > 0 && (
              <p className="note scan__skipped">Skipped: {describeSkipped(scan.skipped)}</p>
            )}
            {scan.iframeCount > 0 && (
              <p className="note scan__skipped">
                This page has {scan.iframeCount} embedded frame{scan.iframeCount === 1 ? '' : 's'}. Fields inside frames can’t be read yet.
              </p>
            )}
            {!profile && <p className="note scan__skipped">Choose a profile above to see what would be filled.</p>}
          </div>

          {warnings.length > 0 && (
            <ul className="warnings" role="alert">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          {fields.length > 0 && (
            <label className="scan__toggle">
              <input type="checkbox" checked={highlight} onChange={(event) => handleHighlightChange(event.target.checked)} />
              Outline fields on the page
            </label>
          )}

          {suggested.length > 0 && <ul className="rows">{suggested.map(renderRow)}</ul>}

          {notFilled.length > 0 && (
            <details className="not-filled">
              <summary>{notFilled.length} field{notFilled.length === 1 ? '' : 's'} FormPilot won’t fill</summary>
              <ul className="rows">{notFilled.map(renderRow)}</ul>
            </details>
          )}

          {confirming && (
            <div className="confirm" role="alert">
              {selectedSensitive.length > 0 && (
                <p>
                  You’re about to fill {selectedSensitive.length} sensitive field{selectedSensitive.length === 1 ? '' : 's'}:{' '}
                  {selectedSensitive.map((f) => `“${f.label ?? 'Unlabelled field'}”`).join(', ')}.
                </p>
              )}
              {warnings.length > 0 && <p>Read the warning{warnings.length === 1 ? '' : 's'} above.</p>}
              <p>Only continue if you trust <strong>{scan.hostname || 'this page'}</strong>.</p>
              <button className="button button--quiet" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          )}

          {suggested.length > 0 && (
            <button className="button" onClick={handleFill} disabled={busy || selected.length === 0}>
              {confirming
                ? 'Yes, fill anyway'
                : `Fill ${selected.length} field${selected.length === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      )}

      <button className="button button--quiet" onClick={handleScan} disabled={status.kind === 'scanning'}>
        {scan ? 'Scan again' : 'Scan this page'}
      </button>
    </section>
  );
}

/** Applies the user's override, if any; otherwise asks the mapper. */
function mapOne(
  field: FormField,
  profile: UserProfile | null,
  override: Override | undefined,
  hostname: string,
  memory: Record<string, TargetKey | 'ignore'>,
): FieldMapping {
  if (override === 'none') {
    return {
      elementId: field.elementId, target: null, confidence: 0, level: 'low', sensitive: field.sensitive,
      source: 'user', unavailable: 'ignored', reasons: ['You chose not to fill this field.'],
    };
  }
  if (override && profile) {
    return mapWithTarget(field, profile, override, 'user', 1, ['You chose this.']);
  }
  return mapField(field, profile, { hostname, memory });
}
