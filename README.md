# Anchor of Intellect

A research project initiated by Jin Sung, exploring how increasingly capable AI can expand human possibility while preserving meaningful human agency.

The project begins with an English and Korean draft charter, with a French reading edition. It is not a declaration that the systems described here have already been built. Auxtho's company charter and Ardamire × WhiteCell defense charter remain separate documents with their own scope.

## Read and build

- English: `content/en/`
- 한국어: `content/ko/`
- Français (France): `content/fr/`
- Presentation: `site/`
- Build and checks: `scripts/`, `tests/`

Requires an existing Node.js 22 or newer. No package installation, external service, model call or account is needed.

```sh
npm run check
```

The generated site is in `dist/`. Open `dist/index.html` manually to review it; ordinary reading and language switching do not require a server or JavaScript. Generated files are not canonical manuscripts.

## What is authoritative?

Each language has one source file per page. No language silently overrides another. A material translation discrepancy is a revision issue to resolve before the affected text is released. English remains the default; `/ko/` and `/fr/` preserve the same page when switching. All languages share the existing visual design.

A draft is not an adopted release. A pull request, passing check or proposed edit is not acceptance by the maintainer. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## Publication

The website has not been published. This repository contains its reviewed source preparation under Jin Sung's personal GitHub account, thedevjin. Publishing these source files does not enable GitHub Pages or connect the custom domain. Website publication and domain/DNS actions require separate approval.

`check.yml` only checks source. `publish.yml` is a separately triggered, exact-commit publication workflow. Its guard refuses unset identity or licensing, a different repository, non-main execution or a commit mismatch. The workflow is not a substitute for the person's approval, and no GitHub environment, access protection or domain setting is claimed to be configured.

Before any public repository creation, visibility change, custom-domain binding, DNS change or deployment:

1. Review the complete final public source, history and rendered site.
2. Confirm the actual personal account and exact repository.
3. Verify the selected code and documentation licenses against their exact reviewed files.
4. Present the exact action, audience, files/version, costs and remaining unknowns for fresh explicit approval.
5. Perform only the approved action and verify its result.

A push or merge does not run the publication workflow. Keep Pages configured for GitHub Actions, not publication directly from a branch. Configure the `github-pages` environment's permitted branch and any available reviewer protection before first deployment. These settings have not been created or verified.

The domain `anchorofintellect.com` is the intended custom domain. Purchasing it does not prove that ownership verification, DNS, HTTPS or renewal settings are complete. Verify domain ownership at the personal account level, bind the repository, then apply and verify the approved DNS configuration.

## Releases and preservation

A release should retain all three language sources, the public-site manifest, source commit and an explanation of changes. Attach fixed files; do not treat editable release notes as the only canonical text. Keep an independent copy. No release or immutable-release setting exists yet.

## Licensing

[LICENSE-DOCUMENTATION.md](LICENSE-DOCUMENTATION.md) covers original A.O.I. prose under CC BY 4.0. [LICENSE-CODE.md](LICENSE-CODE.md) covers the original website implementation and its build, test, configuration and workflow code under MIT. Generated markup and styles retain the code license; embedded prose retains its separate text license. Existing Auxtho documents, product source code, linked third-party works, names and trademarks are not relicensed here.

Never add contact-login emails, secrets, private provenance, raw attachments or confidential implementation notes to this repository. A public repository exposes source and history, not just `dist/`.
