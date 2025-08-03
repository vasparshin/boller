console.log('Boller3D Server v1.0.1'); 
let express; 
try { 
    express = require('express'); 
} catch (e) { 
    console.error('ERROR requiring Express:', e); 
    process.exit(1); 
} 

let path; 
try { 
    path = require('path'); 
} catch(e) { 
    console.error('ERROR requiring path:', e); 
    process.exit(1); 
} 

let fs; 
try { 
    fs = require('fs'); 
} catch(e) { 
    console.error('ERROR requiring fs:', e); 
    process.exit(1); 
}

// Add required module for running the Python script
let child_process;
try {
    child_process = require('child_process');
} catch (e) {
    console.error('ERROR requiring child_process:', e);
    process.exit(1);
}

let app; 
try { 
    app = express(); 
} catch (e) { 
    console.error('ERROR initializing app:', e); 
    process.exit(1); 
}

// Use built-in Express middleware for parsing JSON and URL-encoded bodies
// Set limit to 250mb for both (Increased from 100mb)
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ extended: true, limit: '250mb' }));

try { 
    app.use(express.static(__dirname)); 
} catch (e) { 
    console.error('ERROR using static middleware:', e); 
    process.exit(1); 
}

// Handle favicon.ico requests to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response
});

// Serve models from the models directory
try { 
    app.use('/models', express.static(path.join(__dirname, 'models'))); 
} catch (e) { 
    console.error('ERROR serving models directory:', e); 
    process.exit(1); 
}

try { 
    app.get('/', (req, res) => { 
        try { 
            res.sendFile(path.join(__dirname, 'index.html')); 
        } catch (routeErr) { 
            console.error('ERROR inside route handler:', routeErr); 
            res.status(500).send('Route Error'); 
        } 
    }); 
} catch (e) { 
    console.error('ERROR configuring root route:', e); 
    process.exit(1); 
}

// Add API endpoint to list models
try {
    app.get('/api/models', (req, res) => {
        const modelsDir = path.join(__dirname, 'models');
        try {
            fs.readdir(modelsDir, (err, files) => {
                if (err) {
                    console.error("Error reading models directory:", err);
                    return res.status(500).json({ error: 'Could not read models directory' });
                }
                const stlFiles = files.filter(file => file.toLowerCase().endsWith('.stl'));
                res.json(stlFiles);
            });
        } catch (apiErr) {
            console.error('ERROR inside /api/models handler:', apiErr);
            res.status(500).send('API Error');
        }
    });
} catch (e) {
    console.error('ERROR configuring /api/models route:', e);
    process.exit(1);
}

