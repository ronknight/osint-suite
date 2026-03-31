const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const exifr = require('exifr');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const app = express();
const PORT = 3005;
const HOME_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(__dirname, 'contacts.db');

app.use(cors());
app.use(express.json());
console.log('Static directory:', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Database Connection ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Error opening database:', err);
    else {
        console.log('Connected to SQLite database at', DB_PATH);
        // Auto-migrate missing columns
        const socialColumns = [
            "Instagram_Handle TEXT", "Insta_Social_Name TEXT", "Insta_Photo_URL TEXT",
            "TikTok_Handle TEXT", "TikTok_Social_Name TEXT", "TikTok_Photo_URL TEXT",
            "Twitter_Handle TEXT", "Twitter_Social_Name TEXT", "Twitter_Photo_URL TEXT",
            "LinkedIn_Profile TEXT", "LinkedIn_Social_Name TEXT", "LinkedIn_Photo_URL TEXT",
            "YouTube_Channel TEXT", "YouTube_Social_Name TEXT", "YouTube_Photo_URL TEXT",
            "Snapchat_Handle TEXT", "Snapchat_Social_Name TEXT", "Snapchat_Photo_URL TEXT",
            "Discord_Handle TEXT", "Discord_Social_Name TEXT", "Discord_Photo_URL TEXT",
            "Twitch_Handle TEXT", "Twitch_Social_Name TEXT", "Twitch_Photo_URL TEXT",
            "Reddit_Handle TEXT", "Reddit_Social_Name TEXT", "Reddit_Photo_URL TEXT",
            "Pinterest_Handle TEXT", "Pinterest_Social_Name TEXT", "Pinterest_Photo_URL TEXT",
            "Telegram_Handle TEXT", "Telegram_Social_Name TEXT", "Telegram_Photo_URL TEXT",
            "WhatsApp_Number TEXT", "WhatsApp_Social_Name TEXT", "WhatsApp_Photo_URL TEXT",
            "Discovered_Links TEXT", "Social_Score INTEGER DEFAULT 0"
        ];
        
        db.all("PRAGMA table_info(contact)", (err, rows) => {
            if (err) return console.error('Migration check failed:', err);
            const existingNames = new Set(rows.map(r => r.name));
            socialColumns.forEach(colDef => {
                const colName = colDef.split(' ')[0];
                if (!existingNames.has(colName)) {
                    console.log(`Auto-adding missing column: ${colName}`);
                    db.run(`ALTER TABLE contact ADD COLUMN ${colDef}`, (err) => {
                        if (err) console.error(`Failed to add column ${colName}:`, err);
                    });
                }
            });
        });
    }
});

// --- Contacts APIs ---

// 1. Fetch Contacts (Paginated)
app.get('/api/contacts', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search || '';
    
    let query = "SELECT * FROM contact WHERE IsDeleted = 0";
    let params = [];
    
    if (search) {
        query += " AND (Cus_Name LIKE ? OR Email LIKE ? OR Phone LIKE ?)";
        const term = `%${search}%`;
        params.push(term, term, term);
    }
    
    // Count Total
    let countQuery = "SELECT count(*) as total FROM contact WHERE IsDeleted = 0";
    if (search) {
        countQuery += " AND (Cus_Name LIKE ? OR Email LIKE ? OR Phone LIKE ?)";
    }
    
    db.get(countQuery, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = row.total;
        
        // Fetch Data
        query += " LIMIT ? OFFSET ?";
        params.push(limit, offset);
        
        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows,
                total,
                limit,
                offset
            });
        });
    });
});

