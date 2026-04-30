import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "olap_";

export function approvalTokenForRequest(approvalRequestId: string): string {
  return `${TOKEN_PREFIX}${approvalTokenDigest(approvalRequestId).slice(0, 48)}`;
}

export function approvalTokenHash(approvalRequestId: string, token: string): string {
  return createHmac("sha256", approvalTokenSecret())
    .update(`${approvalRequestId}\0${token}`)
    .digest("hex");
}

export function verifyApprovalToken(approvalRequestId: string, token: string, expectedHash: string): boolean {
  const actual = Buffer.from(approvalTokenHash(approvalRequestId, token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function approvalTokenDigest(approvalRequestId: string): string {
  return createHmac("sha256", approvalTokenSecret()).update(approvalRequestId).digest("hex");
}

function approvalTokenSecret(): string {
  return process.env.OPEN_LAGRANGE_APPROVAL_TOKEN_SECRET
    ?? process.env.OPEN_LAGRANGE_API_TOKEN
    ?? "open-lagrange-local-approval-token";
}