// --- NEW API Endpoint for STL Repair --- 
app.post('/api/repair-stl', async (req, res) => {
    console.log("Received request for /api/repair-stl");
    // Expecting { stlData: "<STL string>" }
    const stlDataString = req.body.stlData; 

    if (!stlDataString) {
        console.error("No stlData found in request body");
        return res.status(400).json({ error: 'Missing stlData in request body' });
    }
    
    // Define temporary file paths
    const tempDir = path.join(__dirname, 'temp_repair');
    const inputFilename = `input_${Date.now()}.stl`;
    const outputFilename = `output_${Date.now()}.stl`;
    const inputPath = path.join(tempDir, inputFilename);
    const outputPath = path.join(tempDir, outputFilename);
    
    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)){
            console.log(`Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir);
        }
        
        // 1. Write the received text STL string to a temporary input file
        console.log(`Writing input STL (UTF8) to: ${inputPath}`);
        await fs.promises.writeFile(inputPath, stlDataString, 'utf8'); // Write as text
        console.log(`Input STL written successfully.`);

        // 2. Execute the Python repair script
        const pythonExecutable = 'python'; // Or specify full path if needed
        const scriptPath = path.join(__dirname, 'repair_script.py');
        console.log(`Executing Python script: ${pythonExecutable} ${scriptPath} ${inputPath} ${outputPath}`);

        // Correct arguments for the 'repair' operation
        const pythonArgs = [scriptPath, 'repair', outputPath, '--input_file', inputPath];
        console.log(`Corrected Python script execution: ${pythonExecutable} ${pythonArgs.join(' ')}`); // Log the corrected command
        const pythonProcess = child_process.spawn(pythonExecutable, pythonArgs);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            const outputChunk = data.toString();
            scriptOutput += outputChunk;
            console.log(`[Python STDOUT] ${outputChunk.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorChunk = data.toString();
            scriptError += errorChunk;
            console.error(`[Python STDERR] ${errorChunk.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
            console.log(`Python script exited with code ${code}`);

            // Keep input file cleanup commented out to inspect the input file on error
            /* 
            try {
                 console.log(`Cleaning up input file: ${inputPath}`);
                 await fs.promises.unlink(inputPath); 
            } catch (unlinkErr) {
                 console.warn(`Could not delete temp input file ${inputPath}:`, unlinkErr);
            }
            */
           console.warn(`Input file cleanup still disabled for debugging: ${inputPath}`); // Keep this warning active

            if (code !== 0) {
                console.error(`Python script failed. Error: ${scriptError}`);
                // Attempt to clean up output file if it exists
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ 
                     error: 'Python repair script failed.', 
                     details: scriptError || 'Unknown Python error', 
                     output: scriptOutput 
                });
            }

            // 3. Read the repaired STL file content as TEXT
            try {
                console.log(`Reading repaired STL (UTF8) from: ${outputPath}`);
                const repairedStlString = await fs.promises.readFile(outputPath, 'utf8'); // Read as text
                console.log(`Repaired STL read successfully.`);
                
                // 4. Send the repaired text STL string back to the client
                res.json({ repairedStlData: repairedStlString }); // Send text string
                
                 // 5. Clean up the output file after successful response
                 try {
                     console.log(`Cleaning up output file: ${outputPath}`);
                     await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {
                     console.warn(`Could not delete temp output file ${outputPath}:`, unlinkErr);
                 }

            } catch (readError) {
                console.error(`Error reading repaired STL file ${outputPath}:`, readError);
                return res.status(500).json({ error: 'Could not read repaired STL file.' });
            }
        });

        pythonProcess.on('error', (spawnError) => {
             console.error('Failed to start Python subprocess.', spawnError);
             // Attempt to clean up input file
             try {
                 if (fs.existsSync(inputPath)) fs.promises.unlink(inputPath);
             } catch (unlinkErr) {}
             res.status(500).json({ error: 'Failed to execute Python repair script.', details: spawnError.message });
        });

    } catch (error) {
        console.error('Error in /api/repair-stl:', error);
        // Attempt cleanup on general error
        try {
            if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
            if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
        } catch (unlinkErr) {
             console.warn("Error during cleanup:", unlinkErr);
        }
        res.status(500).json({ error: 'Server error during STL repair process.' });
    }
});
// --- END STL Repair Endpoint ---

// --- NEW API Endpoint for STL Subtraction --- 
app.post('/api/subtract-stl', async (req, res) => {
    console.log("Received request for /api/subtract-stl");
    
    // Expecting { modelStlData: "<STL string>", logoStlData: "<STL string>" }
    const { modelStlData, logoStlData } = req.body;

    if (!modelStlData || !logoStlData) {
        console.error("Missing modelStlData or logoStlData in request body");
        return res.status(400).json({ error: 'Missing modelStlData or logoStlData in request body' });
    }
    
    // Define temporary file paths
    const tempDir = path.join(__dirname, 'temp_subtract');
    const modelFilename = `model_${Date.now()}.stl`;
    const logoFilename = `logo_${Date.now()}.stl`;
    const outputFilename = `output_${Date.now()}.stl`;
    const modelPath = path.join(tempDir, modelFilename);
    const logoPath = path.join(tempDir, logoFilename);
    const outputPath = path.join(tempDir, outputFilename);
    
    let filesCreated = []; // Keep track of created files for cleanup

    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)){
            console.log(`Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir);
        }
        
        // 1. Write the received text STL strings to temporary input files
        console.log(`Writing model STL (UTF8) to: ${modelPath}`);
        await fs.promises.writeFile(modelPath, modelStlData, 'utf8');
        filesCreated.push(modelPath);
        console.log(`Model STL written successfully.`);
        
        console.log(`Writing logo STL (UTF8) to: ${logoPath}`);
        await fs.promises.writeFile(logoPath, logoStlData, 'utf8');
        filesCreated.push(logoPath);
        console.log(`Logo STL written successfully.`);

        // 2. Execute the Python subtraction script
        const pythonExecutable = 'python'; // Or specify full path
        const scriptPath = path.join(__dirname, 'subtract_script.py');
        const args = [
            scriptPath,
            'subtract',          // operation
            outputPath,          // output_file
            '--model_file', modelPath,
            '--tool_file', logoPath
        ];
        console.log(`Executing Python script: ${pythonExecutable} ${args.join(' ')}`);

        const pythonProcess = child_process.spawn(pythonExecutable, args);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            const outputChunk = data.toString();
            scriptOutput += outputChunk;
            console.log(`[Python STDOUT] ${outputChunk.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorChunk = data.toString();
            scriptError += errorChunk;
            console.error(`[Python STDERR] ${errorChunk.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
            console.log(`Python script exited with code ${code}`);

            // Clean up input files regardless of outcome
            for (const filePath of filesCreated) {
                if (filePath !== outputPath) { // Don't delete output yet
                    try { await fs.promises.unlink(filePath); } catch (e) { console.warn(`Could not delete temp file ${filePath}:`, e); }
                }
            }

            if (code !== 0) {
                console.error(`Python script failed. Error: ${scriptError}`);
                try { if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath); } catch (e) {} // Clean up potential failed output
                return res.status(500).json({ 
                     error: 'Python subtraction script failed.', 
                     details: scriptError || 'Unknown Python error', 
                     output: scriptOutput 
                });
            }

            // 3. Read the resulting STL file content as TEXT
            try {
                console.log(`Reading result STL (UTF8) from: ${outputPath}`);
                const resultStlString = await fs.promises.readFile(outputPath, 'utf8');
                console.log(`Result STL read successfully.`);
                
                // 4. Send the result text STL string back to the client
                res.json({ subtractedStlData: resultStlString });
                
                 // 5. Clean up the output file after successful response
                 try {
                     await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {
                     console.warn(`Could not delete temp output file ${outputPath}:`, unlinkErr);
                 }

            } catch (readError) {
                console.error(`Error reading result STL file ${outputPath}:`, readError);
                return res.status(500).json({ error: 'Could not read result STL file from Python script.' });
            }
        });

        pythonProcess.on('error', (spawnError) => {
             console.error('Failed to start Python subprocess.', spawnError);
             // Attempt cleanup on spawn error (use synchronous unlink here)
             for (const filePath of filesCreated) {
                 try {
                      if (fs.existsSync(filePath)) {
                           console.warn(`Sync cleanup on spawn error: ${filePath}`);
                           fs.unlinkSync(filePath);
                      }
                 } catch (e) { console.warn(`Could not delete temp file ${filePath} synchronously:`, e); }
             }
             res.status(500).json({ error: 'Failed to execute Python subtraction script.', details: spawnError.message });
        });

    } catch (error) {
        console.error('Error in /api/subtract-stl:', error);
        // Attempt cleanup on general error (use synchronous unlink here)
        for (const filePath of filesCreated) {
             try {
                  if (fs.existsSync(filePath)) {
                       console.warn(`Sync cleanup on general error: ${filePath}`);
                       fs.unlinkSync(filePath);
                  }
             } catch (e) { console.warn(`Could not delete temp file ${filePath} synchronously:`, e); }
        }
        if (fs.existsSync(outputPath)) {
             try {
                  console.warn(`Sync cleanup on general error (output): ${outputPath}`);
                  fs.unlinkSync(outputPath);
             } catch (e) { console.warn(`Could not delete temp output file ${outputPath} synchronously:`, e); }
        }
        res.status(500).json({ error: 'Server error during STL subtraction process.' });
    }
});
// --- END STL Subtraction Endpoint ---

