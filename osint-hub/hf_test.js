const axios = require('axios');
const fs = require('fs');

async function testHF() {
    const model = "geolocal/StreetCLIP";
    const api_url = `https://api-inference.huggingface.co/models/${model}`;
    
    // Using a sample image or a dummy buffer if needed, but here just checking if we can hit it.
    try {
        const response = await axios.post(api_url, {
            inputs: "dummy data",
        }, {
            headers: { "Authorization": `Bearer ${process.env.HF_TOKEN}` }
        });
        console.log(response.data);
    } catch (e) {
        console.log("Status:", e.response ? e.response.status : "Error");
        console.log("Data:", e.response ? e.response.data : e.message);
    }
}
// testHF();
