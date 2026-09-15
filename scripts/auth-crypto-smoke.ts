import assert from "node:assert/strict";
import {
  createGasOneTimeToken,
  hashGasPassword,
  hashGasToken,
  verifyGasPassword,
} from "../lib/auth/gas-password";

async function main() {
  const password = "Correct-Horse-2026";
  const stored = await hashGasPassword(password);

  assert.equal(await verifyGasPassword({ password, ...stored }), true);
  assert.equal(await verifyGasPassword({ password: "wrong-password", ...stored }), false);

  const { token, tokenHash } = createGasOneTimeToken();
  assert.equal(token.length >= 43, true);
  assert.equal(hashGasToken(token), tokenHash);
  assert.equal(hashGasToken(token), hashGasToken(token));

  console.log("GAS auth crypto smoke passed");
}

void main();
