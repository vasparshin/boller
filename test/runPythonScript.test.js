const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const runPythonScript = require('../utils/runPythonScript');

test('runPythonScript executes python and returns output', async () => {
  const scriptDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'script-'));
  const scriptPath = path.join(scriptDir, 'copy.py');
  await fs.promises.writeFile(
    scriptPath,
    'import sys\nopen(sys.argv[2], "w").write(open(sys.argv[1]).read().upper())',
    'utf8'
  );

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'temp-'));
  const { result } = await runPythonScript({
    scriptPath,
    tempDir,
    inputData: { input: 'hello world' },
    buildArgs: ({ inputPaths, outputPath }) => [inputPaths.input, outputPath],
    logPrefix: 'Test'
  });

  assert.strictEqual(result.trim(), 'HELLO WORLD');
  const remaining = await fs.promises.readdir(tempDir);
  assert.deepStrictEqual(remaining, []);
});

test('runPythonScript propagates python errors', async () => {
  const scriptDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'script-'));
  const scriptPath = path.join(scriptDir, 'fail.py');
  await fs.promises.writeFile(
    scriptPath,
    'import sys\nprint("bad", file=sys.stderr)\nsys.exit(1)',
    'utf8'
  );

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'temp-'));

  await assert.rejects(
    () =>
      runPythonScript({
        scriptPath,
        tempDir,
        inputData: { input: 'data' },
        buildArgs: ({ inputPaths, outputPath }) => [inputPaths.input, outputPath],
        logPrefix: 'Test'
      }),
    /Python script failed/
  );
  const remaining = await fs.promises.readdir(tempDir);
  assert.deepStrictEqual(remaining, []);
});
test('runPythonScript errors when python executable is missing', async () => {
  const scriptDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'script-'));
  const scriptPath = path.join(scriptDir, 'noop.py');
  await fs.promises.writeFile(scriptPath, 'open(__import__("sys").argv[2], "w").write("ok")', 'utf8');

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'temp-'));
  await assert.rejects(
    () =>
      runPythonScript({
        scriptPath,
        tempDir,
        inputData: { input: 'data' },
        buildArgs: ({ inputPaths, outputPath }) => [inputPaths.input, outputPath],
        pythonExecutable: 'nonexistent-python',
        logPrefix: 'Test'
      }),
    /Python executable not found/
  );
  const remaining = await fs.promises.readdir(tempDir);
  assert.deepStrictEqual(remaining, []);
});
