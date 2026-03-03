import { ApiKeyCreds, ClobClient, Chain } from "@polymarket/clob-client";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { Wallet } from "@ethersproject/wallet";
import { tradingEnv, maskAddress } from "../config/env";
import { CREDENTIAL_PATH } from "../config/paths";

function loadFromFile(): ApiKeyCreds | null {
  if (!existsSync(CREDENTIAL_PATH)) return null;
  try {
    const cred = JSON.parse(readFileSync(CREDENTIAL_PATH, "utf-8")) as ApiKeyCreds;
    return cred?.key ? cred : null;
  } catch {
    return null;
  }
}

export async function createCredential(): Promise<ApiKeyCreds | null> {
  const privateKey = tradingEnv.PRIVATE_KEY;
  if (!privateKey) {
    console.log("Credential: PRIVATE_KEY not set");
    return null;
  }

  const existing = loadFromFile();
  if (existing) {
    console.log("Using credential from credential.json");
    return existing;
  }

  try {
    const wallet = new Wallet(privateKey);
    const chainId = tradingEnv.CHAIN_ID as Chain;
    const host = tradingEnv.CLOB_API_URL;

    const clobClient = new ClobClient(host, chainId, wallet);
    const credential = await clobClient.createOrDeriveApiKey();

    const dir = resolve(process.cwd(), "src/data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CREDENTIAL_PATH, JSON.stringify(credential, null, 2));

    console.log(`Credential saved for ${maskAddress(wallet.address)}`);
    return credential;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`Credential: ${msg}`);
    return null;
  }
}
