import { Wallet } from "@ethersproject/wallet";
import { SignatureTypeV2 } from "@polymarket/clob-client-v2";
import { config } from "../config";
import { getPolymarketProxyWalletAddress } from "../utils/proxyWallet";

/**
 * CLOB order signing mode + funder (Polymarket proxy) for @polymarket/clob-client-v2.
 *
 * Polymarket docs: GNOSIS_SAFE (2) is the most common (MetaMask / polymarket.com).
 * POLY_PROXY (1) is for Magic Link email/Google exported keys; on-chain `getPolyProxyWalletAddress` matches that path.
 *
 * If you set FUNDER_ADDRESS from your profile, we default to GNOSIS_SAFE unless SIGNATURE_TYPE overrides.
 */
export async function resolveClobOrderAuth(wallet: Wallet): Promise<{
    signatureType?: SignatureTypeV2;
    funderAddress?: string;
}> {
    const st = config.signatureType?.trim().toUpperCase();

    let useProxy: boolean;
    let signatureType: SignatureTypeV2 = SignatureTypeV2.POLY_GNOSIS_SAFE;

    if (st === "EOA" || st === "0") {
        useProxy = false;
    } else if (st === "POLY_PROXY" || st === "1") {
        useProxy = true;
        signatureType = SignatureTypeV2.POLY_PROXY;
    } else if (st === "POLY_GNOSIS_SAFE" || st === "GNOSIS_SAFE" || st === "2") {
        useProxy = true;
        signatureType = SignatureTypeV2.POLY_GNOSIS_SAFE;
    } else {
        useProxy = config.usePolyProxy;
    }

    if (!useProxy) {
        return {};
    }

    const funderAddress =
        config.funderAddress ?? (await getPolymarketProxyWalletAddress(wallet.address));

    if (!config.signatureType) {
        if (config.funderWasExplicitInEnv) {
            signatureType = SignatureTypeV2.POLY_GNOSIS_SAFE;
        } else {
            signatureType = SignatureTypeV2.POLY_PROXY;
            if (!config.funderAddress) {
                console.log(
                    `[INFO] No FUNDER_ADDRESS in .env — using on-chain Magic proxy + POLY_PROXY. ` +
                        `If your balance is still 0, set FUNDER_ADDRESS to your wallet from https://polymarket.com/settings ` +
                        `(Polymarket docs: GNOSIS_SAFE is the usual type for MetaMask / polymarket.com users).`
                );
            }
        }
    }

    if (signatureType === SignatureTypeV2.POLY_GNOSIS_SAFE && !config.funderWasExplicitInEnv) {
        console.log(
            `[WARN] POLY_GNOSIS_SAFE without FUNDER_ADDRESS — funder was derived on-chain and may not match your Polymarket profile. ` +
                `Set FUNDER_ADDRESS from https://polymarket.com/settings if CLOB balance stays 0.`
        );
    }

    return { signatureType, funderAddress };
}