// --- NEW Scripted Subtraction Endpoint ---
app.post('/api/subtract-stl-scripted', async (req, res) => {
    console.log("Received request for /api/subtract-stl-scripted");
    
    // Expecting { modelStlData: "<STL string>", logoStlData: "<STL string>" }
    const { modelStlData, logoStlData } = req.body;

    if (!modelStlData || !logoStlData) {
        console.error("Missing modelStlData or logoStlData in request body for subtraction");
        return res.status(400).json({ error: 'Missing modelStlData or logoStlData in request body' });
    }
    
    // Define temporary file paths for subtraction
    const tempDir = path.join(__dirname, 'temp_subtract'); // Use a separate temp dir
    const modelInputFilename = `model_in_${Date.now()}.stl`;
    const logoInputFilename = `logo_in_${Date.now()}.stl`;
    const outputFilename = `subtract_out_${Date.now()}.stl`;
    
    const modelInputPath = path.join(tempDir, modelInputFilename);
    const logoInputPath = path.join(tempDir, logoInputFilename);
    const outputPath = path.join(tempDir, outputFilename);
    
    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)){
            console.log(`Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir);
        }
        
        // 1. Write the received STL strings to temporary input files (UTF8/ASCII)
        console.log(`Writing model STL to: ${modelInputPath}`);
        await fs.promises.writeFile(modelInputPath, modelStlData, 'utf8'); 
        console.log(`Writing logo STL to: ${logoInputPath}`);
        await fs.promises.writeFile(logoInputPath, logoStlData, 'utf8'); 
        console.log(`Input STLs written successfully.`);

        // 2. Execute the Python subtraction script
        const pythonExecutable = 'python'; // Or specify full path
        const scriptPath = path.join(__dirname, 'subtract_script.py');
        
        // --- Add Python Path/Version Logging ---
        try {
            console.log("Checking Python executable used by Node.js...");
            const pyVersion = child_process.execSync(`${pythonExecutable} -V`).toString().trim();
            const pyPath = child_process.execSync(`${pythonExecutable} -c "import sys; print(sys.executable)"`).toString().trim();
            console.log(`Node.js will use Python Version: ${pyVersion}`);
            console.log(`Node.js will use Python Path: ${pyPath}`);
        } catch (pyCheckError) {
            console.error(`Failed to check Python version/path using '${pythonExecutable}':`, pyCheckError.message);
            console.error("Ensure Python is installed and accessible in the system PATH, or specify the full path in 'pythonExecutable'.");
            // Don't proceed if we can't even find Python
            return res.status(500).json({ error: 'Python executable not found or failed to execute.', details: pyCheckError.message });
        }
        // --- End Logging ---
        
        // Arguments: script_path model_input_path logo_input_path output_path
        const pythonArgs = [scriptPath, modelInputPath, logoInputPath, outputPath];
        console.log(`Executing Python subtraction script: ${pythonExecutable} ${pythonArgs.join(' ')}`);
        
        const pythonProcess = child_process.spawn(pythonExecutable, pythonArgs);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            const outputChunk = data.toString();
            scriptOutput += outputChunk;
            console.log(`[Subtract Script STDOUT] ${outputChunk.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorChunk = data.toString();
            scriptError += errorChunk;
            console.error(`[Subtract Script STDERR] ${errorChunk.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
            console.log(`Python subtraction script exited with code ${code}`);

            // --- Cleanup Input Files ---
            // Always try to delete input files regardless of outcome
            // Keep commented out for debugging if needed
            /*
            try {
                console.log(`Cleaning up input file: ${modelInputPath}`);
                await fs.promises.unlink(modelInputPath); 
                console.log(`Cleaning up input file: ${logoInputPath}`);
                await fs.promises.unlink(logoInputPath); 
            } catch (unlinkErr) {
                console.warn(`Could not delete temp input files:`, unlinkErr);
            }
            */
           console.warn(`Input file cleanup disabled for debugging: ${modelInputPath}, ${logoInputPath}`);


            if (code !== 0) {
                // Log the FULL error message
                console.error(`Python subtraction script failed. Full STDERR: ${scriptError}`); 
                // Attempt to clean up output file if it exists on error
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ 
                     error: 'Python subtraction script failed.', 
                     // Send the full error back in details for easier debugging client-side too
                     details: scriptError || 'Unknown Python error', 
                     output: scriptOutput 
                });
            }

            // 3. Read the result STL file content as TEXT
            try {
                console.log(`Reading subtracted STL (UTF8) from: ${outputPath}`);
                const subtractedStlString = await fs.promises.readFile(outputPath, 'utf8'); 
                console.log(`Subtracted STL read successfully.`);
                
                // 4. Send the result text STL string back to the client
                // IMPORTANT: Use the same JSON key as before ('subtractedStlData')
                res.json({ subtractedStlData: subtractedStlString }); 
                
                 // 5. Clean up the output file after successful response
                 try {
                     console.log(`Cleaning up output file: ${outputPath}`);
                     await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {
                     console.warn(`Could not delete temp output file ${outputPath}:`, unlinkErr);
                 }

            } catch (readError) {
                console.error(`Error reading subtracted STL file ${outputPath}:`, readError);
                 // Clean up output file on read error too
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ error: 'Could not read subtracted STL file.' });
            }
        });

        pythonProcess.on('error', (spawnError) => {
             console.error('Failed to start Python subtraction subprocess.', spawnError);
             // Attempt to clean up input files
             try {
                 if (fs.existsSync(modelInputPath)) fs.promises.unlink(modelInputPath);
                 if (fs.existsSync(logoInputPath)) fs.promises.unlink(logoInputPath);
             } catch (unlinkErr) {}
             res.status(500).json({ error: 'Failed to execute Python subtraction script.', details: spawnError.message });
        });

    } catch (error) {
        console.error('Error in /api/subtract-stl-scripted:', error);
        // Attempt cleanup on general error
        try {
            if (fs.existsSync(modelInputPath)) await fs.promises.unlink(modelInputPath);
            if (fs.existsSync(logoInputPath)) await fs.promises.unlink(logoInputPath);
            if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
        } catch (unlinkErr) {
             console.warn("Error during cleanup:", unlinkErr);
        }
        res.status(500).json({ error: 'Server error during STL subtraction process.' });
    }
});
// --- END Scripted Subtraction Endpoint ---

// --- NEW Scripted Intersection Endpoint ---
app.post('/api/intersect-stl-scripted', async (req, res) => {
    console.log("Received request for /api/intersect-stl-scripted");
    
    // Expecting { modelStlData: "<STL string>", logoStlData: "<STL string>" }
    const { modelStlData, logoStlData } = req.body;

    if (!modelStlData || !logoStlData) {
        console.error("Missing modelStlData or logoStlData in request body for intersection");
        return res.status(400).json({ error: 'Missing modelStlData or logoStlData in request body' });
    }
    
    // Define temporary file paths for intersection
    const tempDir = path.join(__dirname, 'temp_intersect'); // Use a separate temp dir for intersection
    const modelInputFilename = `model_in_${Date.now()}.stl`;
    const logoInputFilename = `logo_in_${Date.now()}.stl`;
    const outputFilename = `intersect_out_${Date.now()}.stl`;
    
    const modelInputPath = path.join(tempDir, modelInputFilename);
    const logoInputPath = path.join(tempDir, logoInputFilename);
    const outputPath = path.join(tempDir, outputFilename);
    
    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)){
            console.log(`Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir);
        }
        
        // 1. Write the received STL strings to temporary input files (UTF8/ASCII)
        console.log(`Writing model STL to: ${modelInputPath}`);
        await fs.promises.writeFile(modelInputPath, modelStlData, 'utf8'); 
        console.log(`Writing logo STL to: ${logoInputPath}`);
        await fs.promises.writeFile(logoInputPath, logoStlData, 'utf8'); 
        console.log(`Input STLs written successfully.`);

        // 2. Execute the Python intersection script with --operation intersection
        const pythonExecutable = 'python'; // Or specify full path
        const scriptPath = path.join(__dirname, 'subtract_script.py'); // Use the same script but with intersection operation
        
        // --- Add Python Path/Version Logging ---
        try {
            console.log("Checking Python executable used by Node.js...");
            const pyVersion = child_process.execSync(`${pythonExecutable} -V`).toString().trim();
            const pyPath = child_process.execSync(`${pythonExecutable} -c "import sys; print(sys.executable)"`).toString().trim();
            console.log(`Node.js will use Python Version: ${pyVersion}`);
            console.log(`Node.js will use Python Path: ${pyPath}`);
        } catch (pyCheckError) {
            console.error(`Failed to check Python version/path using '${pythonExecutable}':`, pyCheckError.message);
            console.error("Ensure Python is installed and accessible in the system PATH, or specify the full path in 'pythonExecutable'.");
            // Don't proceed if we can't even find Python
            return res.status(500).json({ error: 'Python executable not found or failed to execute.', details: pyCheckError.message });
        }
        // --- End Logging ---
        
        // Arguments: script_path model_input_path logo_input_path output_path --operation intersection
        const pythonArgs = [scriptPath, modelInputPath, logoInputPath, outputPath, '--operation', 'intersection'];
        console.log(`Executing Python intersection script: ${pythonExecutable} ${pythonArgs.join(' ')}`);
        
        const pythonProcess = child_process.spawn(pythonExecutable, pythonArgs);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            const outputChunk = data.toString();
            scriptOutput += outputChunk;
            console.log(`[Intersect Script STDOUT] ${outputChunk.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorChunk = data.toString();
            scriptError += errorChunk;
            console.error(`[Intersect Script STDERR] ${errorChunk.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
            console.log(`Python intersection script exited with code ${code}`);

            // --- Cleanup Input Files ---
            // Always try to delete input files regardless of outcome
            // Keep commented out for debugging if needed
            /*
            try {
                console.log(`Cleaning up input file: ${modelInputPath}`);
                await fs.promises.unlink(modelInputPath); 
                console.log(`Cleaning up input file: ${logoInputPath}`);
                await fs.promises.unlink(logoInputPath); 
            } catch (unlinkErr) {
                console.warn(`Could not delete temp input files:`, unlinkErr);
            }
            */
           console.warn(`Input file cleanup disabled for debugging: ${modelInputPath}, ${logoInputPath}`);

            if (code !== 0) {
                // Log the FULL error message
                console.error(`Python intersection script failed. Full STDERR: ${scriptError}`); 
                // Attempt to clean up output file if it exists on error
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ 
                     error: 'Python intersection script failed.', 
                     // Send the full error back in details for easier debugging client-side too
                     details: scriptError || 'Unknown Python error', 
                     output: scriptOutput 
                });
            }

            // 3. Read the result STL file content as TEXT
            try {
                console.log(`Reading intersected STL (UTF8) from: ${outputPath}`);
                const intersectedStlString = await fs.promises.readFile(outputPath, 'utf8'); 
                console.log(`Intersected STL read successfully.`);
                
                // 4. Send the result text STL string back to the client
                // Use a consistent JSON key for intersection results
                res.json({ intersectedStlData: intersectedStlString }); 
                
                 // 5. Clean up the output file after successful response
                 try {
                     console.log(`Cleaning up output file: ${outputPath}`);
                     await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {
                     console.warn(`Could not delete temp output file ${outputPath}:`, unlinkErr);
                 }

            } catch (readError) {
                console.error(`Error reading intersected STL file ${outputPath}:`, readError);
                 // Clean up output file on read error too
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ error: 'Could not read intersected STL file.' });
            }
        });

        pythonProcess.on('error', (spawnError) => {
             console.error('Failed to start Python intersection subprocess.', spawnError);
             // Attempt to clean up input files
             try {
                 if (fs.existsSync(modelInputPath)) fs.promises.unlink(modelInputPath);
                 if (fs.existsSync(logoInputPath)) fs.promises.unlink(logoInputPath);
             } catch (unlinkErr) {}
             res.status(500).json({ error: 'Failed to execute Python intersection script.', details: spawnError.message });
        });

    } catch (error) {
        console.error('Error in /api/intersect-stl-scripted:', error);
        // Attempt cleanup on general error
        try {
            if (fs.existsSync(modelInputPath)) await fs.promises.unlink(modelInputPath);
            if (fs.existsSync(logoInputPath)) await fs.promises.unlink(logoInputPath);
            if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
        } catch (unlinkErr) {
             console.warn("Error during cleanup:", unlinkErr);
        }
        res.status(500).json({ error: 'Server error during STL intersection process.' });
    }
});
// --- END Scripted Intersection Endpoint ---