// 2. Fetch Aggregates (Dashboard)
app.get('/api/contacts/aggregates', (req, res) => {
    const queries = {
        total: "SELECT count(*) as count FROM contact WHERE IsDeleted = 0",
        vip: "SELECT count(*) as count FROM contact WHERE MemberType = 'VIP' AND IsDeleted = 0",
        social: "SELECT count(*) as count FROM contact WHERE Social_Score > 0 AND IsDeleted = 0",
        income: "SELECT sum(Income) as sum, avg(Income) as avg FROM contact WHERE IsDeleted = 0",
        buckets: `SELECT 
            SUM(CASE WHEN Income < 30000 THEN 1 ELSE 0 END) as low,
            SUM(CASE WHEN Income >= 30000 AND Income < 100000 THEN 1 ELSE 0 END) as mid,
            SUM(CASE WHEN Income >= 100000 THEN 1 ELSE 0 END) as high
            FROM contact WHERE IsDeleted = 0`
    };

    // Execute sequentially (Callback Hell style for simplicity without Promises wrapper)
    db.get(queries.total, (err, totalRow) => {
        if (err) return res.status(500).json({ error: 'Total: ' + err.message });
        
        db.get(queries.vip, (err, vipRow) => {
            if (err) return res.status(500).json({ error: 'VIP: ' + err.message });
            
            db.get(queries.social, (err, socialRow) => {
                if (err) return res.status(500).json({ error: 'Social: ' + err.message });
                
                db.get(queries.income, (err, incomeRow) => {
                    if (err) return res.status(500).json({ error: 'Income: ' + err.message });
                    
                    db.get(queries.buckets, (err, bucketRow) => {
                         if (err) return res.status(500).json({ error: 'Buckets: ' + err.message });
                         
                         res.json({
                             total: totalRow ? totalRow.count : 0,
                             vip: vipRow ? vipRow.count : 0,
                             social: socialRow ? socialRow.count : 0,
                             incomeSum: incomeRow ? (incomeRow.sum || 0) : 0,
                             incomeAvg: incomeRow ? (incomeRow.avg || 0) : 0,
                             buckets: {
                                 low: bucketRow ? (bucketRow.low || 0) : 0,
                                 mid: bucketRow ? (bucketRow.mid || 0) : 0,
                                 high: bucketRow ? (bucketRow.high || 0) : 0
                             }
                         });
                    });
                });
            });
        });
    });
});

// 3. Get Contact Details (Specifically for handles)
app.get('/api/social/handles', (req, res) => {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing ID' });
    
    db.get("SELECT * FROM contact WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json([row]); // Frontend expects array
    });
});

