import { ApiKeyCreds, ClobClient, Chain } from "@polymarket/clob-client-v2";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { Wallet } from "@ethersproject/wallet";
import { config } from "../config";
import { resolveClobOrderAuth } from "../providers/clobOrderAuth";

export const CREDENTIAL_RELATIVE_PATH = "src/data/credential.json";

export function getCredentialPath(): string {
    return resolve(process.cwd(), CREDENTIAL_RELATIVE_PATH);
}

function isValidCreds(c: unknown): c is ApiKeyCreds {
    if (!c || typeof c !== "object") return false;
    const o = c as Record<string, unknown>;
    return (
        typeof o.key === "string" &&
        o.key.length > 0 &&
        typeof o.secret === "string" &&
        o.secret.length > 0 &&
        typeof o.passphrase === "string" &&
        o.passphrase.length > 0
    );
}

/** L1-only client for API key derive/create (signer only; `useServerTime` reduces clock-skew auth failures). */
function l1ClientForApiKey(wallet: Wallet, chainId: Chain, host: string): ClobClient {
    return new ClobClient({
        host,
        chain: chainId,
        signer: wallet,
        useServerTime: true,
    });
}

/**
 * Derive existing CLOB API credentials first; create if none. SDK `createOrDeriveApiKey` calls create first,
 * so a 400 on create prevents derive from ever running.
 */
export async function fetchApiKeyFromServer(wallet: Wallet, chainId: Chain, host: string): Promise<ApiKeyCreds> {
    const client = l1ClientForApiKey(wallet, chainId, host);
    try {
        const derived = await client.deriveApiKey();
        if (isValidCreds(derived)) {
            console.log(`[INFO] CLOB API credentials derived (existing key).`);
            return derived;
        }
    } catch {
        // No key yet for this signer
    }
    const created = await client.createApiKey();
    if (!isValidCreds(created)) {
        throw new Error("createApiKey returned invalid credentials");
    }
    console.log(`[INFO] CLOB API credentials created (new key).`);
    return created;
}

export async function saveCredential(credential: ApiKeyCreds): Promise<void> {
    const credentialPath = getCredentialPath();
    const credentialDir = dirname(credentialPath);
    if (!existsSync(credentialDir)) {
        mkdirSync(credentialDir, { recursive: true });
    }
    writeFileSync(credentialPath, JSON.stringify(credential, null, 2));
}

/**
 * Ensure `src/data/credential.json` exists with valid L2 credentials from Polymarket (L1 derive/create).
 */
export async function ensureCredentialOnDisk(options?: { force?: boolean }): Promise<ApiKeyCreds> {
    const credentialPath = getCredentialPath();
    if (!options?.force && existsSync(credentialPath)) {
        try {
            const raw = JSON.parse(readFileSync(credentialPath, "utf-8"));
            if (isValidCreds(raw)) {
                return raw;
            }
        } catch {
            // Re-fetch
        }
    }

    const privateKey = config.privateKey;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY not set in environment");
    }

    const wallet = new Wallet(privateKey);
    const orderAuth = await resolveClobOrderAuth(wallet);
    console.log(`[INFO] EOA signer address: ${wallet.address}`);
    if (orderAuth.funderAddress) {
        console.log(
            `[INFO] Polymarket funder (collateral wallet): ${orderAuth.funderAddress} (CLOB signatureType=${orderAuth.signatureType ?? "n/a"})`
        );
    } else {
        console.log(`[INFO] CLOB mode: EOA (no proxy funder)`);
    }

    const chainId = (config.chainId || Chain.POLYGON) as Chain;
    const host = config.clobApiUrl;

    const credential = await fetchApiKeyFromServer(wallet, chainId, host);
    await saveCredential(credential);
    console.log(`[SUCCESS] Credentials saved to ${credentialPath}`);
    return credential;
}

/** @deprecated Prefer ensureCredentialOnDisk(); kept for callers that expect null on failure */
export async function createCredential(): Promise<ApiKeyCreds | null> {
    try {
        return await ensureCredentialOnDisk();
    } catch (error) {
        console.log(`[ERROR] createCredential error`, error);
        console.log(`[ERROR] Error creating credential: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
