import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCallerInfo } from '../../dist/utils.js';

function collectCallerInfoFromNamedFunction() {
  return parseCallerInfo(collectCallerInfoFromNamedFunction);
}

test('parseCallerInfo captures external frame metadata', () => {
  const caller = collectCallerInfoFromNamedFunction();

  assert.match(String(caller.filePath), /parse-caller-info\.test\.mjs$/);
  assert.equal(typeof caller.lineNumber, 'number');
  assert.ok(caller.lineNumber > 0);
});

test('parseCallerInfo excludes node and internal frame paths', () => {
  const caller = collectCallerInfoFromNamedFunction();

  assert.ok(caller.filePath === null || !caller.filePath.startsWith('node:'));
  assert.ok(caller.filePath === null || !caller.filePath.includes('internal'));
});

test('parseCallerInfo captures named function when available', () => {
  const caller = collectCallerInfoFromNamedFunction();

  assert.ok(
    caller.functionName === null || caller.functionName === 'collectCallerInfoFromNamedFunction',
    `Unexpected functionName: ${String(caller.functionName)}`,
  );
});

test('parseCallerInfo returns a safe fallback shape for edge calls', () => {
  const caller = parseCallerInfo(parseCallerInfo);

  assert.ok(Object.hasOwn(caller, 'filePath'));
  assert.ok(Object.hasOwn(caller, 'lineNumber'));
  assert.ok(Object.hasOwn(caller, 'functionName'));
  assert.ok(caller.filePath === null || typeof caller.filePath === 'string');
  assert.ok(caller.lineNumber === null || typeof caller.lineNumber === 'number');
  assert.ok(caller.functionName === null || typeof caller.functionName === 'string');
});