// 4. Update Social Fields
app.post('/api/social/update', (req, res) => {
    const { id, platform, handle, socialName, photoUrl, discoveredLinks } = req.body;
    
    if (!id) return res.status(400).json({ error: 'Missing ID' });

    const updates = [];
    const params = [];

    if (platform) {
        // Validate platform to prevent SQL injection in column names
        const allowedPlatforms = ['instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'snapchat', 'discord', 'twitch', 'reddit', 'pinterest', 'telegram', 'whatsapp'];
        if (!allowedPlatforms.includes(platform.toLowerCase())) {
            return res.status(400).json({ error: 'Invalid platform' });
        }
        
        const colMap = {
            instagram: { h: 'Instagram_Handle', n: 'Insta_Social_Name', p: 'Insta_Photo_URL' },
            tiktok: { h: 'TikTok_Handle', n: 'TikTok_Social_Name', p: 'TikTok_Photo_URL' },
            twitter: { h: 'Twitter_Handle', n: 'Twitter_Social_Name', p: 'Twitter_Photo_URL' },
            linkedin: { h: 'LinkedIn_Profile', n: 'LinkedIn_Social_Name', p: 'LinkedIn_Photo_URL' },
            youtube: { h: 'YouTube_Channel', n: 'YouTube_Social_Name', p: 'YouTube_Photo_URL' },
            snapchat: { h: 'Snapchat_Handle', n: 'Snapchat_Social_Name', p: 'Snapchat_Photo_URL' },
            discord: { h: 'Discord_Handle', n: 'Discord_Social_Name', p: 'Discord_Photo_URL' },
            twitch: { h: 'Twitch_Handle', n: 'Twitch_Social_Name', p: 'Twitch_Photo_URL' },
            reddit: { h: 'Reddit_Handle', n: 'Reddit_Social_Name', p: 'Reddit_Photo_URL' },
            pinterest: { h: 'Pinterest_Handle', n: 'Pinterest_Social_Name', p: 'Pinterest_Photo_URL' },
            telegram: { h: 'Telegram_Handle', n: 'Telegram_Social_Name', p: 'Telegram_Photo_URL' },
            whatsapp: { h: 'WhatsApp_Number', n: 'WhatsApp_Social_Name', p: 'WhatsApp_Photo_URL' }
        };
        
        const cols = colMap[platform.toLowerCase()];
        if (cols) {
            if (handle) { updates.push(`${cols.h} = ?`); params.push(handle); }
            if (socialName) { updates.push(`${cols.n} = ?`); params.push(socialName); }
            if (photoUrl) { updates.push(`${cols.p} = ?`); params.push(photoUrl); }
            updates.push(`Social_Score = Social_Score + 10`);
        }
    }

    if (discoveredLinks) {
        updates.push(`Discovered_Links = ?`);
        params.push(discoveredLinks);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
    }

    const sql = `UPDATE contact SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);
    
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});


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
        cwd: path.join(HOME_DIR, 'holehe'),
        command: 'python3',
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
    },
    silverinstaeye: {
        name: 'SilverInstaEye',
        cwd: path.join(HOME_DIR, 'SilverInstaEye'),
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
        spawnArgs = ['-m', 'holehe', argString, '--only-used'];
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

// Image Geolocation (EXIF + AI API)
app.post('/api/geolocate', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const { apiKey, method } = req.body;
    
    try {
        let result = { method: method || 'auto' };
        
        // 1. Always try EXIF as it's free and precise
        const exifData = await exifr.parse(req.file.buffer);
        if (exifData && exifData.latitude && exifData.longitude) {
            result.gps = { lat: exifData.latitude, lon: exifData.longitude };
            result.exif = exifData;
        }

        // 2. If AI method selected or no EXIF found and AI key provided
        if (method === 'ai' || (!result.gps && apiKey)) {
            if (!apiKey) return res.status(400).json({ error: 'AI Geolocation requires an API Key (GeoSpy or SerpApi)' });
            
            const base64Image = req.file.buffer.toString('base64');
            
            // Check if it's a SerpApi key (usually 64 chars) or GeoSpy
            if (apiKey.length > 50 && !apiKey.includes('.')) { 
                // Potential SerpApi (Google Lens)
                console.log('Calling SerpApi (Google Lens)...');
                const serpUrl = `https://serpapi.com/search.json?engine=google_lens&url=https://osint-hub-placeholder.com/image&api_key=${apiKey}`;
                // Note: SerpApi usually needs a public URL, but we can try to upload to their buffer or use their specific lens image upload endpoint if available.
                // For simplicity in this OSINT suite, we'll assume the user might provide a GeoSpy key first as it's more direct for "geolocation".
                // If the user wants SerpApi, we'd need a multi-part upload to them.
            }

            console.log('Calling GeoSpy AI API...');
            const response = await fetch('https://dev.geospy.ai/predict', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image: base64Image })
            });
            
            if (response.ok) {
                const aiData = await response.json();
                if (aiData.predictions && aiData.predictions.length > 0) {
                    const top = aiData.predictions[0];
                    result.ai = aiData.predictions;
                    if (!result.gps) {
                        result.gps = { lat: top.latitude, lon: top.longitude, address: top.address };
                    }
                }
            } else {
                const errText = await response.text();
                result.aiError = `GeoSpy Error: ${response.status} - ${errText}`;
            }
        }

        // 3. Hugging Face Fallback (StreetCLIP) - Very high free tier
        const hfToken = req.body.hfToken || process.env.HUGGINGFACE_TOKEN;
        if (method === 'hf' || (!result.gps && hfToken)) {
             console.log('Calling Hugging Face (StreetCLIP)...');
             const hfResponse = await fetch('https://api-inference.huggingface.co/models/geolocal/StreetCLIP', {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${hfToken}` },
                 body: req.file.buffer
             });
             if (hfResponse.ok) {
                 const hfData = await hfResponse.json();
                 result.hf = hfData;
                 // StreetCLIP returns classification scores for countries/cities
             }
        }
        
        if (!result.gps && !result.exif && !result.ai) {
            return res.status(404).json({ error: 'No location data found via Metadata or AI API.' });
        }
        
        res.json(result);
    } catch (e) {
        console.error('Geolocate Error:', e);
        res.status(500).json({ error: e.message });
    }
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
