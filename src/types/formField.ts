/**
 * What the content script reports about each form field.
 *
 * IMPORTANT: there is deliberately no `value` property. FormPilot describes
 * fields; it never reads what the user (or the site) has typed into them.
 */

/** Where the human-readable label came from, best to worst. */
export type LabelSource =
  | 'label'            // <label for="..."> or <label> wrapping the control
  | 'aria-labelledby'  // text of the element(s) referenced by aria-labelledby
  | 'aria-label'       // aria-label attribute
  | 'nearby-text'      // visible text just before the field (or table header)
  | 'title'            // title attribute (tooltip)
  | 'placeholder'      // placeholder attribute
  | 'name'             // humanized name attribute, e.g. "candidate_name"
  | 'id'               // humanized id attribute
  | 'none';

export interface FieldOption {
  value: string;
  text: string;
}

export interface FormField {
  /** FormPilot's own id ("fp-1"), used later to find the element again. */
  elementId: string;

  tagName: 'input' | 'textarea' | 'select';
  /** Input type ("text", "email", "tel", "date", "radio"), "textarea", or "select-one". */
  type: string;

  name?: string;
  id?: string;

  /** Best human-readable label, cleaned of "*" and trailing ":". */
  label?: string;
  labelSource: LabelSource;

  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  title?: string;

  /** Extra text near the field, e.g. "(as per 10th certificate)". */
  surroundingText?: string;
  /** Nearest <legend> or heading above the field, e.g. "Permanent Address". */
  sectionHeading?: string;

  /** Choices for <select> and radio groups (the choices, not the selection). */
  options?: FieldOption[];

  required: boolean;
  readOnly: boolean;
  maxLength?: number;

  /** Government IDs etc. Filling these will always need explicit confirmation. */
  sensitive: boolean;

  /** Index into document.forms, or -1 if the field isn't inside a <form>. */
  formIndex: number;

  /** Hostname the form submits to, only when it's a DIFFERENT site than the page. */
  submitsTo?: string;
  /** True if the form submits over plain http (readable by others on the network). */
  submitsInsecurely?: boolean;
}

/** Why a control was left out of the results. */
export type SkipReason =
  | 'hidden'
  | 'disabled'
  | 'password'
  | 'payment'
  | 'otp-captcha'
  | 'checkbox'
  | 'not-profile-data'
  | 'error';

export interface PageScanResult {
  hostname: string;
  fields: FormField[];
  /** How many controls were skipped, per reason. */
  skipped: Partial<Record<SkipReason, number>>;
  /** Embedded frames on the page. Their fields can't be read yet. */
  iframeCount: number;
  /** False for plain-http pages (localhost counts as secure). */
  secureContext: boolean;
}
