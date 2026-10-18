'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./build.cjs');

function validatePublication(config, context, bundleSha256) {
  const errors = [];
  const owner = config.repository?.owner;
  const publisher = config.publisher;
  const name = config.repository?.name;
  const login = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
  if (!owner || !login.test(owner)) errors.push('Verified personal repository owner is not configured.');
  if (!publisher || !login.test(publisher)) errors.push('Verified personal publisher is not configured.');
  if (publisher && owner && publisher.toLowerCase() !== owner.toLowerCase()) errors.push('Publisher must be the chosen personal repository owner.');
  if (name !== 'anchor-of-intellect') errors.push('Unexpected repository name.');
  if (config.status !== 'PUBLICATION_CANDIDATE') errors.push('This is local preparation, not a publication candidate.');
  if (config.publicationMode !== 'manual-exact-commit') errors.push('Manual exact-commit publication is required.');
  if (config.documentationLicense !== 'CC-BY-4.0') errors.push('Document licensing must be reviewed.');
  if (!config.codeLicense) errors.push('Site-code licensing has not been chosen.');
  if (context.event !== 'workflow_dispatch') errors.push('Only manual dispatch can publish.');
  if (config.repository?.defaultBranch !== 'main' || context.ref !== 'refs/heads/main') errors.push('Publication must use the default main branch.');
  if (context.repository?.toLowerCase() !== (owner + '/' + name).toLowerCase()) errors.push('Repository identity does not match.');
  if (context.actor?.toLowerCase() !== publisher?.toLowerCase()) errors.push('Publisher identity does not match.');
  if (!/^[a-f\d]{40}$/.test(context.approvedSha || '') || context.sha !== context.approvedSha) errors.push('The dispatch source must equal the exact reviewed 40-character commit.');
  if (context.workflowRef !== owner + '/' + name + '/.github/workflows/publish.yml@refs/heads/main') errors.push('Unexpected workflow source.');
  if (!/^[a-f\d]{64}$/.test(context.expectedBundle || '') || context.expectedBundle !== bundleSha256) errors.push('Public bundle differs from the reviewed bundle.');
  return errors;
}

function main() {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'publication.json'), 'utf8'));
  const built = build();
  const errors = validatePublication(config, {
    event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY, actor: process.env.GITHUB_ACTOR,
    sha: process.env.GITHUB_SHA, approvedSha: process.env.APPROVED_SHA,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    expectedBundle: process.env.EXPECTED_BUNDLE_SHA256
  }, built.bundleSha256);
  if (errors.length) {
    for (const error of errors) console.error('HOLD: ' + error);
    process.exitCode = 1;
    return;
  }
  console.log('Source, identity and bundle checks passed. Human approval and GitHub environment settings are separate requirements.');
}
if (require.main === module) main();
module.exports = { validatePublication };
