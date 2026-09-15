import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

export const GAS_PASSWORD_PARAMS = {
  algorithm: "scrypt",
  keyLength: 64,
  N: 16384,
  r: 8,
  p: 1,
} as const;

export type GasPasswordParams = typeof GAS_PASSWORD_PARAMS;

export async function hashGasPassword(password: string) {
  if (password.length < 8) {
    throw new Error("密碼至少需要 8 個字元。");
  }
  const salt = randomBytes(16).toString("base64url");
  const hash = await derive(password, salt, GAS_PASSWORD_PARAMS);
  return {
    passwordHash: hash.toString("base64url"),
    passwordSalt: salt,
    passwordParams: JSON.stringify(GAS_PASSWORD_PARAMS),
  };
}

export async function verifyGasPassword(input: {
  password: string;
  passwordHash: string;
  passwordSalt: string;
  passwordParams: string;
}) {
  try {
    const params = JSON.parse(input.passwordParams) as Partial<GasPasswordParams>;
    if (
      params.algorithm !== "scrypt" ||
      params.keyLength !== GAS_PASSWORD_PARAMS.keyLength ||
      params.N !== GAS_PASSWORD_PARAMS.N ||
      params.r !== GAS_PASSWORD_PARAMS.r ||
      params.p !== GAS_PASSWORD_PARAMS.p
    ) {
      return false;
    }
    const expected = Buffer.from(input.passwordHash, "base64url");
    if (expected.length !== params.keyLength) return false;
    const actual = await derive(input.password, input.passwordSalt, GAS_PASSWORD_PARAMS);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createGasOneTimeToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashGasToken(token) };
}

export function hashGasToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function derive(password: string, salt: string, params: GasPasswordParams) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      params.keyLength,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}
