/**
 * Constants for acceptance criteria testing
 */

// Timeouts (in milliseconds)
export const DEFAULT_CRITERION_TIMEOUT_MS = 30000;
export const DEFAULT_FLOW_STEP_TIMEOUT_MS = 30000;
export const MODAL_VISIBILITY_TIMEOUT_MS = 5000;

// Long press duration (in milliseconds)
export const DEFAULT_LONG_PRESS_DURATION_MS = 1000;

// Scroll amount (in pixels)
export const DEFAULT_SCROLL_AMOUNT_PX = 200;

// Time formatting thresholds
export const MS_IN_SECOND = 1000;
export const MS_IN_MINUTE = 60000;

// Rounding precision for percentages (multiply and divide for 1 decimal place)
export const PERCENTAGE_ROUNDING_FACTOR = 10;

// Confidence multipliers for selectors
export const INTERACTION_CONFIDENCE_MULTIPLIER = 0.9;
export const MODAL_CONFIDENCE_MULTIPLIER = 0.8;

// Selector confidence levels
export const CONFIDENCE_TESTID_EXPLICIT = 1.0;
export const CONFIDENCE_LABEL_EXPLICIT = 0.95;
export const CONFIDENCE_QUOTED_TEXT = 0.7;
export const CONFIDENCE_BUTTON_TEXT = 0.75;

// Text truncation lengths for reports
export const TRUNCATE_ELEMENT_DESCRIPTION = 40;
export const TRUNCATE_DESCRIPTION_SHORT = 50;
export const TRUNCATE_MESSAGE_SHORT = 40;
export const TRUNCATE_ELEMENT_DESCRIPTION_LONG = 60;
