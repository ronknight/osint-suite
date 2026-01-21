const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = 3001;
const HOME_DIR = path.join(__dirname, '..');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Tool Configurations ---
const TOOLS = {
    spiderfoot: {
        name: 'SpiderFoot',
        cwd: path.join(HOME_DIR, 'spiderfoot'),
        command: 'python3',
        args: ['sf.py', '-l', '127.0.0.1:5001'],
        url: 'http://127.0.0.1:5001',
        type: 'service'
    },
    phoneinfoga: {
        name: 'PhoneInfoga',
        cwd: path.join(HOME_DIR, 'phoneinfoga'),
        command: path.join(HOME_DIR, 'phoneinfoga', 'bin', 'phoneinfoga'),
        args: ['serve', '-p', '5000'],
        url: 'http://127.0.0.1:5000',
        type: 'service'
    },
    sherlock: {
        name: 'Sherlock',
        cwd: path.join(HOME_DIR, 'sherlock'),
        command: 'python3',
        type: 'cli'
    },
    holehe: {
        name: 'Holehe',
        cwd: HOME_DIR,
        command: 'holehe',
        type: 'cli'
    },
    theHarvester: {
        name: 'theHarvester',
        cwd: HOME_DIR,
        command: 'theHarvester',
        type: 'cli'
    },
    photon: {
        name: 'Photon',
        cwd: path.join(HOME_DIR, 'Photon'),
        command: 'python3',
        type: 'cli'
    },
    blackbird: {
        name: 'Blackbird',
        cwd: path.join(HOME_DIR, 'blackbird'),
        command: 'python3',
        type: 'cli'
    },
    sublist3r: {
        name: 'Sublist3r',
        cwd: path.join(HOME_DIR, 'Sublist3r'),
        command: 'python3',
        type: 'cli'
    }
};

// --- Process Management ---
const runningProcesses = {}; 

function updateStatus() {
    for (const [id, proc] of Object.entries(runningProcesses)) {
        try {
            process.kill(proc.pid, 0); 
        } catch (e) {
            delete runningProcesses[id];
        }
    }
}

// --- APIs ---

app.get('/api/status', (req, res) => {
    updateStatus();
    const status = Object.keys(TOOLS)
        .filter(id => TOOLS[id].type === 'service')
        .map(id => ({
            id,
            name: TOOLS[id].name,
            status: runningProcesses[id] ? 'running' : 'stopped',
            url: TOOLS[id].url
        }));
    res.json(status);
});

app.post('/api/control', (req, res) => {
    const { id, action } = req.body;
    const tool = TOOLS[id];

    if (!tool || tool.type !== 'service') return res.status(400).json({ error: 'Invalid tool' });

    updateStatus();

    if (action === 'start') {
        if (runningProcesses[id]) return res.json({ status: 'running' });

        console.log(`Starting ${id}...`);
        const child = spawn(tool.command, tool.args, {
            cwd: tool.cwd,
            detached: false,
            stdio: 'ignore' 
        });
        
        runningProcesses[id] = { pid: child.pid, process: child, startTime: Date.now() };
        return res.json({ status: 'running' });
    } 
    else if (action === 'stop') {
        if (runningProcesses[id]) {
            try {
                process.kill(runningProcesses[id].pid);
                delete runningProcesses[id];
            } catch (e) {
                console.error(e);
            }
        }
        return res.json({ status: 'stopped' });
    }
    
    res.status(400).json({ error: 'Invalid action' });
});

// Generic CLI Endpoint
app.get('/api/cli', (req, res) => {
    const { tool: toolId, args: argString } = req.query;
    
    if (!TOOLS[toolId] || TOOLS[toolId].type !== 'cli') {
        return res.status(400).send('Invalid tool');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const tool = TOOLS[toolId];
    let spawnArgs = [];
    
    // Construct args based on tool
    if (toolId === 'sherlock') {
        spawnArgs = ['-m', 'sherlock_project', argString, '--timeout', '5'];
    } else if (toolId === 'holehe') {
        spawnArgs = [argString, '--only-used'];
    } else if (toolId === 'theHarvester') {
        spawnArgs = ['-d', argString, '-b', 'all'];
    } else if (toolId === 'photon') {
        // python3 photon.py -u <url>
        spawnArgs = ['photon.py', '-u', argString];
    } else if (toolId === 'blackbird') {
        // python3 blackbird.py -u <username>
        spawnArgs = ['blackbird.py', '-u', argString];
    } else if (toolId === 'sublist3r') {
        // python3 sublist3r.py -d <domain>
        spawnArgs = ['sublist3r.py', '-d', argString];
    }

    console.log(`Running CLI: ${tool.command} ${spawnArgs.join(' ')}`);

    const child = spawn(tool.command, spawnArgs, {
        cwd: tool.cwd,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    const send = (data) => {
        res.write(`data: ${JSON.stringify({ text: data })}\n\n`);
    };

    child.stdout.on('data', (data) => send(data.toString()));
    child.stderr.on('data', (data) => send(data.toString()));

    child.on('close', (code) => {
        send(`\n[Process exited with code ${code}]`);
        res.end();
    });
    
    child.on('error', (err) => {
        send(`\n[Error] Failed to start process: ${err.message}`);
        res.end();
    });

    req.on('close', () => {
        if (!child.killed) child.kill();
    });
});

// Hunter.io Proxy
app.get('/api/hunter', (req, res) => {
    const { domain, key } = req.query;
    if (!domain || !key) return res.status(400).json({ error: 'Domain and API Key required' });
    const url = `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${key}`;
    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => res.send(data));
    }).on('error', (e) => res.status(500).json({ error: e.message }));
});

// Shodan Proxy (Host Information)
app.get('/api/shodan', (req, res) => {
    const { ip, key } = req.query;
    if (!ip || !key) return res.status(400).json({ error: 'IP and API Key required' });
    const url = `https://api.shodan.io/shodan/host/${ip}?key=${key}`;
    https.get(url, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => res.send(data));
    }).on('error', (e) => res.status(500).json({ error: e.message }));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
