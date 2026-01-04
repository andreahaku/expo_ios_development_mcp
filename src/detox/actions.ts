/**
 * Detox action snippet generators
 * Each function generates the JavaScript code to be embedded in the micro-test
 */

import type { Selector, Direction } from "../mcp/schemas.js";
import { buildElementExpr, selectorToDetoxExpr } from "./selectors.js";

export interface TapOptions {
  selector: Selector;
  x?: number;
  y?: number;
}

export function generateTapSnippet(options: TapOptions): string {
  const el = buildElementExpr(options.selector);
  if (options.x !== undefined && options.y !== undefined) {
    return `await ${el}.tap({ x: ${options.x}, y: ${options.y} });`;
  }
  return `await ${el}.tap();`;
}

export interface LongPressOptions {
  selector: Selector;
  duration?: number;
}

export function generateLongPressSnippet(options: LongPressOptions): string {
  const el = buildElementExpr(options.selector);
  const duration = options.duration ?? 1000;
  return `await ${el}.longPress(${duration});`;
}

export interface SwipeOptions {
  selector: Selector;
  direction: Direction;
  speed?: "fast" | "slow";
  percentage?: number;
}

export function generateSwipeSnippet(options: SwipeOptions): string {
  const el = buildElementExpr(options.selector);
  const speed = options.speed ?? "fast";
  const percentage = options.percentage ?? 0.75;
  const normalizedPercentage = Math.round(percentage * 100) / 100;

  return `await ${el}.swipe('${options.direction}', '${speed}', ${normalizedPercentage});`;
}

export interface ScrollOptions {
  selector: Selector;
  direction: Direction;
  amount?: number;
  startPositionX?: number;
  startPositionY?: number;
}

export function generateScrollSnippet(options: ScrollOptions): string {
  const el = buildElementExpr(options.selector);
  const amount = options.amount ?? 200;
  const startX = options.startPositionX ?? 0.5;
  const startY = options.startPositionY ?? 0.5;

  return `await ${el}.scroll(${amount}, '${options.direction}', ${startX}, ${startY});`;
}

export interface TypeOptions {
  selector: Selector;
  text: string;
  replace?: boolean;
}

export function generateTypeSnippet(options: TypeOptions): string {
  const el = buildElementExpr(options.selector);
  const escapedText = JSON.stringify(options.text);
  const lines: string[] = [];

  lines.push(`const inputEl = ${el};`);
  lines.push(`await inputEl.tap();`);

  if (options.replace !== false) {
    lines.push(`await inputEl.clearText();`);
  }

  lines.push(`await inputEl.typeText(${escapedText});`);

  return lines.join("\n      ");
}

export type KeyType = "return" | "backspace" | "delete";

export function generatePressKeySnippet(key: KeyType): string {
  switch (key) {
    case "return":
      return `await element(by.type('UITextField')).atIndex(0).tapReturnKey();`;
    case "backspace":
      return `await element(by.type('UITextField')).atIndex(0).tapBackspaceKey();`;
    case "delete":
      // Delete key is same as backspace on iOS
      return `await element(by.type('UITextField')).atIndex(0).tapBackspaceKey();`;
    default:
      throw new Error(`Unsupported key: ${key}`);
  }
}

export interface WaitForOptions {
  selector: Selector;
  visible?: boolean;
  timeout?: number;
}

export function generateWaitForSnippet(options: WaitForOptions): string {
  const matcher = selectorToDetoxExpr(options.selector);
  const timeout = options.timeout ?? 30000;

  if (options.visible !== false) {
    return `await waitFor(element(${matcher})).toBeVisible().withTimeout(${timeout});`;
  }
  return `await waitFor(element(${matcher})).toExist().withTimeout(${timeout});`;
}

export interface AssertTextOptions {
  selector: Selector;
  text: string;
  exact?: boolean;
}

export function generateAssertTextSnippet(options: AssertTextOptions): string {
  const el = buildElementExpr(options.selector);
  const escapedText = JSON.stringify(options.text);

  if (options.exact !== false) {
    return `await expect(${el}).toHaveText(${escapedText});`;
  }
  // For partial text match, we use toHaveText with regex
  return `await expect(${el}).toHaveText(new RegExp(${escapedText}));`;
}

export interface AssertVisibleOptions {
  selector: Selector;
  visible?: boolean;
}

export function generateAssertVisibleSnippet(options: AssertVisibleOptions): string {
  const el = buildElementExpr(options.selector);

  if (options.visible !== false) {
    return `await expect(${el}).toBeVisible();`;
  }
  return `await expect(${el}).not.toBeVisible();`;
}

export interface AssertExistsOptions {
  selector: Selector;
  exists?: boolean;
}

export function generateAssertExistsSnippet(options: AssertExistsOptions): string {
  const el = buildElementExpr(options.selector);

  if (options.exists !== false) {
    return `await expect(${el}).toExist();`;
  }
  return `await expect(${el}).not.toExist();`;
}

export function generateScreenshotSnippet(name: string): string {
  const escapedName = JSON.stringify(name);
  return `const screenshotPath = await device.takeScreenshot(${escapedName});
      capturedData = { screenshotPath };`;
}

export function generateLaunchAppSnippet(newInstance: boolean = false): string {
  return `await device.launchApp({ newInstance: ${newInstance} });`;
}

export function generateReloadReactNativeSnippet(): string {
  return `await device.reloadReactNative();`;
}
