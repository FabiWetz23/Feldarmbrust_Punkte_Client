export function uid(prefix = "id") {
  // crypto.randomUUID ist modern und passt gut für tablet/browser
  return `${prefix}-${crypto.randomUUID()}`;
}
