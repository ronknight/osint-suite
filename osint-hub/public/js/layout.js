// Shared logic for tool pages

function initTool(toolId, outputId) {
    const form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.querySelector('input[name="arg"]');
        const btn = document.querySelector('button[type="submit"]');
        const outputDiv = document.getElementById(outputId);
        
        if (!input.value) return;

        // Reset UI
        btn.disabled = true;
        outputDiv.innerHTML = `<span class="text-gray-500">[*] Initializing ${toolId} scan for ${input.value}...</span>\n`;

        // Start SSE
        const evtSource = new EventSource(`/api/cli?tool=${toolId}&args=${encodeURIComponent(input.value)}`);

        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            outputDiv.textContent += data.text;
            outputDiv.scrollTop = outputDiv.scrollHeight;
        };

        evtSource.onerror = () => {
            evtSource.close();
            btn.disabled = false;
            outputDiv.textContent += '\n[*] Scan complete.';
        };
    });
}
