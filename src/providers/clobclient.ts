import { readFileSync, existsSync } from "fs";
import { Chain, ClobClient } from "@polymarket/clob-client-v2";
import type { ApiKeyCreds } from "@polymarket/clob-client-v2";
import { Wallet } from "@ethersproject/wallet";
import { config } from "../config";
import { resolveClobOrderAuth } from "./clobOrderAuth";
import { ensureCredentialOnDisk, getCredentialPath } from "../security/createCredential";

// Cache for ClobClient instance to avoid repeated initialization
let cachedClient: ClobClient | null = null;
let cachedConfig: {
    chainId: number;
    host: string;
    funderAddress?: string;
    signatureType?: number;
} | null = null;

/**
 * Initialize ClobClient from credentials (cached singleton)
 * Prevents creating multiple ClobClient instances
 */
export async function getClobClient(): Promise<ClobClient> {
    const credentialPath = getCredentialPath();

    let creds: ApiKeyCreds;
    try {
        if (!existsSync(credentialPath)) {
            await ensureCredentialOnDisk();
        }
        creds = JSON.parse(readFileSync(credentialPath, "utf-8"));
        if (!creds?.key || !creds?.secret || !creds?.passphrase) {
            throw new Error("invalid credential file");
        }
    } catch {
        await ensureCredentialOnDisk({ force: true });
        creds = JSON.parse(readFileSync(credentialPath, "utf-8"));
    }
    
    const chainId = (config.chainId || Chain.POLYGON) as Chain;
    const host = config.clobApiUrl;

    // Create wallet from private key
    const privateKey = config.requirePrivateKey();
    const wallet = new Wallet(privateKey);
    const orderAuth = await resolveClobOrderAuth(wallet);

    // Return cached client if config hasn't changed
    if (
        cachedClient &&
        cachedConfig &&
        cachedConfig.chainId === chainId &&
        cachedConfig.host === host &&
        cachedConfig.funderAddress === orderAuth.funderAddress &&
        cachedConfig.signatureType === orderAuth.signatureType
    ) {
        return cachedClient;
    }

    // Convert base64url secret to standard base64 for clob-client compatibility
    const secretBase64 = creds.secret.replace(/-/g, '+').replace(/_/g, '/');

    // Create API key credentials
    const apiKeyCreds: ApiKeyCreds = {
        key: creds.key,
        secret: secretBase64,
        passphrase: creds.passphrase,
    };

    // Create and cache client (CLOB V2 — options-object constructor)
    cachedClient = new ClobClient({
        host,
        chain: chainId,
        signer: wallet,
        creds: apiKeyCreds,
        signatureType: orderAuth.signatureType,
        funderAddress: orderAuth.funderAddress,
        useServerTime: true,
    });
    cachedConfig = {
        chainId,
        host,
        funderAddress: orderAuth.funderAddress,
        signatureType: orderAuth.signatureType,
    };

    return cachedClient;
}

/**
 * Clear cached ClobClient (useful for testing or re-initialization)
 */
export function clearClobClientCache(): void {
    cachedClient = null;
    cachedConfig = null;
}