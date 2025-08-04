const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

/**
 * Runs a Python script with temporary input/output files.
 *
 * @param {Object} options
 * @param {string} options.scriptPath - Path to the python script.
 * @param {string} options.tempDir - Directory to place temporary files.
 * @param {Object} options.inputData - Map of input name -> string contents.
 * @param {Function} options.buildArgs - Function({inputPaths, outputPath}) returning array of args.
 * @param {string} [options.pythonExecutable='python'] - Python executable.
 * @param {string} [options.logPrefix='Python'] - Prefix for stdout/stderr logs.
 * @returns {Promise<{result: string, stdout: string, stderr: string}>}
 */
async function runPythonScript({
    scriptPath,
    tempDir,
    inputData,
    buildArgs,
    pythonExecutable = 'python',
    logPrefix = 'Python'
}) {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputPaths = {};
    try {
        // Write input files
        await Promise.all(
            Object.entries(inputData).map(async ([key, data]) => {
                const filename = `${key}_${timestamp}.stl`;
                const filePath = path.join(tempDir, filename);
                await fs.promises.writeFile(filePath, data, 'utf8');
                inputPaths[key] = filePath;
            })
        );
    } catch (err) {
        throw new Error(`Failed to write input files: ${err.message}`);
    }

    const outputPath = path.join(tempDir, `output_${timestamp}.stl`);

    // Log Python version and path
    try {
        const pyVersion = child_process.execSync(`${pythonExecutable} -V`).toString().trim();
        const pyPath = child_process
            .execSync(`${pythonExecutable} -c "import sys; print(sys.executable)"`)
            .toString()
            .trim();
        console.log(`${logPrefix} using Python Version: ${pyVersion}`);
        console.log(`${logPrefix} using Python Path: ${pyPath}`);
    } catch (pyCheckError) {
        await cleanup(inputPaths, outputPath);
        const err = new Error('Python executable not found or failed to execute.');
        err.details = pyCheckError.message;
        throw err;
    }

    const args = [scriptPath, ...buildArgs({ inputPaths, outputPath })];
    return await new Promise((resolve, reject) => {
        const proc = child_process.spawn(pythonExecutable, args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            console.log(`[${logPrefix} STDOUT] ${chunk.trim()}`);
        });

        proc.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            console.error(`[${logPrefix} STDERR] ${chunk.trim()}`);
        });

        proc.on('error', async (err) => {
            await cleanup(inputPaths, outputPath);
            const error = new Error('Failed to start Python subprocess.');
            error.details = err.message;
            reject(error);
        });

        proc.on('close', async (code) => {
            try {
                if (code !== 0) {
                    await cleanup(inputPaths, outputPath);
                    const error = new Error('Python script failed.');
                    error.details = stderr || 'Unknown Python error';
                    error.output = stdout;
                    return reject(error);
                }

                const result = await fs.promises.readFile(outputPath, 'utf8');
                await cleanup(inputPaths, outputPath);
                resolve({ result, stdout, stderr });
            } catch (readErr) {
                await cleanup(inputPaths, outputPath);
                const error = new Error('Could not read output file.');
                error.details = readErr.message;
                reject(error);
            }
        });
    });
}

async function cleanup(inputPaths, outputPath) {
    for (const p of Object.values(inputPaths)) {
        try {
            await fs.promises.unlink(p);
        } catch (_) {}
    }
    try {
        await fs.promises.unlink(outputPath);
    } catch (_) {}
}

module.exports = runPythonScript;
