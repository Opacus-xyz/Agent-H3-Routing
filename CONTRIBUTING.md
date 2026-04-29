# Contributing to Agent H3 Routing (ERC-8242)

Thank you for your interest in contributing to the ERC-8242 reference implementation.

---

## Ways to Contribute

- **Bug reports** — Open an issue describing the problem, steps to reproduce, and expected behaviour.
- **Spec feedback** — Discuss the ERC-8242 standard on [Ethereum Magicians](https://ethereum-magicians.org/t/erc-8242-agent-quic-http3-transport-endpoint-registry/28394) or in a GitHub issue.
- **Pull requests** — Improvements to contracts, tests, documentation, or examples.

---

## Development Setup

```bash
git clone https://github.com/Opacus-xyz/Agent-H3-Routing.git
cd Agent-H3-Routing
npm install
npm run compile
npm test
```

---

## Guidelines

### Solidity

- Target `^0.8.20`.
- All public functions must have NatSpec (`@notice`, `@param`, `@return`).
- Run `npm run lint:sol` before submitting. Fix all `error`-level findings.
- Do not introduce fees, bonds, admin keys, or upgradeability patterns — this is a pure metadata standard.

### Tests

- Tests live in `test/`. Use Hardhat + Chai.
- Cover all revert paths, events, and pagination edge cases.
- Run `npm run test:gas` to check that gas costs stay reasonable.

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add batch registration helper
fix: handle empty h3Parent in discoverAgents
docs: clarify execution_preference semantics
test: add pagination edge cases
```

---

## Pull Request Checklist

- [ ] `npm test` passes with no failures.
- [ ] `npm run lint:sol` passes with no errors.
- [ ] New behaviour is covered by tests.
- [ ] Changes do not introduce private keys, addresses, or internal project details.

---

## License

By contributing, you agree that your contributions are released under [CC0-1.0](LICENSE).
