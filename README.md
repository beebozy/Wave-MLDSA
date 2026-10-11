# Lithium

**A post-quantum wallet and lock-script project for Nervos CKB, built
around FIPS 204 ML-DSA-65 (Dilithium).**

Lithium explores how post-quantum signatures can be used to secure
transactions on the [Nervos CKB](https://www.nervos.org/) blockchain.
The repository currently focuses on the Rust lock script, the Rust/WASM
cryptography bridge, a TypeScript SDK, and a Node.js CLI wallet. A
browser-based wallet is part of the longer-term direction, but the
current documented wallet workflow is Node-first.

> \[!WARNING\] **Experimental software --- testnet/devnet only. Not
> independently audited.** Do not use Lithium to protect funds you
> cannot afford to lose. Cryptographic correctness, deployment
> configuration, transaction handling, and key management all require
> further review before any production use.

## Table of contents

-   [Project goals](#project-goals)
-   [Current status](#current-status)
-   [Architecture](#architecture)
-   [How the lock script works](#how-the-lock-script-works)
-   [Repository structure](#repository-structure)
-   [Technology stack](#technology-stack)
-   [Prerequisites](#prerequisites)
-   [Build and test](#build-and-test)
-   [TypeScript SDK example](#typescript-sdk-example)
-   [Deployments](#deployments)
-   [Performance and capacity
    considerations](#performance-and-capacity-considerations)
-   [Security considerations](#security-considerations)
-   [Limitations and roadmap](#limitations-and-roadmap)
-   [Contributing](#contributing)
-   [License](#license)

## Project goals

Lithium aims to make post-quantum transaction authorization practical to
explore on CKB while retaining a familiar developer workflow.

The project uses **ML-DSA-65**, standardized in [NIST FIPS
204](https://csrc.nist.gov/pubs/fips/204/final), instead of the
conventional secp256k1 signature flow used by many blockchain accounts.
ML-DSA is designed to resist attacks from both classical and
quantum-capable adversaries, subject to the security of the scheme and
its implementation.

The trade-off is larger keys, signatures, transaction witnesses, and
verification costs. Lithium is an experimental implementation intended
for development, testing, and evaluation---not a claim that
quantum-resistant wallet security is solved by the signature scheme
alone.

## Current status

  -----------------------------------------------------------------------
  Component                           Current scope
  ----------------------------------- -----------------------------------
  CKB lock script                     Rust `no_std` script for CKB-VM;
                                      verifies ML-DSA-65 signatures

  Crypto bridge                       Rust/WASM module for off-chain key
                                      and signature operations

  Browser wallet

  TypeScript SDK                      Key generation, lock construction,
                                      address helpers, transaction
                                      building/signing, RPC/indexer
                                      integration

  CLI wallet                          Key generation, address derivation,
                                      balance checks, outpoint
                                      inspection, and plain CKB transfers

  Tests                               Rust contract tests using
                                      `ckb-testtool` and Node/SDK tests

  

  Token transfers, DAO, multisig      Not currently supported by the CLI
                                      flow

  Mainnet                             No mainnet deployment documented
  -----------------------------------------------------------------------

The repository's current transfer flow supports **plain CKB transfers
only**. Check the limitations and roadmap before relying on a feature.

## Architecture

``` text
                   ┌────────────────────────────┐
                   │       CLI / TypeScript     │
                   │            SDK             │
                   └──────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
             Public key / args           Transaction signing
                    │                           │
             CKB BLAKE2b-256              ML-DSA-65 signature
                    │                           │
                    ▼                           ▼
             Lock script args              Witness lock
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                       CKB transaction validation
                                  │
                                  ▼
                     Rust lock script in CKB-VM
                     verifies key hash + signature
```


## Deployments

The script is currently deployed on the testnet kindly you can check in the migrationfile 

Deployment metadata can change. Prefer the repository's current
`deployment/scripts.json` as the source of truth rather than copying
values from this README.


## Security considerations

-   **Experimental implementation:** the lock script, WASM bridge, SDK,
    and CLI have not been independently audited according to the project
    notes.
-   **Protect key files:** generated wallet files contain sensitive key
    material. Do not commit them, publish them, or include them in issue
    reports.
-   **Verify backups:** losing the secret key and any usable backup can
    permanently make funds inaccessible.
-   **Keep formats consistent:** the public-key hash, CKB hash
    personalization, witness encoding, and signed message must match
    between the off-chain tools and on-chain lock.
-   **Verify deployment metadata:** use the correct code hash, hash
    type, deployment transaction, and cell dependency for the selected
    network.
-   **Dry-run before broadcasting:** inspect input selection, fee,
    capacity, and transaction validation results.
-   **Test on devnet/testnet first:** do not assume successful local
    tests establish production security.
-   **No mainnet assurance:** this repository does not document a
    mainnet deployment.

## Limitations and roadmap

### Current limitations

-   Plain CKB transfers only in the documented flow.

-   `check-outpoint` inspects a known cell through raw RPC; it does not
    replace indexer-backed wallet discovery.
-   Deployment metadata must be correct for the chosen network.
-  Browser ready integration 

### Roadmap

-   [ ] Build a browser wallet UI with key creation/import, address
    display, balance view, and send/receive flows.
-   [ ] Add encrypted local key storage and clear recovery guidance to
    the browser wallet.
-   [ ] Add transaction activity/history and improved status/error
    messages.
-   [ ] Add token discovery and token-transfer support.
-   [ ] Investigate multisig or multi-party authorization.
-   [ ] Improve operational guidance, reproducible builds, and security
    testing.
-   [ ] Commission an independent security audit before considering
    production use.
-   [ ] Evaluate mainnet readiness only after implementation, testing,
    and security review.

Roadmap items are goals, not currently supported features.


## Contributing

Issues, bug reports, and pull requests are welcome. When reporting a
problem, include the command run, relevant error output, target network,
and steps to reproduce. **Never include private keys, seed phrases, or
wallet files.**

Before opening a pull request, run the relevant checks:

``` bash
make build CONTRACT=dillithium-lock
cargo test --package tests
npm test
```

For security-sensitive changes---especially signature verification,
hashing, witness parsing, key handling, and transaction
construction---include focused tests for both valid inputs and malformed
or adversarial inputs.

## License

No license is specified in the supplied project documentation. Add a
`LICENSE` file and update this section before accepting external
contributions or distributing the project.
