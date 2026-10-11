# Lithium wallet

React + TypeScript + Vite wallet for the ML-DSA-65 multisig-capable CKB lock (1-of-1 by default).
Keys are generated and used in the browser. Nothing is sent to a server except RPC calls to a CKB node.

## Run

    npm install
    cp .env.example .env.local     # or fill the Settings panel in the app
    npm run dev                    # http://localhost:5173
    npm test                       # offline tests (formats, signing, addresses, vault)
    npm run build

## Deployment settings you need

| Setting | Where to find it |
|---|---|
| Lock code hash | `data_hash` in your `migrations/*.json` (use hash type `data1`) |
| Deployment tx hash | the `tx_hash` of the deployment cell in the same file |
| Deployment cell index | `index` in the same file (normally 0) |

The app checks on load that the deployment cell exists and that its data hashes to the code hash.

## Files

- `src/lockFormat.ts`  config, args, witness lock field and signing message (mirror of the Rust lock)
- `src/sighash.ts`     builds the signing message from a CCC transaction
- `src/transfer.ts`    coin selection, fee, signing, self-check, dry run, send
- `src/crypto.ts`      ML-DSA-65 (noble), CKB BLAKE2b
- `src/wallet.ts`      seed -> keys -> config -> lock script -> address
- `src/vault.ts`       passphrase-encrypted seed (PBKDF2 + AES-GCM)
- `src/chain.ts`       client, balance, deployment check
- `src/errors.ts`      maps the lock's exit codes to readable messages

## Screens (from the design template)

Built: Assets home (dollar total, CKB row, token rows), Send, Receive (with QR), Activity (links to the explorer),
Settings (recovery seed behind the passphrase, hide balances, deployment status and editor).
Not built yet: token detail, manage tokens, shared (M-of-N) account setup and signing, notifications, a real activity list.

Notes: dollar values use the mainnet CKB price from CoinGecko (testnet coins have no value, so it is a preview).
Tokens are detected from cells with a type script (sUDT/xUDT amount in the first 16 data bytes) but show as
"Unknown token" until a token list supplies names and decimals.

## Must verify before trusting it

1. Sign a transaction here, spend it on testnet, and confirm the lock accepts it.
   The TypeScript signer (noble) and the Rust verifier (fips204) must agree: pure ML-DSA, EMPTY context.
2. Error codes in `src/errors.ts` match the order of constants in your deployed lock.
3. Keep the wallet testnet-only until the lock is audited.
