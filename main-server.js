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
const runPythonScript = require('./utils/runPythonScript');

// Pre-resolve Python script paths and temp directories used by API endpoints
const repairScriptPath = path.join(__dirname, 'repair_script.py');
const subtractScriptPath = path.join(__dirname, 'subtract_script.py');
const tempDirs = {
    repair: path.join(__dirname, 'temp_repair'),
    subtract: path.join(__dirname, 'temp_subtract'),
    intersect: path.join(__dirname, 'temp_intersect'),
    intersectThin: path.join(__dirname, 'temp_intersect_thin'),
};

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
    try {
        const { result } = await runPythonScript({
            scriptPath: repairScriptPath,
            tempDir: tempDirs.repair,
            inputData: { input: stlDataString },
            buildArgs: ({ inputPaths, outputPath }) => [
                'repair',
                outputPath,
                '--input_file',
                inputPaths.input,
            ],
            logPrefix: 'Repair Script',
        });

        res.json({ repairedStlData: result });
    } catch (error) {
        console.error('Error in /api/repair-stl:', error);
        return res.status(500).json({
            error: 'Python repair script failed.',
            details: error.details,
            output: error.output,
        });
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
    try {
        const { result } = await runPythonScript({
            scriptPath: subtractScriptPath,
            tempDir: tempDirs.subtract,
            inputData: { model: modelStlData, logo: logoStlData },
            buildArgs: ({ inputPaths, outputPath }) => [
                'subtract',
                outputPath,
                '--model_file', inputPaths.model,
                '--tool_file', inputPaths.logo,
            ],
            logPrefix: 'Subtract Script',
        });
        res.json({ subtractedStlData: result });
    } catch (error) {
        console.error('Error in /api/subtract-stl:', error);
        return res.status(500).json({
            error: 'Python subtraction script failed.',
            details: error.details,
            output: error.output,
        });
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
    try {
        const { result } = await runPythonScript({
            scriptPath: subtractScriptPath,
            tempDir: tempDirs.subtract,
            inputData: { model: modelStlData, logo: logoStlData },
            buildArgs: ({ inputPaths, outputPath }) => [
                inputPaths.model,
                inputPaths.logo,
                outputPath,
            ],
            logPrefix: 'Subtract Script',
        });
        res.json({ subtractedStlData: result });
    } catch (error) {
        console.error('Error in /api/subtract-stl-scripted:', error);
        return res.status(500).json({
            error: 'Python subtraction script failed.',
            details: error.details,
            output: error.output,
        });
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
    try {
        const { result } = await runPythonScript({
            scriptPath: subtractScriptPath,
            tempDir: tempDirs.intersect,
            inputData: { model: modelStlData, logo: logoStlData },
            buildArgs: ({ inputPaths, outputPath }) => [
                inputPaths.model,
                inputPaths.logo,
                outputPath,
                '--operation',
                'intersection',
            ],
            logPrefix: 'Intersect Script',
        });
        res.json({ intersectedStlData: result });
    } catch (error) {
        console.error('Error in /api/intersect-stl-scripted:', error);
        return res.status(500).json({
            error: 'Python intersection script failed.',
            details: error.details,
            output: error.output,
        });
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
    try {
        const { result } = await runPythonScript({
            scriptPath: subtractScriptPath,
            tempDir: tempDirs.intersectThin,
            inputData: { model: modelStlData, logo: logoStlData },
            buildArgs: ({ inputPaths, outputPath }) => [
                inputPaths.model,
                inputPaths.logo,
                outputPath,
                '--operation',
                'thin_intersection',
                '--thickness-delta',
                thicknessDelta.toString(),
            ],
            logPrefix: 'Thin Intersect Script',
        });
        res.json({ thinIntersectedStlData: result });
    } catch (error) {
        console.error('Error in /api/intersect-thin-stl-scripted:', error);
        return res.status(500).json({
            error: 'Python thin intersection script failed.',
            details: error.details,
            output: error.output,
        });
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