// --- NEW Scripted Thin Intersection Endpoint ---
app.post('/api/intersect-thin-stl-scripted', async (req, res) => {
    console.log("Received request for /api/intersect-thin-stl-scripted");
    
    // Expecting { modelStlData: "<STL string>", logoStlData: "<STL string>", thicknessDelta: number }
    const { modelStlData, logoStlData, thicknessDelta = 1.0 } = req.body;

    if (!modelStlData || !logoStlData) {
        console.error("Missing modelStlData or logoStlData in request body for thin intersection");
        return res.status(400).json({ error: 'Missing modelStlData or logoStlData in request body' });
    }
    
    // Define temporary file paths for thin intersection
    const tempDir = path.join(__dirname, 'temp_intersect_thin'); // Use a separate temp dir for thin intersection
    const modelInputFilename = `model_in_${Date.now()}.stl`;
    const logoInputFilename = `logo_in_${Date.now()}.stl`;
    const outputFilename = `intersect_thin_out_${Date.now()}.stl`;
    
    const modelInputPath = path.join(tempDir, modelInputFilename);
    const logoInputPath = path.join(tempDir, logoInputFilename);
    const outputPath = path.join(tempDir, outputFilename);
    
    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)){
            console.log(`Creating temp directory: ${tempDir}`);
            fs.mkdirSync(tempDir);
        }
        
        // 1. Write the received STL strings to temporary input files (UTF8/ASCII)
        console.log(`Writing model STL to: ${modelInputPath}`);
        await fs.promises.writeFile(modelInputPath, modelStlData, 'utf8'); 
        console.log(`Writing logo STL to: ${logoInputPath}`);
        await fs.promises.writeFile(logoInputPath, logoStlData, 'utf8'); 
        console.log(`Input STLs written successfully.`);

        // 2. Execute the Python thin intersection script with --operation thin_intersection
        const pythonExecutable = 'python'; // Or specify full path
        const scriptPath = path.join(__dirname, 'subtract_script.py'); // Use the same script but with thin_intersection operation
        
        // --- Add Python Path/Version Logging ---
        try {
            console.log("Checking Python executable used by Node.js...");
            const pyVersion = child_process.execSync(`${pythonExecutable} -V`).toString().trim();
            const pyPath = child_process.execSync(`${pythonExecutable} -c "import sys; print(sys.executable)"`).toString().trim();
            console.log(`Node.js will use Python Version: ${pyVersion}`);
            console.log(`Node.js will use Python Path: ${pyPath}`);
        } catch (pyCheckError) {
            console.error(`Failed to check Python version/path using '${pythonExecutable}':`, pyCheckError.message);
            console.error("Ensure Python is installed and accessible in the system PATH, or specify the full path in 'pythonExecutable'.");
            // Don't proceed if we can't even find Python
            return res.status(500).json({ error: 'Python executable not found or failed to execute.', details: pyCheckError.message });
        }
        // --- End Logging ---
        
        // Arguments: script_path model_input_path logo_input_path output_path --operation thin_intersection --thickness-delta value
        const pythonArgs = [scriptPath, modelInputPath, logoInputPath, outputPath, '--operation', 'thin_intersection', '--thickness-delta', thicknessDelta.toString()];
        console.log(`Executing Python thin intersection script: ${pythonExecutable} ${pythonArgs.join(' ')}`);
        
        const pythonProcess = child_process.spawn(pythonExecutable, pythonArgs);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            const outputChunk = data.toString();
            scriptOutput += outputChunk;
            console.log(`[Thin Intersect Script STDOUT] ${outputChunk.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorChunk = data.toString();
            scriptError += errorChunk;
            console.error(`[Thin Intersect Script STDERR] ${errorChunk.trim()}`);
        });

        pythonProcess.on('close', async (code) => {
            console.log(`Python thin intersection script exited with code ${code}`);

            // --- Cleanup Input Files ---
            // Always try to delete input files regardless of outcome
            // Keep commented out for debugging if needed
            /*
            try {
                console.log(`Cleaning up input file: ${modelInputPath}`);
                await fs.promises.unlink(modelInputPath); 
                console.log(`Cleaning up input file: ${logoInputPath}`);
                await fs.promises.unlink(logoInputPath); 
            } catch (unlinkErr) {
                console.warn(`Could not delete temp input files:`, unlinkErr);
            }
            */
           console.warn(`Input file cleanup disabled for debugging: ${modelInputPath}, ${logoInputPath}`);

            if (code !== 0) {
                // Log the FULL error message
                console.error(`Python thin intersection script failed. Full STDERR: ${scriptError}`); 
                // Attempt to clean up output file if it exists on error
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ 
                     error: 'Python thin intersection script failed.', 
                     // Send the full error back in details for easier debugging client-side too
                     details: scriptError || 'Unknown Python error', 
                     output: scriptOutput 
                });
            }

            // 3. Read the result STL file content as TEXT
            try {
                console.log(`Reading thin intersected STL (UTF8) from: ${outputPath}`);
                const thinIntersectedStlString = await fs.promises.readFile(outputPath, 'utf8'); 
                console.log(`Thin intersected STL read successfully.`);
                
                // 4. Send the result text STL string back to the client
                // Use a consistent JSON key for thin intersection results
                res.json({ thinIntersectedStlData: thinIntersectedStlString }); 
                
                 // 5. Clean up the output file after successful response
                 try {
                     console.log(`Cleaning up output file: ${outputPath}`);
                     await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {
                     console.warn(`Could not delete temp output file ${outputPath}:`, unlinkErr);
                 }

            } catch (readError) {
                console.error(`Error reading thin intersected STL file ${outputPath}:`, readError);
                 // Clean up output file on read error too
                 try {
                     if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
                 } catch (unlinkErr) {}
                return res.status(500).json({ error: 'Could not read thin intersected STL file.' });
            }
        });

        pythonProcess.on('error', (spawnError) => {
             console.error('Failed to start Python thin intersection subprocess.', spawnError);
             // Attempt to clean up input files
             try {
                 if (fs.existsSync(modelInputPath)) fs.promises.unlink(modelInputPath);
                 if (fs.existsSync(logoInputPath)) fs.promises.unlink(logoInputPath);
             } catch (unlinkErr) {}
             res.status(500).json({ error: 'Failed to execute Python thin intersection script.', details: spawnError.message });
        });

    } catch (error) {
        console.error('Error in /api/intersect-thin-stl-scripted:', error);
        // Attempt cleanup on general error
        try {
            if (fs.existsSync(modelInputPath)) await fs.promises.unlink(modelInputPath);
            if (fs.existsSync(logoInputPath)) await fs.promises.unlink(logoInputPath);
            if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
        } catch (unlinkErr) {
             console.warn("Error during cleanup:", unlinkErr);
        }
        res.status(500).json({ error: 'Server error during STL thin intersection process.' });
    }
});
// --- END Scripted Thin Intersection Endpoint ---

// Add logging functionality
app.post('/api/log', (req, res) => {
    try {
        // Check if request has a body and message
        let message = "No message provided";
        
        // Handle both JSON and raw body formats
        if (req.body) {
            if (req.body.message) {
                message = req.body.message;
            } else if (typeof req.body === 'string') {
                message = req.body;
            } else {
                message = JSON.stringify(req.body);
            }
        }
        
        // Log to console (with shortened message if very long)
        const displayMessage = message.length > 300 ? 
            message.substring(0, 300) + "... [truncated]" : message;
        console.log("[CLIENT LOG]", displayMessage);
        
        // Append to log file (optional, can be disabled)
        try {
            fs.appendFileSync('boller3d.log', new Date().toISOString() + " " + message + '\n');
        } catch (fileError) {
            // Silent fail for file write errors - still respond success to client
            console.warn("Failed to write to log file:", fileError.message);
        }
        
        res.status(200).send('Log recorded');
    } catch (error) {
        console.error("Error in logging:", error);
        res.status(500).send('Failed to log message');
    }
});

const PORT = process.env.PORT || 3000;
let serverInstance = null; // Keep a reference to the server

try {
    serverInstance = app.listen(PORT, () => { // Store the server instance
        console.log(`Boller3D Server running on port ${PORT}`);
    });
    serverInstance.on('error', (error) => {
        console.error(`CRITICAL SERVER ERROR on listen (${PORT}):`, error);
        // Don't exit here if EADDRINUSE, nodemon might handle restart
        if (error.code !== 'EADDRINUSE') {
             process.exit(1);
        }
    });
} catch (listenError) {
    console.error('CRITICAL ERROR: Exception during app.listen setup:', listenError);
    process.exit(1);
}

// Graceful shutdown logic
function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('HTTP server closed.');
            // Perform any other cleanup here
            process.exit(0); // Exit cleanly
        });
    } else {
        process.exit(0); // Exit if server wasn't even started
    }

    // Force shutdown if server hangs
    setTimeout(() => {
        console.error('Could not close connections in time, forcing shutdown');
        process.exit(1);
    }, 10000); // 10 seconds timeout
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Handle Ctrl+C
