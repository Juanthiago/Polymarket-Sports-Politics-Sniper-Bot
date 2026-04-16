import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { Chain, ClobClient } from "@polymarket/clob-client";
import type { ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import { config } from "../config";
import { resolveClobOrderAuth } from "./clobOrderAuth";

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
    // Load credentials
    const credentialPath = resolve(process.cwd(), "src/data/credential.json");
    
    if (!existsSync(credentialPath)) {
        throw new Error("Credential file not found. Run createCredential() first.");
    }

    const creds: ApiKeyCreds = JSON.parse(readFileSync(credentialPath, "utf-8"));
    
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

    // Create and cache client
    cachedClient = new ClobClient(
        host,
        chainId,
        wallet,
        apiKeyCreds,
        orderAuth.signatureType,
        orderAuth.funderAddress
    );
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